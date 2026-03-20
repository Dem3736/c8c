import { useCallback, useState } from "react"
import { useAtom, useSetAtom } from "jotai"
import { toast } from "sonner"
import {
  clearWorkflowTemplateContextForKeyAtom,
  currentWorkflowAtom,
  mainViewAtom,
  projectsAtom,
  selectedProjectAtom,
  selectedWorkflowPathAtom,
  setWorkflowTemplateContextForKeyAtom,
  viewModeAtom,
  workflowDirtyAtom,
  workflowOpenStateAtom,
  workflowSavedSnapshotAtom,
  workflowsAtom,
} from "@/lib/store"
import { createEmptyWorkflow } from "@/lib/default-workflow"
import { workflowSnapshot } from "@/lib/workflow-snapshot"
import {
  clearWorkflowExecutionStateAtom,
  toWorkflowExecutionKey,
} from "@/features/execution"

interface UseBlankWorkflowCreationArgs {
  confirmDiscard?: (action: string, workflowDirty: boolean) => Promise<boolean>
}

interface CreateBlankWorkflowOptions {
  projectPath?: string | null
}

export function useBlankWorkflowCreation({
  confirmDiscard,
}: UseBlankWorkflowCreationArgs = {}) {
  const [projects, setProjects] = useAtom(projectsAtom)
  const [selectedProject, setSelectedProject] = useAtom(selectedProjectAtom)
  const [, setWorkflows] = useAtom(workflowsAtom)
  const [, setCurrentWorkflow] = useAtom(currentWorkflowAtom)
  const [, setSelectedWorkflowPath] = useAtom(selectedWorkflowPathAtom)
  const [, setWorkflowSavedSnapshot] = useAtom(workflowSavedSnapshotAtom)
  const [, setMainView] = useAtom(mainViewAtom)
  const [, setViewMode] = useAtom(viewModeAtom)
  const [workflowDirty] = useAtom(workflowDirtyAtom)
  const clearWorkflowExecutionState = useSetAtom(clearWorkflowExecutionStateAtom)
  const clearWorkflowTemplateContextForKey = useSetAtom(clearWorkflowTemplateContextForKeyAtom)
  const setWorkflowTemplateContextForKey = useSetAtom(setWorkflowTemplateContextForKeyAtom)
  const setWorkflowOpenState = useSetAtom(workflowOpenStateAtom)
  const [creatingBlankWorkflow, setCreatingBlankWorkflow] = useState(false)

  const createBlankWorkflow = useCallback(async (
    options: CreateBlankWorkflowOptions = {},
  ) => {
    if (creatingBlankWorkflow) return null
    if (confirmDiscard && !(await confirmDiscard("create a blank flow", workflowDirty))) {
      return null
    }

    setCreatingBlankWorkflow(true)
    try {
      let projectPath: string | null = options.projectPath ?? selectedProject ?? projects[0] ?? null
      if (!projectPath) {
        projectPath = await window.api.addProject()
        if (!projectPath) return null
      }
      const resolvedProjectPath = projectPath

      if (!projects.includes(resolvedProjectPath)) {
        setProjects((previous) => (previous.includes(resolvedProjectPath) ? previous : [...previous, resolvedProjectPath]))
      }

      setSelectedProject(resolvedProjectPath)
      setWorkflowOpenState({
        status: "loading",
        targetPath: "Blank flow",
        message: null,
      })

      const nextWorkflow = createEmptyWorkflow()
      const filePath = await window.api.createWorkflow(resolvedProjectPath, "new-flow", nextWorkflow)
      const [loadedWorkflow, refreshedWorkflows] = await Promise.all([
        window.api.loadWorkflow(filePath),
        window.api.listProjectWorkflows(resolvedProjectPath),
      ])

      clearWorkflowExecutionState(toWorkflowExecutionKey(null))
      clearWorkflowTemplateContextForKey(toWorkflowExecutionKey(null))
      setWorkflowTemplateContextForKey({
        key: toWorkflowExecutionKey(filePath),
        context: null,
      })
      setWorkflows(refreshedWorkflows)
      setSelectedWorkflowPath(filePath)
      setCurrentWorkflow(loadedWorkflow)
      setWorkflowSavedSnapshot(workflowSnapshot(loadedWorkflow))
      setViewMode("list")
      setMainView("thread")
      setWorkflowOpenState({
        status: "idle",
        targetPath: null,
        message: null,
      })

      toast.success("Blank flow ready", {
        description: "Start by adding a skill or opening Graph.",
      })
      return filePath
    } catch (error) {
      setWorkflowOpenState({
        status: "error",
        targetPath: "Blank flow",
        message: String(error),
      })
      toast.error("Failed to create blank flow", {
        description: String(error),
      })
      return null
    } finally {
      setCreatingBlankWorkflow(false)
    }
  }, [
    clearWorkflowExecutionState,
    clearWorkflowTemplateContextForKey,
    confirmDiscard,
    creatingBlankWorkflow,
    projects,
    selectedProject,
    setCurrentWorkflow,
    setMainView,
    setProjects,
    setSelectedProject,
    setSelectedWorkflowPath,
    setViewMode,
    setWorkflowOpenState,
    setWorkflowSavedSnapshot,
    setWorkflowTemplateContextForKey,
    setWorkflows,
    workflowDirty,
  ])

  return {
    createBlankWorkflow,
    creatingBlankWorkflow,
  }
}
