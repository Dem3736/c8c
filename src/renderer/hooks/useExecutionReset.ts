import { useCallback } from "react"
import { useSetAtom } from "jotai"
import {
  activeNodeIdAtom,
  evalResultsAtom,
  finalContentAtom,
  nodeStatesAtom,
  reportPathAtom,
  runIdAtom,
  runStatusAtom,
  runtimeEdgesAtom,
  runtimeMetaAtom,
  runtimeNodesAtom,
  selectedNodeIdAtom,
  selectedPastRunAtom,
} from "@/lib/store"

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
    setRuntimeEdges,
    setRuntimeMeta,
    setRuntimeNodes,
    setRunStatus,
    setSelectedNodeId,
    setSelectedPastRun,
  ])
}
