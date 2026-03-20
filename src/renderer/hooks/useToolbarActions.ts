import { useCallback } from "react"
import { useSetAtom } from "jotai"
import type { Workflow, WorkflowFile, DiscoveredSkill } from "@shared/types"
import { toast } from "sonner"
import { errorToUserMessage } from "@/lib/error-message"
import { toastError } from "@/lib/toast-error"
import {
  clearWorkflowTemplateContextForKeyAtom,
  moveWorkflowTemplateContextAtom,
} from "@/lib/store"
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
  const moveWorkflowTemplateContext = useSetAtom(moveWorkflowTemplateContextAtom)
  const clearWorkflowTemplateContextForKey = useSetAtom(clearWorkflowTemplateContextForKeyAtom)
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
        description: errorToUserMessage(error, "Could not refresh project data"),
        level: "error",
        source: "system",
      })
      toastError(errorToUserMessage(error, "Could not refresh project data"))
    }
  }, [addNotification, selectedProject, setSkills, setWorkflows])

  const deriveTitleFromPath = useCallback((path: string) =>
    path
      .split(/[\\/]/)
      .pop()
      ?.replace(/\.(chain|yaml|yml)$/i, "")
      ?.trim() || "flow", [])

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
    moveWorkflowTemplateContext({
      fromKey: toWorkflowExecutionKey(path),
      toKey: toWorkflowExecutionKey(renamedPath),
    })
    setSelectedWorkflowPath(renamedPath)
    if (selectedProject) {
      const wfs = await window.api.listProjectWorkflows(selectedProject)
      setWorkflows(wfs)
    }
    return renamedPath
  }, [moveWorkflowExecutionState, moveWorkflowTemplateContext, selectedProject, setSelectedWorkflowPath, setWorkflows, workflow.name])

  const save = useCallback(async () => {
    if (!workflowPath) return false
    const workflowTitle = normalizeWorkflowTitle(workflow.name || "") || deriveTitleFromPath(workflowPath)
    try {
      const targetPath = await ensureWorkflowNameSync(workflowPath)
      const savedPath = await window.api.saveWorkflow(targetPath, workflow)
      if (savedPath !== targetPath) {
        moveWorkflowExecutionState({
          fromKey: toWorkflowExecutionKey(targetPath),
          toKey: toWorkflowExecutionKey(savedPath),
        })
        moveWorkflowTemplateContext({
          fromKey: toWorkflowExecutionKey(targetPath),
          toKey: toWorkflowExecutionKey(savedPath),
        })
        setSelectedWorkflowPath(savedPath)
        if (selectedProject) {
          const wfs = await window.api.listProjectWorkflows(selectedProject)
          setWorkflows(wfs)
        }
      }
      setWorkflowSavedSnapshot(workflowSnapshot(workflow))
      toast.success(`Flow saved: ${workflowTitle}`)
      return true
    } catch (error) {
      addNotification({
        title: "Flow save failed",
        description: errorToUserMessage(error, "Could not save flow"),
        level: "error",
        source: "workflow",
      })
      toastError(errorToUserMessage(error, "Could not save flow"))
      return false
    }
  }, [addNotification, deriveTitleFromPath, ensureWorkflowNameSync, moveWorkflowExecutionState, moveWorkflowTemplateContext, selectedProject, setSelectedWorkflowPath, setWorkflowSavedSnapshot, setWorkflows, workflow, workflowPath])

  const saveAs = useCallback(async () => {
    try {
      const filePath = await window.api.saveWorkflowAs(workflow, selectedProject || undefined)
      if (!filePath) return false
      const workflowTitle = normalizeWorkflowTitle(workflow.name || "") || deriveTitleFromPath(filePath)
      moveWorkflowExecutionState({
        fromKey: toWorkflowExecutionKey(workflowPath),
        toKey: toWorkflowExecutionKey(filePath),
      })
      moveWorkflowTemplateContext({
        fromKey: toWorkflowExecutionKey(workflowPath),
        toKey: toWorkflowExecutionKey(filePath),
      })
      setSelectedWorkflowPath(filePath)
      setWorkflowSavedSnapshot(workflowSnapshot(workflow))
      if (selectedProject) {
        const wfs = await window.api.listProjectWorkflows(selectedProject)
        setWorkflows(wfs)
      }
      toast.success(`Flow saved as: ${workflowTitle}`)
      return true
    } catch (error) {
      addNotification({
        title: "Save as failed",
        description: errorToUserMessage(error, "Could not save flow"),
        level: "error",
        source: "workflow",
      })
      toastError(errorToUserMessage(error, "Could not save flow"))
      return false
    }
  }, [addNotification, deriveTitleFromPath, moveWorkflowExecutionState, moveWorkflowTemplateContext, selectedProject, setSelectedWorkflowPath, setWorkflowSavedSnapshot, setWorkflows, workflow, workflowPath])

  const exportCopy = useCallback(async () => {
    const loadingToastId = toast.loading("Exporting flow copy...")
    try {
      const filePath = await window.api.exportWorkflowCopy(workflow, selectedProject || undefined)
      toast.dismiss(loadingToastId)
      if (!filePath) return false
      const workflowTitle = normalizeWorkflowTitle(workflow.name || "") || deriveTitleFromPath(filePath)
      toast.success(`Flow exported: ${workflowTitle}`, {
        description: filePath,
      })
      return true
    } catch (error) {
      toast.dismiss(loadingToastId)
      addNotification({
        title: "Flow export failed",
        description: errorToUserMessage(error, "Could not export flow"),
        level: "error",
        source: "workflow",
      })
      toastError(errorToUserMessage(error, "Could not export flow"))
      return false
    }
  }, [addNotification, deriveTitleFromPath, selectedProject, workflow])

  const openFile = useCallback(async () => {
    const loadingToastId = toast.loading("Importing flow...")
    try {
      const result = await window.api.openWorkflowFile()
      toast.dismiss(loadingToastId)
      if (!result) return false
      clearWorkflowExecutionState(toWorkflowExecutionKey(null))
      clearWorkflowTemplateContextForKey(toWorkflowExecutionKey(null))
      setCurrentWorkflow(result.chain)
      setSelectedWorkflowPath(null)
      setWorkflowSavedSnapshot(workflowSnapshot(createEmptyWorkflow()))
      clearWorkflowTemplateContextForKey(toWorkflowExecutionKey(result.filePath))
      if (selectedProject) {
        const wfs = await window.api.listProjectWorkflows(selectedProject)
        setWorkflows(wfs)
      }
      const workflowTitle = normalizeWorkflowTitle(result.chain.name || "") || deriveTitleFromPath(result.filePath)
      toast.success(`Flow imported as draft: ${workflowTitle}`, {
        description: "Save it to keep it in this project.",
      })
      return true
    } catch (error) {
      toast.dismiss(loadingToastId)
      addNotification({
        title: "Flow import failed",
        description: errorToUserMessage(error, "Could not import flow"),
        level: "error",
        source: "workflow",
      })
      toastError(errorToUserMessage(error, "Could not import flow"))
      return false
    }
  }, [addNotification, clearWorkflowExecutionState, clearWorkflowTemplateContextForKey, deriveTitleFromPath, selectedProject, setCurrentWorkflow, setSelectedWorkflowPath, setWorkflowSavedSnapshot, setWorkflows])

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
      moveWorkflowTemplateContext({
        fromKey: toWorkflowExecutionKey(workflowPath),
        toKey: toWorkflowExecutionKey(renamedPath),
      })
      setSelectedWorkflowPath(renamedPath)
      const renamedWorkflow = { ...workflow, name: trimmed }
      setCurrentWorkflow(renamedWorkflow)
      setWorkflowSavedSnapshot(workflowSnapshot(renamedWorkflow))
      await refreshProjectData({ silent: true })
      toast.success(`Flow renamed: ${trimmed}`)
      return true
    } catch (error) {
      addNotification({
        title: "Flow rename failed",
        description: errorToUserMessage(error, "Could not rename flow"),
        level: "error",
        source: "workflow",
      })
      toastError(errorToUserMessage(error, "Could not rename flow"))
      return false
    }
  }, [addNotification, deriveTitleFromPath, moveWorkflowExecutionState, moveWorkflowTemplateContext, refreshProjectData, setCurrentWorkflow, setSelectedWorkflowPath, setWorkflowSavedSnapshot, workflow, workflow.name, workflowPath])

  const deleteWorkflow = useCallback(async () => {
    if (!workflowPath) return false
    const workflowTitle = (workflow.name || "").trim() || deriveTitleFromPath(workflowPath)
    try {
      await window.api.deleteWorkflow(workflowPath)
      clearWorkflowExecutionState(toWorkflowExecutionKey(workflowPath))
      clearWorkflowTemplateContextForKey(toWorkflowExecutionKey(workflowPath))
      setSelectedWorkflowPath(null)
      setCurrentWorkflow(createEmptyWorkflow())
      setWorkflowSavedSnapshot(workflowSnapshot(createEmptyWorkflow()))
      await refreshProjectData({ silent: true })
      toast.success(`Flow deleted: ${workflowTitle}`)
      return true
    } catch (error) {
      addNotification({
        title: "Flow delete failed",
        description: errorToUserMessage(error, "Could not delete flow"),
        level: "error",
        source: "workflow",
      })
      toastError(errorToUserMessage(error, "Could not delete flow"))
      return false
    }
  }, [addNotification, clearWorkflowExecutionState, clearWorkflowTemplateContextForKey, deriveTitleFromPath, refreshProjectData, setCurrentWorkflow, setSelectedWorkflowPath, setWorkflowSavedSnapshot, workflow.name, workflowPath])

  return {
    refreshProjectData,
    deriveTitleFromPath,
    save,
    saveAs,
    exportCopy,
    openFile,
    renameWorkflow,
    deleteWorkflow,
  }
}
