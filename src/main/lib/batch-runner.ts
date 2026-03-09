import { BrowserWindow } from "electron"
import { cancelWorkflowRun, runWorkflow } from "./workflow-runner"
import type {
  Workflow,
  WorkflowInput,
  BatchItemResult,
  BatchSummary,
  BatchEvent,
} from "@shared/types"

const activeBatches = new Map<string, AbortController>()
const activeBatchRuns = new Map<string, Set<string>>()
const DEFAULT_BATCH_ITEM_TIMEOUT_MS = 5 * 60 * 1000

function send(window: BrowserWindow, event: BatchEvent) {
  if (!window.isDestroyed()) {
    window.webContents.send("batch:event", event)
  }
}

export async function runBatch(
  batchId: string,
  workflow: Workflow,
  inputs: WorkflowInput[],
  concurrency: number,
  stopOnFailure: boolean,
  window: BrowserWindow,
  projectPath?: string,
  workflowPath?: string,
): Promise<void> {
  const controller = new AbortController()
  activeBatches.set(batchId, controller)
  activeBatchRuns.set(batchId, new Set<string>())

  try {
    if (!Number.isFinite(concurrency) || concurrency < 1) {
      send(window, {
        type: "batch-error",
        batchId,
        error: "Batch concurrency must be at least 1.",
      })
      return
    }
    if (inputs.length === 0) {
      send(window, {
        type: "batch-error",
        batchId,
        error: "Batch requires at least one input.",
      })
      return
    }
    if (workflow.nodes.some((node) => node.type === "approval")) {
      send(window, {
        type: "batch-error",
        batchId,
        error: "Batch run does not support approval nodes. Remove approval steps or run a single execution.",
      })
      return
    }

    const items: BatchItemResult[] = []
    let completed = 0
    let running = 0
    let stopped = false

    const queue = inputs.map((input, index) => ({ input, index }))
    let queueIdx = 0

    const emitProgress = () => {
      send(window, {
        type: "batch-progress",
        batchId,
        completed,
        total: inputs.length,
        running,
      })
    }

    emitProgress()

    const runItem = async (input: WorkflowInput, index: number): Promise<BatchItemResult> => {
      const runId = `batch-${batchId}-item-${index}-${Date.now()}`
      const startedAt = Date.now()
      const batchRuns = activeBatchRuns.get(batchId)
      batchRuns?.add(runId)
      const abortRun = () => {
        cancelWorkflowRun(runId)
      }
      controller.signal.addEventListener("abort", abortRun, { once: true })

      const runPromise = runWorkflow(runId, workflow, input, window, projectPath, workflowPath)
      let timeoutHandle: ReturnType<typeof setTimeout> | undefined
      let timedOut = false

      try {
        const timeoutPromise = new Promise<never>((_resolve, reject) => {
          timeoutHandle = setTimeout(() => {
            timedOut = true
            cancelWorkflowRun(runId)
            reject(new Error(`Batch item timed out after ${DEFAULT_BATCH_ITEM_TIMEOUT_MS}ms`))
          }, DEFAULT_BATCH_ITEM_TIMEOUT_MS)
        })

        const summary = await Promise.race([runPromise, timeoutPromise])
        if (!summary || typeof summary !== "object") {
          throw new Error("Workflow run returned no result")
        }
        const status: BatchItemResult["status"] = summary.status === "completed"
          ? "completed"
          : summary.status === "cancelled"
            ? "cancelled"
            : summary.status === "interrupted"
              ? "interrupted"
              : "failed"

        return {
          input_index: index,
          run_id: runId,
          status,
          eval_scores: summary.evalScores || {},
          cost_usd: summary.totalCost || 0,
          duration_ms: summary.durationMs || Date.now() - startedAt,
          error: status === "failed" ? `Run finished with status: ${summary.status}` : undefined,
        }
      } catch (err) {
        if (timedOut) {
          runPromise.catch(() => undefined)
        }
        return {
          input_index: index,
          run_id: runId,
          status: "failed",
          eval_scores: {},
          cost_usd: 0,
          duration_ms: Date.now() - startedAt,
          error: String(err),
          }
      } finally {
        controller.signal.removeEventListener("abort", abortRun)
        batchRuns?.delete(runId)
        if (timeoutHandle) {
          clearTimeout(timeoutHandle)
        }
      }
    }

    // Pool-based concurrency
    const workers: Promise<void>[] = []

    for (let i = 0; i < Math.min(concurrency, inputs.length); i++) {
      workers.push(
        (async () => {
          while (queueIdx < queue.length && !stopped && !controller.signal.aborted) {
            const item = queue[queueIdx++]
            if (!item) break

            running++
            emitProgress()

            const result = await runItem(item.input, item.index)
            items.push(result)
            completed++
            running--

            send(window, { type: "batch-item-done", batchId, item: result })
            emitProgress()

            if (stopOnFailure && result.status !== "completed") {
              stopped = true
              controller.abort()
            }
          }
        })(),
      )
    }

    await Promise.all(workers)

    // Build summary
    const passedItems = items.filter((i) => i.status === "completed")
    const failedItems = items.filter((i) => i.status === "failed")
    const cancelledItems = items.filter((i) => i.status === "cancelled" || i.status === "interrupted")
    const skippedCount = Math.max(0, inputs.length - items.length)
    const cancelledCount = cancelledItems.length + skippedCount
    const totalCostSum = items.reduce((sum, i) => sum + i.cost_usd, 0)
    const totalDurationSum = items.reduce((sum, i) => sum + i.duration_ms, 0)

    const summary: BatchSummary = {
      total: inputs.length,
      processed: items.length,
      passed: passedItems.length,
      failed: failedItems.length,
      cancelled: cancelledCount,
      mean_cost_usd: items.length > 0 ? totalCostSum / items.length : 0,
      mean_duration_ms: items.length > 0 ? totalDurationSum / items.length : 0,
      pass_rate: items.length > 0 ? passedItems.length / items.length : 0,
    }

    send(window, { type: "batch-done", batchId, summary, items })
  } catch (err) {
    send(window, {
      type: "batch-error",
      batchId,
      error: String(err),
    })
  } finally {
    activeBatches.delete(batchId)
    activeBatchRuns.delete(batchId)
  }
}

export function cancelBatch(batchId: string): boolean {
  const controller = activeBatches.get(batchId)
  if (controller) {
    controller.abort()
    const runIds = activeBatchRuns.get(batchId)
    if (runIds) {
      for (const runId of runIds) {
        cancelWorkflowRun(runId)
      }
    }
    activeBatches.delete(batchId)
    activeBatchRuns.delete(batchId)
    return true
  }
  return false
}
