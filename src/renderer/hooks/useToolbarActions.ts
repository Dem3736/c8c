import { useCallback } from "react"
import { useSetAtom } from "jotai"
import type { Workflow, WorkflowFile, DiscoveredSkill } from "@shared/types"
import { toast } from "sonner"
import {
  clearWorkflowExecutionStateAtom,
  moveWorkflowExecutionStateAtom,
  toWorkflowExecutionKey,
} from "@/features/execution"
import {
  normalizeWorkflowTitle,
  toWorkflowFileStem,
} from "@shared/workflow-name"
import { createEmptyWorkflow } from "@/lib/default-workflow"
import { workflowSnapshot } from "@/lib/workflow-snapshot"
import { useInboxNotifications } from "@/hooks/useInboxNotifications"

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message
  }
  if (typeof error === "string" && error.trim()) {
    return error
  }
  return fallback
}

function showPersistentError(message: string, description?: string) {
  toast.error(message, {
    description,
    duration: Infinity,
  })
}

interface UseToolbarActionsArgs {
  workflow: Workflow
  workflowPath: string | null
  selectedProject: string | null
  setWorkflows: (next: WorkflowFile[]) => void
  setSkills: (next: DiscoveredSkill[]) => void
  setCurrentWorkflow: (next: Workflow | ((prev: Workflow) => Workflow)) => void
  setSelectedWorkflowPath: (next: string | null) => void
  setWorkflowSavedSnapshot: (next: string) => void
}

export function useToolbarActions({
  workflow,
  workflowPath,
  selectedProject,
  setWorkflows,
  setSkills,
  setCurrentWorkflow,
  setSelectedWorkflowPath,
  setWorkflowSavedSnapshot,
}: UseToolbarActionsArgs) {
  const moveWorkflowExecutionState = useSetAtom(moveWorkflowExecutionStateAtom)
  const clearWorkflowExecutionState = useSetAtom(clearWorkflowExecutionStateAtom)
  const { addNotification } = useInboxNotifications()
  const refreshProjectData = useCallback(async ({ silent = false }: { silent?: boolean } = {}) => {
    if (!selectedProject) return
    try {
      const [nextWorkflows, nextSkills] = await Promise.all([
        window.api.listProjectWorkflows(selectedProject),
        window.api.scanSkills(selectedProject),
      ])
      setWorkflows(nextWorkflows)
      setSkills(nextSkills)
      if (!silent) {
        toast.success("Refreshed")
      }
    } catch (error) {
      addNotification({
        title: "Project refresh failed",
        description: errorMessage(error, "Failed to refresh project data"),
        level: "error",
        source: "system",
      })
      showPersistentError(errorMessage(error, "Failed to refresh project data"))
    }
  }, [addNotification, selectedProject, setSkills, setWorkflows])

  const deriveTitleFromPath = useCallback((path: string) =>
    path
      .split(/[\\/]/)
      .pop()
      ?.replace(/\.(chain|yaml|yml)$/i, "")
      ?.trim() || "workflow", [])

  const ensureWorkflowNameSync = useCallback(async (path: string): Promise<string> => {
    const normalizedName = normalizeWorkflowTitle(workflow.name || "")
    if (!normalizedName) return path

    const currentStem = path
      .split(/[\\/]/)
      .pop()
      ?.replace(/\.(chain|yaml|yml)$/i, "")
      ?.toLowerCase()
    const desiredStem = toWorkflowFileStem(normalizedName).toLowerCase()
    if (!currentStem || currentStem === desiredStem) return path

    const renamedPath = await window.api.renameWorkflow(path, normalizedName)
    moveWorkflowExecutionState({
      fromKey: toWorkflowExecutionKey(path),
      toKey: toWorkflowExecutionKey(renamedPath),
    })
    setSelectedWorkflowPath(renamedPath)
    if (selectedProject) {
      const wfs = await window.api.listProjectWorkflows(selectedProject)
      setWorkflows(wfs)
    }
    return renamedPath
  }, [moveWorkflowExecutionState, selectedProject, setSelectedWorkflowPath, setWorkflows, workflow.name])

  const save = useCallback(async () => {
    if (!workflowPath) return false
    const workflowTitle = normalizeWorkflowTitle(workflow.name || "") || deriveTitleFromPath(workflowPath)
    try {
      const targetPath = await ensureWorkflowNameSync(workflowPath)
      await window.api.saveWorkflow(targetPath, workflow)
      setWorkflowSavedSnapshot(workflowSnapshot(workflow))
      toast.success(`Workflow saved: ${workflowTitle}`)
      addNotification({
        title: `Workflow saved: ${workflowTitle}`,
        level: "success",
        source: "workflow",
      })
      return true
    } catch (error) {
      addNotification({
        title: "Workflow save failed",
        description: errorMessage(error, "Failed to save workflow"),
        level: "error",
        source: "workflow",
      })
      showPersistentError(errorMessage(error, "Failed to save workflow"))
      return false
    }
  }, [addNotification, deriveTitleFromPath, ensureWorkflowNameSync, setWorkflowSavedSnapshot, workflow, workflowPath])

  const saveAs = useCallback(async () => {
    try {
      const filePath = await window.api.saveWorkflowAs(workflow, selectedProject || undefined)
      if (!filePath) return false
      const workflowTitle = normalizeWorkflowTitle(workflow.name || "") || deriveTitleFromPath(filePath)
      moveWorkflowExecutionState({
        fromKey: toWorkflowExecutionKey(workflowPath),
        toKey: toWorkflowExecutionKey(filePath),
      })
      setSelectedWorkflowPath(filePath)
      setWorkflowSavedSnapshot(workflowSnapshot(workflow))
      if (selectedProject) {
        const wfs = await window.api.listProjectWorkflows(selectedProject)
        setWorkflows(wfs)
      }
      toast.success(`Workflow saved as: ${workflowTitle}`)
      addNotification({
        title: `Workflow saved as: ${workflowTitle}`,
        description: filePath,
        level: "success",
        source: "workflow",
      })
      return true
    } catch (error) {
      addNotification({
        title: "Save as failed",
        description: errorMessage(error, "Failed to save workflow"),
        level: "error",
        source: "workflow",
      })
      showPersistentError(errorMessage(error, "Failed to save workflow"))
      return false
    }
  }, [addNotification, deriveTitleFromPath, moveWorkflowExecutionState, selectedProject, setSelectedWorkflowPath, setWorkflowSavedSnapshot, setWorkflows, workflow, workflowPath])

  const openFile = useCallback(async () => {
    try {
      const result = await window.api.openWorkflowFile()
      if (!result) return false
      setCurrentWorkflow(result.chain)
      setSelectedWorkflowPath(result.filePath)
      setWorkflowSavedSnapshot(workflowSnapshot(result.chain))
      if (selectedProject) {
        const wfs = await window.api.listProjectWorkflows(selectedProject)
        setWorkflows(wfs)
      }
      const workflowTitle = normalizeWorkflowTitle(result.chain.name || "") || deriveTitleFromPath(result.filePath)
      toast.success(`Workflow imported: ${workflowTitle}`)
      addNotification({
        title: `Workflow imported: ${workflowTitle}`,
        description: result.filePath,
        level: "success",
        source: "workflow",
      })
      return true
    } catch (error) {
      addNotification({
        title: "Workflow import failed",
        description: errorMessage(error, "Failed to import workflow"),
        level: "error",
        source: "workflow",
      })
      showPersistentError(errorMessage(error, "Failed to import workflow"))
      return false
    }
  }, [addNotification, selectedProject, setCurrentWorkflow, setSelectedWorkflowPath, setWorkflowSavedSnapshot, setWorkflows])

  const renameWorkflow = useCallback(async (nextName: string) => {
    if (!workflowPath) return false
    const trimmed = nextName.trim()
    const currentName = (workflow.name || "").trim() || deriveTitleFromPath(workflowPath)
    if (!trimmed || trimmed === currentName) return false

    try {
      const renamedPath = await window.api.renameWorkflow(workflowPath, trimmed)
      moveWorkflowExecutionState({
        fromKey: toWorkflowExecutionKey(workflowPath),
        toKey: toWorkflowExecutionKey(renamedPath),
      })
      setSelectedWorkflowPath(renamedPath)
      const renamedWorkflow = { ...workflow, name: trimmed }
      setCurrentWorkflow(renamedWorkflow)
      setWorkflowSavedSnapshot(workflowSnapshot(renamedWorkflow))
      await refreshProjectData({ silent: true })
      toast.success(`Workflow renamed: ${trimmed}`)
      addNotification({
        title: `Workflow renamed: ${trimmed}`,
        level: "success",
        source: "workflow",
      })
      return true
    } catch (error) {
      addNotification({
        title: "Workflow rename failed",
        description: errorMessage(error, "Failed to rename workflow"),
        level: "error",
        source: "workflow",
      })
      showPersistentError(errorMessage(error, "Failed to rename workflow"))
      return false
    }
  }, [addNotification, deriveTitleFromPath, moveWorkflowExecutionState, refreshProjectData, setCurrentWorkflow, setSelectedWorkflowPath, setWorkflowSavedSnapshot, workflow, workflow.name, workflowPath])

  const deleteWorkflow = useCallback(async () => {
    if (!workflowPath) return false
    const workflowTitle = (workflow.name || "").trim() || deriveTitleFromPath(workflowPath)
    try {
      await window.api.deleteWorkflow(workflowPath)
      clearWorkflowExecutionState(toWorkflowExecutionKey(workflowPath))
      setSelectedWorkflowPath(null)
      setCurrentWorkflow(createEmptyWorkflow())
      setWorkflowSavedSnapshot(workflowSnapshot(createEmptyWorkflow()))
      await refreshProjectData({ silent: true })
      toast.success(`Workflow deleted: ${workflowTitle}`)
      addNotification({
        title: `Workflow deleted: ${workflowTitle}`,
        level: "success",
        source: "workflow",
      })
      return true
    } catch (error) {
      addNotification({
        title: "Workflow delete failed",
        description: errorMessage(error, "Failed to delete workflow"),
        level: "error",
        source: "workflow",
      })
      showPersistentError(errorMessage(error, "Failed to delete workflow"))
      return false
    }
  }, [addNotification, clearWorkflowExecutionState, deriveTitleFromPath, refreshProjectData, setCurrentWorkflow, setSelectedWorkflowPath, setWorkflowSavedSnapshot, workflow.name, workflowPath])

  return {
    refreshProjectData,
    deriveTitleFromPath,
    save,
    saveAs,
    openFile,
    renameWorkflow,
    deleteWorkflow,
  }
}
