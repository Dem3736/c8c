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
import type { ActiveExecutionSnapshot, BatchEvent } from "@shared/types"
import type { BatchItemResult, BatchSummary, WorkflowInput } from "@shared/types"
import { toast } from "sonner"
import { useInboxNotifications } from "@/hooks/useInboxNotifications"

interface BatchRunOptions {
  preserveExistingItems?: boolean
  inputIndexMap?: number[]
  totalInputsOverride?: number
}

function mergeBatchItems(
  previousItems: BatchItemResult[],
  nextItems: BatchItemResult[],
): BatchItemResult[] {
  const nextByIndex = new Map(nextItems.map((item) => [item.input_index, item]))
  const merged = previousItems
    .map((item) => nextByIndex.get(item.input_index) ?? item)
    .filter((item, index, array) => array.findIndex((candidate) => candidate.input_index === item.input_index) === index)

  for (const item of nextItems) {
    if (!merged.some((candidate) => candidate.input_index === item.input_index)) {
      merged.push(item)
    }
  }

  return merged.sort((left, right) => left.input_index - right.input_index)
}

function summarizeBatchItems(items: BatchItemResult[], total: number): BatchSummary {
  const passedItems = items.filter((item) => item.status === "completed")
  const failedItems = items.filter((item) => item.status === "failed")
  const cancelledItems = items.filter((item) => item.status === "cancelled" || item.status === "interrupted")
  const processed = items.length
  const cancelled = Math.max(0, total - processed) + cancelledItems.length
  const totalCost = items.reduce((sum, item) => sum + item.cost_usd, 0)
  const totalDuration = items.reduce((sum, item) => sum + item.duration_ms, 0)

  return {
    total,
    processed,
    passed: passedItems.length,
    failed: failedItems.length,
    cancelled,
    mean_cost_usd: processed > 0 ? totalCost / processed : 0,
    mean_duration_ms: processed > 0 ? totalDuration / processed : 0,
    pass_rate: processed > 0 ? passedItems.length / processed : 0,
  }
}

export function useBatchExecution() {
  const [batchStatus, setBatchStatus] = useAtom(batchStatusAtom)
  const [batchId, setBatchId] = useAtom(batchIdAtom)
  const [batchItems] = useAtom(batchItemsAtom)
  const setBatchError = useSetAtom(batchErrorAtom)
  const setBatchItems = useSetAtom(batchItemsAtom)
  const setBatchSummary = useSetAtom(batchSummaryAtom)
  const setBatchProgress = useSetAtom(batchProgressAtom)
  const [workflow] = useAtom(currentWorkflowAtom)
  const [selectedProject] = useAtom(selectedProjectAtom)
  const [selectedWorkflowPath] = useAtom(selectedWorkflowPathAtom)
  const { addNotification } = useInboxNotifications()
  const batchIdRef = useRef<string | null>(batchId)
  const pendingBatchRef = useRef(false)
  const pendingBatchEventsRef = useRef<BatchEvent[]>([])
  const batchItemsRef = useRef<BatchItemResult[]>([])
  const currentRunOptionsRef = useRef<BatchRunOptions | null>(null)
  batchIdRef.current = batchId

  useEffect(() => {
    batchItemsRef.current = batchItems
  }, [batchItems])

  const clearBatchTracking = useCallback(() => {
    batchIdRef.current = null
    pendingBatchRef.current = false
    pendingBatchEventsRef.current = []
    currentRunOptionsRef.current = null
  }, [])

  const applyBatchItems = useCallback((updater: BatchItemResult[] | ((prev: BatchItemResult[]) => BatchItemResult[])) => {
    setBatchItems((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater
      batchItemsRef.current = next
      return next
    })
  }, [setBatchItems])

  const normalizeIncomingItem = useCallback((item: BatchItemResult): BatchItemResult => {
    const inputIndexMap = currentRunOptionsRef.current?.inputIndexMap
    if (!inputIndexMap) return item
    const mappedIndex = inputIndexMap[item.input_index]
    return {
      ...item,
      input_index: mappedIndex ?? item.input_index,
    }
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
        applyBatchItems((prev) => {
          const nextItem = normalizeIncomingItem(event.item)
          const shouldMerge = currentRunOptionsRef.current?.preserveExistingItems
          return shouldMerge
            ? mergeBatchItems(prev, [nextItem])
            : [...prev, nextItem].sort((left, right) => left.input_index - right.input_index)
        })
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
        addNotification({
          title: "Batch run failed",
          description: event.error,
          level: "error",
          source: "batch",
        })
        break

      case "batch-done":
        const normalizedItems = event.items.map((item) => normalizeIncomingItem(item))
        const preserveExistingItems = currentRunOptionsRef.current?.preserveExistingItems
        const totalInputs = currentRunOptionsRef.current?.totalInputsOverride ?? event.summary.total
        const nextItems = preserveExistingItems
          ? mergeBatchItems(batchItemsRef.current, normalizedItems)
          : normalizedItems
        clearBatchTracking()
        setBatchError(null)
        setBatchSummary(preserveExistingItems ? summarizeBatchItems(nextItems, totalInputs) : event.summary)
        applyBatchItems(nextItems)
        setBatchStatus("done")
        setBatchId(null)
        setBatchProgress((prev) => ({
          completed: preserveExistingItems ? nextItems.length : event.summary.processed,
          total: Math.max(prev.total, totalInputs),
          running: 0,
        }))
        addNotification({
          title: event.summary.failed > 0
            ? "Batch run finished with failures"
            : event.summary.cancelled > 0
              ? "Batch run cancelled"
              : "Batch run completed",
          description: `${event.summary.processed}/${event.summary.total} processed · ${event.summary.failed} failed · ${event.summary.cancelled} cancelled`,
          level: event.summary.failed > 0 ? "warning" : event.summary.cancelled > 0 ? "warning" : "success",
          source: "batch",
        })
        break
    }
  }, [addNotification, applyBatchItems, clearBatchTracking, normalizeIncomingItem, setBatchError, setBatchId, setBatchProgress, setBatchStatus, setBatchSummary])

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

  useEffect(() => {
    window.api.getActiveExecutions().then((executions: ActiveExecutionSnapshot[]) => {
      const activeBatch = executions.find((execution) =>
        execution.kind === "batch"
        && (
          (selectedWorkflowPath && execution.workflowPath === selectedWorkflowPath)
          || (!selectedWorkflowPath && selectedProject && execution.projectPath === selectedProject)
        ),
      )
      if (!activeBatch || activeBatch.kind !== "batch") return

      batchIdRef.current = activeBatch.batchId
      pendingBatchRef.current = false
      pendingBatchEventsRef.current = []
      setBatchId(activeBatch.batchId)
      setBatchStatus("running")
      setBatchError(null)
      batchItemsRef.current = activeBatch.items
      setBatchItems(activeBatch.items)
      setBatchSummary(null)
      setBatchProgress({
        completed: activeBatch.completed,
        total: activeBatch.total,
        running: activeBatch.running,
      })
    }).catch((error) => {
      console.error("[useBatchExecution] getActiveExecutions failed:", error)
    })
  }, [
    selectedProject,
    selectedWorkflowPath,
    setBatchError,
    setBatchId,
    setBatchItems,
    setBatchProgress,
    setBatchStatus,
    setBatchSummary,
  ])

  const runBatch = useCallback(
    async (inputs: WorkflowInput[], concurrency: number, stopOnFailure: boolean, options?: BatchRunOptions) => {
      if (!workflow.nodes.length || inputs.length === 0) return
      if (pendingBatchRef.current || batchIdRef.current || batchStatus === "running") {
        toast.error("Batch run is already in progress")
        addNotification({
          title: "Batch run already in progress",
          level: "warning",
          source: "batch",
        })
        return
      }

      clearBatchTracking()
      pendingBatchRef.current = true
      currentRunOptionsRef.current = options ?? null
      if (!options?.preserveExistingItems) {
        batchItemsRef.current = []
        setBatchItems([])
      }
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
          addNotification({
            title: "Batch run failed to start",
            description: "Failed to start batch run.",
            level: "error",
            source: "batch",
          })
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
        addNotification({
          title: "Batch run failed to start",
          description: String(err),
          level: "error",
          source: "batch",
        })
      }
    },
    [
      addNotification,
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
      batchStatus,
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
      addNotification({
        title: "Could not cancel batch run",
        description: String(err),
        level: "error",
        source: "batch",
      })
      return
    }

    toast.success("Cancelling batch run", {
      description: "Completed results will remain available.",
    })
    addNotification({
      title: "Cancelling batch run",
      description: "Completed results will remain available.",
      level: "info",
      source: "batch",
    })
  }, [addNotification, batchId, setBatchError])

  return { batchStatus, runBatch, cancelBatch }
}
