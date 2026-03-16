import { useAtom } from "jotai"
import {
  currentWorkflowAtom,
  selectedNodeIdAtom,
} from "@/lib/store"
import {
  activeNodeIdAtom,
  evalResultsAtom,
  finalContentAtom,
  nodeStatesAtom,
  reportPathAtom,
  runStatusAtom,
  runOutcomeAtom,
  runtimeMetaAtom,
  selectedPastRunAtom,
  workflowHistoryRunsAtom,
  workspaceAtom,
} from "@/features/execution"

export function useOutputPanel() {
  const [runStatus] = useAtom(runStatusAtom)
  const [runOutcome] = useAtom(runOutcomeAtom)
  const [nodeStates] = useAtom(nodeStatesAtom)
  const [activeNodeId] = useAtom(activeNodeIdAtom)
  const [selectedNodeId, setSelectedNodeId] = useAtom(selectedNodeIdAtom)
  const [finalContent] = useAtom(finalContentAtom)
  const [workflow] = useAtom(currentWorkflowAtom)
  const [evalResults] = useAtom(evalResultsAtom)
  const [runtimeMeta] = useAtom(runtimeMetaAtom)
  const [reportPath] = useAtom(reportPathAtom)
  const [pastRuns] = useAtom(workflowHistoryRunsAtom)
  const [selectedPastRun, setSelectedPastRun] = useAtom(selectedPastRunAtom)
  const [workspace] = useAtom(workspaceAtom)

  return {
    runStatus,
    runOutcome,
    nodeStates,
    activeNodeId,
    selectedNodeId,
    setSelectedNodeId,
    finalContent,
    workflow,
    evalResults,
    runtimeMeta,
    reportPath,
    pastRuns,
    selectedPastRun,
    setSelectedPastRun,
    workspace,
  }
}
