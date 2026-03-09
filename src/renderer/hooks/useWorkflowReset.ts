import { useEffect, useRef } from "react"
import { useAtom, useSetAtom } from "jotai"
import {
  batchErrorAtom,
  batchIdAtom,
  batchItemsAtom,
  batchProgressAtom,
  batchStatusAtom,
  batchSummaryAtom,
  chatMessagesAtom,
  chatSessionIdAtom,
  chatStatusAtom,
  chatUndoStackAtom,
  selectedWorkflowPathAtom,
  viewModeAtom,
} from "@/lib/store"
import { useExecutionReset } from "./useExecutionReset"

/**
 * Resets execution + output state when the selected workflow changes.
 * Input is intentionally NOT reset (often reused across workflows).
 */
export function useWorkflowReset() {
  const [selectedWorkflowPath] = useAtom(selectedWorkflowPathAtom)
  const resetExecutionState = useExecutionReset()
  const setChatMessages = useSetAtom(chatMessagesAtom)
  const setChatStatus = useSetAtom(chatStatusAtom)
  const setChatSessionId = useSetAtom(chatSessionIdAtom)
  const setChatUndoStack = useSetAtom(chatUndoStackAtom)
  const setBatchStatus = useSetAtom(batchStatusAtom)
  const setBatchId = useSetAtom(batchIdAtom)
  const setBatchError = useSetAtom(batchErrorAtom)
  const setBatchItems = useSetAtom(batchItemsAtom)
  const setBatchSummary = useSetAtom(batchSummaryAtom)
  const setBatchProgress = useSetAtom(batchProgressAtom)
  const setViewMode = useSetAtom(viewModeAtom)

  const prevPathRef = useRef(selectedWorkflowPath)

  useEffect(() => {
    if (prevPathRef.current !== selectedWorkflowPath) {
      prevPathRef.current = selectedWorkflowPath

      // Reset all execution state
      resetExecutionState()
      // Reset chat state atomically with workflow switch to avoid stale events.
      setChatMessages([])
      setChatStatus("idle")
      setChatSessionId(null)
      setChatUndoStack([])
      // Reset batch state for the newly selected workflow context.
      setBatchStatus("idle")
      setBatchId(null)
      setBatchError(null)
      setBatchItems([])
      setBatchSummary(null)
      setBatchProgress({ completed: 0, total: 0, running: 0 })
      setViewMode("list")
    }
  }, [
    resetExecutionState,
    selectedWorkflowPath,
    setBatchError,
    setBatchId,
    setBatchItems,
    setBatchProgress,
    setBatchStatus,
    setBatchSummary,
    setChatMessages,
    setChatSessionId,
    setChatStatus,
    setChatUndoStack,
    setViewMode,
  ])
}
