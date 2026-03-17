import { useCallback } from "react"
import { useAtom, useSetAtom } from "jotai"
import {
  mainViewAtom,
  selectedProjectAtom,
  selectedResultModeIdAtom,
  workflowCreateContextAtom,
  workflowCreateDraftPromptAtom,
} from "@/lib/store"
import type { ResultModeId } from "@shared/types"

interface OpenWorkflowCreateOptions {
  projectPath?: string | null
  locked?: boolean
  prompt?: string
  modeId?: ResultModeId
}

export function useWorkflowCreateNavigation() {
  const [selectedProject] = useAtom(selectedProjectAtom)
  const setMainView = useSetAtom(mainViewAtom)
  const setSelectedResultModeId = useSetAtom(selectedResultModeIdAtom)
  const setWorkflowCreateContext = useSetAtom(workflowCreateContextAtom)
  const setWorkflowCreateDraftPrompt = useSetAtom(workflowCreateDraftPromptAtom)

  const openWorkflowCreate = useCallback((options: OpenWorkflowCreateOptions = {}) => {
    const projectPath = options.projectPath ?? selectedProject ?? null
    if (options.modeId) {
      setSelectedResultModeId(options.modeId)
    }
    setWorkflowCreateContext({
      projectPath,
      locked: Boolean(options.locked && projectPath),
    })
    setWorkflowCreateDraftPrompt(options.prompt ?? "")
    setMainView("workflow_create")
  }, [
    selectedProject,
    setMainView,
    setSelectedResultModeId,
    setWorkflowCreateContext,
    setWorkflowCreateDraftPrompt,
  ])

  return { openWorkflowCreate }
}
