import { useAtom } from "jotai"
import {
  activeNodeIdAtom,
  currentWorkflowAtom,
  evalResultsAtom,
  finalContentAtom,
  nodeStatesAtom,
  pastRunsAtom,
  reportPathAtom,
  runStatusAtom,
  runtimeMetaAtom,
  selectedNodeIdAtom,
  workspaceAtom,
} from "@/lib/store"

export function useOutputPanel() {
  const [runStatus] = useAtom(runStatusAtom)
  const [nodeStates] = useAtom(nodeStatesAtom)
  const [activeNodeId] = useAtom(activeNodeIdAtom)
  const [selectedNodeId, setSelectedNodeId] = useAtom(selectedNodeIdAtom)
  const [finalContent] = useAtom(finalContentAtom)
  const [workflow] = useAtom(currentWorkflowAtom)
  const [evalResults] = useAtom(evalResultsAtom)
  const [runtimeMeta] = useAtom(runtimeMetaAtom)
  const [reportPath] = useAtom(reportPathAtom)
  const [pastRuns] = useAtom(pastRunsAtom)
  const [workspace] = useAtom(workspaceAtom)

  return {
    runStatus,
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
    workspace,
  }
}
