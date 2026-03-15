import { useCallback } from "react"
import { useAtom, useSetAtom } from "jotai"
import {
  mainViewAtom,
  selectedProjectAtom,
  workflowCreateContextAtom,
  workflowCreateDraftPromptAtom,
} from "@/lib/store"

interface OpenWorkflowCreateOptions {
  projectPath?: string | null
  locked?: boolean
  prompt?: string
}

export function useWorkflowCreateNavigation() {
  const [selectedProject] = useAtom(selectedProjectAtom)
  const setMainView = useSetAtom(mainViewAtom)
  const setWorkflowCreateContext = useSetAtom(workflowCreateContextAtom)
  const setWorkflowCreateDraftPrompt = useSetAtom(workflowCreateDraftPromptAtom)

  const openWorkflowCreate = useCallback((options: OpenWorkflowCreateOptions = {}) => {
    const projectPath = options.projectPath ?? selectedProject ?? null
    setWorkflowCreateContext({
      projectPath,
      locked: Boolean(options.locked && projectPath),
    })
    setWorkflowCreateDraftPrompt(options.prompt ?? "")
    setMainView("workflow_create")
  }, [
    selectedProject,
    setMainView,
    setWorkflowCreateContext,
    setWorkflowCreateDraftPrompt,
  ])

  return { openWorkflowCreate }
}
