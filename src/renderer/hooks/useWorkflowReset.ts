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
} from "@/lib/store"

/**
 * Resets ephemeral UI state when the selected workflow changes.
 * Execution state is kept per workflow so background runs remain intact.
 */
export function useWorkflowReset() {
  const [selectedWorkflowPath] = useAtom(selectedWorkflowPathAtom)
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
  const prevPathRef = useRef(selectedWorkflowPath)

  useEffect(() => {
    if (prevPathRef.current !== selectedWorkflowPath) {
      prevPathRef.current = selectedWorkflowPath

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
    }
  }, [
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
  ])
}
