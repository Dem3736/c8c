import { useCallback } from "react"
import { useSetAtom } from "jotai"
import { selectedNodeIdAtom } from "@/lib/store"
import {
  activeNodeIdAtom,
  evalResultsAtom,
  finalContentAtom,
  nodeStatesAtom,
  reportPathAtom,
  runIdAtom,
  runWorkflowPathAtom,
  runStatusAtom,
  runtimeEdgesAtom,
  runtimeMetaAtom,
  runtimeNodesAtom,
  selectedPastRunAtom,
} from "@/features/execution"

interface UseExecutionResetOptions {
  clearReportPath?: boolean
  clearSelectedPastRun?: boolean
}

export function useExecutionReset({
  clearReportPath = false,
  clearSelectedPastRun = false,
}: UseExecutionResetOptions = {}) {
  const setRunStatus = useSetAtom(runStatusAtom)
  const setRunId = useSetAtom(runIdAtom)
  const setRunWorkflowPath = useSetAtom(runWorkflowPathAtom)
  const setFinalContent = useSetAtom(finalContentAtom)
  const setNodeStates = useSetAtom(nodeStatesAtom)
  const setActiveNodeId = useSetAtom(activeNodeIdAtom)
  const setSelectedNodeId = useSetAtom(selectedNodeIdAtom)
  const setReportPath = useSetAtom(reportPathAtom)
  const setSelectedPastRun = useSetAtom(selectedPastRunAtom)
  const setEvalResults = useSetAtom(evalResultsAtom)
  const setRuntimeNodes = useSetAtom(runtimeNodesAtom)
  const setRuntimeEdges = useSetAtom(runtimeEdgesAtom)
  const setRuntimeMeta = useSetAtom(runtimeMetaAtom)

  return useCallback(() => {
    setRunStatus("idle")
    setRunId(null)
    setRunWorkflowPath(null)
    setFinalContent("")
    setNodeStates({})
    setActiveNodeId(null)
    setSelectedNodeId(null)
    setEvalResults({})
    setRuntimeNodes([])
    setRuntimeEdges([])
    setRuntimeMeta({})

    if (clearReportPath) {
      setReportPath(null)
    }
    if (clearSelectedPastRun) {
      setSelectedPastRun(null)
    }
  }, [
    clearReportPath,
    clearSelectedPastRun,
    setActiveNodeId,
    setEvalResults,
    setFinalContent,
    setNodeStates,
    setReportPath,
    setRunId,
    setRunWorkflowPath,
    setRuntimeEdges,
    setRuntimeMeta,
    setRuntimeNodes,
    setRunStatus,
    setSelectedNodeId,
    setSelectedPastRun,
  ])
}
