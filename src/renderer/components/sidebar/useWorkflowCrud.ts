import {
  useState,
  type Dispatch,
  type SetStateAction,
} from "react"
import type { MainView } from "@/lib/store"
import type { Workflow, WorkflowFile } from "@shared/types"
import { toast } from "sonner"
import { createEmptyWorkflow } from "@/lib/default-workflow"
import { workflowSnapshot } from "@/lib/workflow-snapshot"
import { toWorkflowExecutionKey } from "@/features/execution"

interface UseWorkflowCrudParams {
  selectedProject: string | null
  setProjects: Dispatch<SetStateAction<string[]>>
  setSelectedProject: Dispatch<SetStateAction<string | null>>
  setExpandedProjects: Dispatch<SetStateAction<string[]>>
  setWorkflows: Dispatch<SetStateAction<WorkflowFile[]>>
  setProjectWorkflowsCache: Dispatch<SetStateAction<Record<string, WorkflowFile[]>>>
  selectedWorkflowPath: string | null
  setSelectedWorkflowPath: Dispatch<SetStateAction<string | null>>
  currentWorkflow: Workflow
  setCurrentWorkflow: Dispatch<SetStateAction<Workflow>>
  setWorkflowSavedSnapshot: Dispatch<SetStateAction<string>>
  setMainView: Dispatch<SetStateAction<MainView>>
  workflowDirty: boolean
  confirmDiscard: (action: string, workflowDirty: boolean) => Promise<boolean>
  clearDraftExecutionState: () => void
  workflowHasActiveRun: (workflowPath: string) => boolean
  moveWorkflowExecutionState: (params: { fromKey: string; toKey: string }) => void
  clearWorkflowExecutionState: (workflowKey: string) => void
  onProjectAdd?: (projectPath: string) => void
  onWorkflowCreate?: (workflowPath: string) => void
}

export function createEmptySelectionState(
  setSelectedWorkflowPath: Dispatch<SetStateAction<string | null>>,
  setCurrentWorkflow: Dispatch<SetStateAction<Workflow>>,
  setWorkflowSavedSnapshot: Dispatch<SetStateAction<string>>,
  clearDraftExecutionState: () => void,
): void {
  setSelectedWorkflowPath(null)
  const emptyWorkflow = createEmptyWorkflow()
  setCurrentWorkflow(emptyWorkflow)
  setWorkflowSavedSnapshot(workflowSnapshot(emptyWorkflow))
  clearDraftExecutionState()
}

export function applyLoadedWorkflow(
  workflowPath: string,
  workflow: Workflow,
  setSelectedWorkflowPath: Dispatch<SetStateAction<string | null>>,
  setCurrentWorkflow: Dispatch<SetStateAction<Workflow>>,
  setWorkflowSavedSnapshot: Dispatch<SetStateAction<string>>,
): void {
  // Execution state is keyed by workflow path and must survive workflow switches.
  setSelectedWorkflowPath(workflowPath)
  setCurrentWorkflow(workflow)
  setWorkflowSavedSnapshot(workflowSnapshot(workflow))
}

export function useWorkflowCrud({
  selectedProject,
  setProjects,
  setSelectedProject,
  setExpandedProjects,
  setWorkflows,
  setProjectWorkflowsCache,
  selectedWorkflowPath,
  setSelectedWorkflowPath,
  currentWorkflow,
  setCurrentWorkflow,
  setWorkflowSavedSnapshot,
  setMainView,
  workflowDirty,
  confirmDiscard,
  clearDraftExecutionState,
  workflowHasActiveRun,
  moveWorkflowExecutionState,
  clearWorkflowExecutionState,
  onProjectAdd,
  onWorkflowCreate,
}: UseWorkflowCrudParams) {
  const [pendingRenameWorkflow, setPendingRenameWorkflow] = useState<WorkflowFile | null>(null)
  const [renameInput, setRenameInput] = useState("")
  const [pendingDeleteWorkflow, setPendingDeleteWorkflow] = useState<WorkflowFile | null>(null)
  const [pendingRemoveProject, setPendingRemoveProject] = useState<string | null>(null)
  const [creatingWorkflow, setCreatingWorkflow] = useState(false)

  const addProject = async () => {
    if (selectedProject && !(await confirmDiscard("switch projects", workflowDirty))) {
      return
    }

    try {
      const projectPath = await window.api.addProject()
      if (!projectPath) return

      setProjects((prev) => (prev.includes(projectPath) ? prev : [...prev, projectPath]))
      setSelectedProject(projectPath)
      createEmptySelectionState(
        setSelectedWorkflowPath,
        setCurrentWorkflow,
        setWorkflowSavedSnapshot,
        clearDraftExecutionState,
      )
      onProjectAdd?.(projectPath)
    } catch (error) {
      toast.error(`Failed to add project: ${String(error)}`)
    }
  }

  const requestRemoveProject = (projectPath: string) => {
    setPendingRemoveProject(projectPath)
  }

  const commitRemoveProject = async () => {
    const projectPath = pendingRemoveProject
    if (!projectPath) return
    setPendingRemoveProject(null)

    try {
      await window.api.removeProject(projectPath)
      setProjects((prev) => prev.filter((path) => path !== projectPath))
      setExpandedProjects((prev) => prev.filter((path) => path !== projectPath))
      setProjectWorkflowsCache((prev) => {
        const next = { ...prev }
        delete next[projectPath]
        return next
      })
    } catch (error) {
      toast.error(`Failed to remove project: ${String(error)}`)
      return
    }

    if (selectedProject !== projectPath) return

    setSelectedProject(null)
    setWorkflows([])
    createEmptySelectionState(
      setSelectedWorkflowPath,
      setCurrentWorkflow,
      setWorkflowSavedSnapshot,
      clearDraftExecutionState,
    )
  }

  const selectWorkflow = async (workflow: WorkflowFile, projectPath?: string) => {
    if (selectedWorkflowPath === workflow.path) {
      setMainView("thread")
      return
    }
    if (!(await confirmDiscard("open another workflow", workflowDirty))) {
      return
    }

    if (projectPath && selectedProject !== projectPath) {
      setSelectedProject(projectPath)
    }

    setMainView("thread")
    try {
      const loadedWorkflow = await window.api.loadWorkflow(workflow.path)
      applyLoadedWorkflow(
        workflow.path,
        loadedWorkflow,
        setSelectedWorkflowPath,
        setCurrentWorkflow,
        setWorkflowSavedSnapshot,
      )
    } catch (error) {
      toast.error(`Failed to open workflow: ${String(error)}`)
    }
  }

  const createWorkflow = async (projectPath: string) => {
    if (creatingWorkflow) return
    if (!(await confirmDiscard("create a new workflow", workflowDirty))) {
      return
    }

    setCreatingWorkflow(true)
    try {
      const name = "new-workflow"
      const chain = createEmptyWorkflow()
      const filePath = await window.api.createWorkflow(projectPath, name, chain)
      const loadedWorkflow = await window.api.loadWorkflow(filePath)
      const workflowNameFromPath = filePath
        .split(/[\\/]/)
        .pop()
        ?.replace(/\.(chain|yaml|yml)$/i, "") || name

      setMainView("thread")
      setWorkflows((prev) => [
        { name: loadedWorkflow.name || workflowNameFromPath, path: filePath, updatedAt: Date.now() },
        ...prev,
      ])
      applyLoadedWorkflow(
        filePath,
        loadedWorkflow,
        setSelectedWorkflowPath,
        setCurrentWorkflow,
        setWorkflowSavedSnapshot,
      )
      onWorkflowCreate?.(filePath)
      setPendingRenameWorkflow({
        name: loadedWorkflow.name || workflowNameFromPath,
        path: filePath,
        updatedAt: Date.now(),
      })
    } catch (error) {
      toast.error(`Failed to create workflow: ${String(error)}`)
    } finally {
      setCreatingWorkflow(false)
    }
  }

  const createNewWorkflow = async () => {
    if (selectedProject) {
      await createWorkflow(selectedProject)
      return
    }

    const projectPath = await window.api.addProject()
    if (!projectPath) return

    setProjects((prev) => (prev.includes(projectPath) ? prev : [...prev, projectPath]))
    setSelectedProject(projectPath)
    await createWorkflow(projectPath)
  }

  const selectGlobalWorkflow = async (workflow: WorkflowFile) => {
    if (!selectedProject) {
      toast.error("Open a project first to run a global workflow")
      return
    }
    if (selectedWorkflowPath === workflow.path) {
      setMainView("thread")
      return
    }
    if (!(await confirmDiscard("open another workflow", workflowDirty))) {
      return
    }

    setMainView("thread")
    try {
      const loadedWorkflow = await window.api.loadWorkflow(workflow.path)
      applyLoadedWorkflow(
        workflow.path,
        loadedWorkflow,
        setSelectedWorkflowPath,
        setCurrentWorkflow,
        setWorkflowSavedSnapshot,
      )
    } catch (error) {
      toast.error(`Failed to open workflow: ${String(error)}`)
    }
  }

  const requestRenameWorkflow = (workflow: WorkflowFile) => {
    if (workflowHasActiveRun(workflow.path)) {
      toast.error("Stop the workflow before renaming it")
      return
    }
    setRenameInput(workflow.name)
    setPendingRenameWorkflow(workflow)
  }

  const commitRenameWorkflow = async () => {
    const workflow = pendingRenameWorkflow
    if (!workflow) return
    const nextName = renameInput.trim()
    if (!nextName || nextName === workflow.name) {
      setPendingRenameWorkflow(null)
      return
    }
    if (workflowHasActiveRun(workflow.path)) {
      toast.error("Stop the workflow before renaming it")
      setPendingRenameWorkflow(null)
      return
    }

    try {
      const renamedPath = await window.api.renameWorkflow(workflow.path, nextName)
      moveWorkflowExecutionState({
        fromKey: toWorkflowExecutionKey(workflow.path),
        toKey: toWorkflowExecutionKey(renamedPath),
      })

      if (selectedProject) {
        const refreshed = await window.api.listProjectWorkflows(selectedProject)
        setWorkflows(refreshed)
      }

      if (selectedWorkflowPath === workflow.path) {
        setSelectedWorkflowPath(renamedPath)
        const renamedWorkflow = { ...currentWorkflow, name: nextName }
        setCurrentWorkflow(renamedWorkflow)
        setWorkflowSavedSnapshot(workflowSnapshot(renamedWorkflow))
      }

      setPendingRenameWorkflow(null)
      toast.success(`Workflow renamed: ${nextName}`)
    } catch (error) {
      toast.error(`Failed to rename workflow: ${String(error)}`)
    }
  }

  const requestDeleteWorkflow = (workflow: WorkflowFile) => {
    if (workflowHasActiveRun(workflow.path)) {
      toast.error("Stop the workflow before deleting it")
      return
    }
    setPendingDeleteWorkflow(workflow)
  }

  const commitDeleteWorkflow = async () => {
    const workflow = pendingDeleteWorkflow
    if (!workflow) return
    setPendingDeleteWorkflow(null)
    if (workflowHasActiveRun(workflow.path)) {
      toast.error("Stop the workflow before deleting it")
      return
    }

    try {
      await window.api.deleteWorkflow(workflow.path)
      clearWorkflowExecutionState(toWorkflowExecutionKey(workflow.path))

      if (selectedProject) {
        const refreshed = await window.api.listProjectWorkflows(selectedProject)
        setWorkflows(refreshed)
      }

      if (selectedWorkflowPath === workflow.path) {
        createEmptySelectionState(
          setSelectedWorkflowPath,
          setCurrentWorkflow,
          setWorkflowSavedSnapshot,
          clearDraftExecutionState,
        )
      }

      toast.success(`Workflow deleted: ${workflow.name}`)
    } catch (error) {
      toast.error(`Failed to delete workflow: ${String(error)}`)
    }
  }

  const duplicateWorkflow = async (workflow: WorkflowFile, projectPath?: string) => {
    try {
      const newPath = await window.api.duplicateWorkflow(workflow.path)
      if (projectPath) {
        const refreshed = await window.api.listProjectWorkflows(projectPath)
        if (projectPath === selectedProject) {
          setWorkflows(refreshed)
        } else {
          setProjectWorkflowsCache((prev) => ({ ...prev, [projectPath]: refreshed }))
        }
      }

      const loadedWorkflow = await window.api.loadWorkflow(newPath)
      if (projectPath && projectPath !== selectedProject) {
        setSelectedProject(projectPath)
      }
      setSelectedWorkflowPath(newPath)
      setCurrentWorkflow(loadedWorkflow)
      setWorkflowSavedSnapshot(workflowSnapshot(loadedWorkflow))
      setMainView("thread")
      toast.success("Workflow duplicated")
    } catch (error) {
      toast.error("Failed to duplicate workflow", { description: String(error) })
    }
  }

  return {
    pendingRenameWorkflow,
    setPendingRenameWorkflow,
    renameInput,
    setRenameInput,
    pendingDeleteWorkflow,
    setPendingDeleteWorkflow,
    pendingRemoveProject,
    setPendingRemoveProject,
    creatingWorkflow,
    addProject,
    requestRemoveProject,
    commitRemoveProject,
    selectWorkflow,
    createNewWorkflow,
    selectGlobalWorkflow,
    requestRenameWorkflow,
    commitRenameWorkflow,
    requestDeleteWorkflow,
    commitDeleteWorkflow,
    duplicateWorkflow,
  }
}
