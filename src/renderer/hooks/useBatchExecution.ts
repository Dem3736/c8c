import { useEffect, useCallback, useRef } from "react"
import { useAtom, useSetAtom } from "jotai"
import {
  batchStatusAtom,
  batchIdAtom,
  batchErrorAtom,
  batchItemsAtom,
  batchSummaryAtom,
  batchProgressAtom,
  currentWorkflowAtom,
  selectedProjectAtom,
  selectedWorkflowPathAtom,
} from "@/lib/store"
import type { BatchEvent } from "@shared/types"
import type { WorkflowInput } from "@shared/types"
import { toast } from "sonner"

export function useBatchExecution() {
  const [batchStatus, setBatchStatus] = useAtom(batchStatusAtom)
  const [batchId, setBatchId] = useAtom(batchIdAtom)
  const setBatchError = useSetAtom(batchErrorAtom)
  const setBatchItems = useSetAtom(batchItemsAtom)
  const setBatchSummary = useSetAtom(batchSummaryAtom)
  const setBatchProgress = useSetAtom(batchProgressAtom)
  const [workflow] = useAtom(currentWorkflowAtom)
  const [selectedProject] = useAtom(selectedProjectAtom)
  const [selectedWorkflowPath] = useAtom(selectedWorkflowPathAtom)
  const batchIdRef = useRef<string | null>(batchId)
  const pendingBatchRef = useRef(false)
  const pendingBatchEventsRef = useRef<BatchEvent[]>([])
  batchIdRef.current = batchId

  const clearBatchTracking = useCallback(() => {
    batchIdRef.current = null
    pendingBatchRef.current = false
    pendingBatchEventsRef.current = []
  }, [])

  const processBatchEvent = useCallback((event: BatchEvent) => {
    switch (event.type) {
      case "batch-progress":
        setBatchProgress({
          completed: event.completed,
          total: event.total,
          running: event.running,
        })
        break

      case "batch-item-done":
        setBatchItems((prev) => [...prev, event.item])
        break

      case "batch-error":
        clearBatchTracking()
        setBatchError(event.error)
        setBatchStatus("error")
        setBatchId(null)
        setBatchSummary(null)
        setBatchProgress((prev) => ({
          completed: prev.completed,
          total: prev.total,
          running: 0,
        }))
        break

      case "batch-done":
        clearBatchTracking()
        setBatchError(null)
        setBatchSummary(event.summary)
        setBatchItems(event.items)
        setBatchStatus("done")
        setBatchId(null)
        setBatchProgress((prev) => ({
          completed: event.summary.processed,
          total: Math.max(prev.total, event.summary.total),
          running: 0,
        }))
        break
    }
  }, [clearBatchTracking, setBatchError, setBatchId, setBatchItems, setBatchProgress, setBatchStatus, setBatchSummary])

  useEffect(() => {
    const unsubscribe = window.api.onBatchEvent((event: BatchEvent) => {
      const currentBatchId = batchIdRef.current
      if (currentBatchId) {
        if (event.batchId !== currentBatchId) return
        processBatchEvent(event)
        return
      }
      if (pendingBatchRef.current) pendingBatchEventsRef.current.push(event)
    })

    return unsubscribe
  }, [processBatchEvent])

  const runBatch = useCallback(
    async (inputs: WorkflowInput[], concurrency: number, stopOnFailure: boolean) => {
      if (!workflow.nodes.length || inputs.length === 0) return

      clearBatchTracking()
      pendingBatchRef.current = true
      setBatchItems([])
      setBatchSummary(null)
      setBatchError(null)
      setBatchProgress({ completed: 0, total: inputs.length, running: 0 })
      setBatchStatus("running")
      setBatchId(null)

      try {
        const id = await window.api.runBatch(
          workflow,
          inputs,
          concurrency,
          stopOnFailure,
          selectedProject ?? undefined,
          selectedWorkflowPath ?? undefined,
        )
        if (!id) {
          clearBatchTracking()
          setBatchError("Failed to start batch run.")
          setBatchStatus("error")
          setBatchId(null)
          return
        }
        batchIdRef.current = id
        setBatchId(id)
        const bufferedEvents = pendingBatchEventsRef.current
        pendingBatchRef.current = false
        pendingBatchEventsRef.current = []
        for (const event of bufferedEvents) {
          if (event.batchId === id) {
            processBatchEvent(event)
          }
        }
      } catch (err) {
        clearBatchTracking()
        setBatchError(String(err))
        setBatchStatus("error")
        setBatchId(null)
      }
    },
    [
      workflow,
      selectedProject,
      selectedWorkflowPath,
      setBatchItems,
      setBatchSummary,
      setBatchError,
      setBatchProgress,
      setBatchStatus,
      setBatchId,
      clearBatchTracking,
      processBatchEvent,
    ],
  )

  const cancelBatch = useCallback(async () => {
    const currentBatchId = batchIdRef.current ?? batchId
    if (!currentBatchId) return

    try {
      await window.api.cancelBatch(currentBatchId)
    } catch (err) {
      console.error("[useBatchExecution] cancelBatch failed:", err)
      setBatchError("Could not cancel batch run. It may still be running.")
      toast.error("Could not cancel batch run", {
        description: String(err),
      })
      return
    }

    clearBatchTracking()
    setBatchStatus("idle")
    setBatchError(null)
    setBatchId(null)
    setBatchItems([])
    setBatchSummary(null)
    setBatchProgress({ completed: 0, total: 0, running: 0 })
  }, [batchId, clearBatchTracking, setBatchStatus, setBatchError, setBatchId, setBatchItems, setBatchProgress, setBatchSummary])

  return { batchStatus, runBatch, cancelBatch }
}
