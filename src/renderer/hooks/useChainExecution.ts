import { useCallback } from "react"
import { useAtom, useSetAtom } from "jotai"
import {
  currentWorkflowAtom,
  defaultProviderAtom,
  inputAttachmentsAtom,
  inputValueAtom,
  selectedProjectAtom,
  selectedWorkflowPathAtom,
  webSearchBackendAtom,
  activeExecutionProviderAtom,
} from "@/lib/store"
import {
  activeNodeIdAtom,
  approvalRequestsAtom,
  evalResultsAtom,
  nodeStatesAtom,
  pastRunsAtom,
  runIdAtom,
  runStatusAtom,
  updateWorkflowExecutionStateAtom,
  useExecutionController,
  useExecutionCommands,
  workflowExecutionStatesAtom,
  workspaceAtom,
  type WorkflowExecutionState,
} from "@/features/execution"

export function useChainExecution() {
  const [runStatus] = useAtom(runStatusAtom)
  const [runId] = useAtom(runIdAtom)
  const [nodeStates] = useAtom(nodeStatesAtom)
  const [activeNodeId] = useAtom(activeNodeIdAtom)
  const [workspace] = useAtom(workspaceAtom)
  const setPastRuns = useSetAtom(pastRunsAtom)
  const [evalResults] = useAtom(evalResultsAtom)
  const setApprovalRequests = useSetAtom(approvalRequestsAtom)
  const [workflow, setCurrentWorkflow] = useAtom(currentWorkflowAtom)
  const [inputValue] = useAtom(inputValueAtom)
  const [attachments] = useAtom(inputAttachmentsAtom)
  const [selectedProject] = useAtom(selectedProjectAtom)
  const [selectedWorkflowPath, setSelectedWorkflowPath] = useAtom(selectedWorkflowPathAtom)
  const [webSearchBackend] = useAtom(webSearchBackendAtom)
  const [workflowExecutionStates] = useAtom(workflowExecutionStatesAtom)
  const [defaultProvider] = useAtom(defaultProviderAtom)
  const updateWorkflowExecutionState = useSetAtom(updateWorkflowExecutionStateAtom)
  const setActiveExecutionProvider = useSetAtom(activeExecutionProviderAtom)

  const commitExecutionState = useCallback((workflowKey: string, nextState: WorkflowExecutionState) => {
    updateWorkflowExecutionState({ key: workflowKey, update: nextState })
  }, [updateWorkflowExecutionState])

  const controller = useExecutionController({
    workflowExecutionStates,
    selectedProject,
    commitExecutionState,
    updateApprovalRequests: setApprovalRequests,
    setPastRuns,
  })

  const { run, cancel, rerunFrom, continueRun, continueWithWorkflow } = useExecutionCommands({
    controller,
    defaultProvider,
    attachments,
    inputValue,
    runId,
    runStatus,
    setActiveExecutionProvider,
    selectedProject,
    setSelectedWorkflowPath,
    selectedWorkflowPath,
    setCurrentWorkflow,
    webSearchBackend,
    workflow,
    workspace,
  })

  return { runStatus, nodeStates, activeNodeId, evalResults, workspace, run, cancel, rerunFrom, continueRun, continueWithWorkflow }
}
