import { useState, useCallback, useEffect, useRef } from "react"
import { useAtom } from "jotai"
import {
  batchDialogOpenAtom,
  batchStatusAtom,
  batchErrorAtom,
  batchItemsAtom,
  batchSummaryAtom,
  batchProgressAtom,
  type BatchItemResult,
  type BatchSummary,
} from "@/lib/store"
import { useBatchExecution } from "@/hooks/useBatchExecution"
import { cn } from "@/lib/cn"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Play,
  Square,
  Check,
  X,
  Loader2,
  Download,
} from "lucide-react"

function downloadText(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

function csvCell(value: unknown): string {
  const text = String(value ?? "")
  if (text.includes(",") || text.includes("\"") || text.includes("\n")) {
    return `"${text.replaceAll("\"", "\"\"")}"`
  }
  return text
}

function toBatchCsv(items: BatchItemResult[]): string {
  const evalIds = Array.from(
    new Set(items.flatMap((item) => Object.keys(item.eval_scores || {}))),
  ).sort()
  const header = [
    "input_index",
    "run_id",
    "status",
    "cost_usd",
    "duration_ms",
    "error",
    ...evalIds.map((id) => `eval:${id}`),
  ]
  const rows = items.map((item) => [
    item.input_index + 1,
    item.run_id,
    item.status,
    typeof item.cost_usd === "number" ? item.cost_usd.toFixed(6) : "",
    item.duration_ms,
    item.error || "",
    ...evalIds.map((id) => item.eval_scores?.[id] ?? ""),
  ])
  return [header, ...rows]
    .map((row) => row.map(csvCell).join(","))
    .join("\n")
}

function toBatchJson(items: BatchItemResult[], summary: BatchSummary | null) {
  return JSON.stringify({ summary, items }, null, 2)
}

export function BatchPanel() {
  const [open, setOpen] = useAtom(batchDialogOpenAtom)
  const [batchStatus, setBatchStatus] = useAtom(batchStatusAtom)
  const [batchError, setBatchError] = useAtom(batchErrorAtom)
  const [batchItems, setBatchItems] = useAtom(batchItemsAtom)
  const [batchSummary, setBatchSummary] = useAtom(batchSummaryAtom)
  const [batchProgress, setBatchProgress] = useAtom(batchProgressAtom)
  const { runBatch, cancelBatch } = useBatchExecution()

  const [inputText, setInputText] = useState("")
  const [concurrency, setConcurrency] = useState(2)
  const [stopOnFailure, setStopOnFailure] = useState(false)
  const prevOpenRef = useRef(open)

  const inputs = inputText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)

  const handleRun = useCallback(() => {
    if (inputs.length === 0) return
    const workflowInputs = inputs.map((value) => ({
      type: "text" as const,
      value,
    }))
    runBatch(workflowInputs, concurrency, stopOnFailure)
  }, [inputs, concurrency, stopOnFailure, runBatch])

  const isRunning = batchStatus === "running"
  const isDone = batchStatus === "done"
  const isError = batchStatus === "error"
  const completedInputIndexes = new Set(
    batchItems
      .filter((item) => item.status === "completed")
      .map((item) => item.input_index),
  )
  const pendingInputIndexes = inputs
    .map((_, index) => index)
    .filter((index) => !completedInputIndexes.has(index))
  const activeInputIndexes = new Set<number>()
  for (const index of pendingInputIndexes.slice(0, batchProgress.running)) {
    activeInputIndexes.add(index)
  }

  const handleExportJson = useCallback(() => {
    if (batchItems.length === 0) return
    const stamp = new Date().toISOString().replace(/[:.]/g, "-")
    downloadText(`batch-results-${stamp}.json`, toBatchJson(batchItems, batchSummary), "application/json")
  }, [batchItems, batchSummary])

  const handleExportCsv = useCallback(() => {
    if (batchItems.length === 0) return
    const stamp = new Date().toISOString().replace(/[:.]/g, "-")
    downloadText(`batch-results-${stamp}.csv`, toBatchCsv(batchItems), "text/csv;charset=utf-8")
  }, [batchItems])

  useEffect(() => {
    if (prevOpenRef.current === open) return
    const openedNow = !prevOpenRef.current && open
    prevOpenRef.current = open
    if (!openedNow) return
    if (batchStatus === "running") return

    setBatchStatus("idle")
    setBatchError(null)
    setBatchItems([])
    setBatchSummary(null)
    setBatchProgress({ completed: 0, total: 0, running: 0 })
  }, [open, batchStatus, setBatchStatus, setBatchError, setBatchItems, setBatchSummary, setBatchProgress])

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && isRunning) return
        setOpen(nextOpen)
      }}
    >
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Batch Run</DialogTitle>
          <DialogDescription>
            Run this workflow on multiple inputs. Enter one input per line.
          </DialogDescription>
        </DialogHeader>

        {!isRunning && !isDone && (
          <div className="space-y-3">
            {isError && (
              <div
                role="alert"
                className="rounded-md border border-status-danger/30 bg-status-danger/10 px-3 py-2 ui-meta-text text-status-danger"
              >
                {batchError || "Batch run failed. Check configuration and try again."}
              </div>
            )}
            <Textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === "Enter" && inputs.length > 0) {
                  event.preventDefault()
                  handleRun()
                }
              }}
              placeholder={"Topic 1\nTopic 2\nTopic 3"}
              rows={8}
              className="font-mono text-body-sm"
            />
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Label htmlFor="batch-concurrency">Concurrency:</Label>
                <Input
                  id="batch-concurrency"
                  type="number"
                  min={1}
                  max={10}
                  value={concurrency}
                  onChange={(e) => setConcurrency(Math.max(1, Math.min(10, parseInt(e.target.value) || 1)))}
                  className="w-16 h-control-sm ui-meta-text"
                />
              </div>
              <Label htmlFor="batch-stop-on-failure" className="flex items-center gap-1.5 cursor-pointer">
                <Checkbox
                  id="batch-stop-on-failure"
                  checked={stopOnFailure}
                  onChange={(e) => setStopOnFailure(e.target.checked)}
                />
                Stop on first failure
              </Label>
            </div>
            <div className="ui-meta-text text-muted-foreground">
              {inputs.length} input{inputs.length !== 1 ? "s" : ""} detected
            </div>
            <div className="ui-meta-text text-muted-foreground/90">
              Shortcut: press Cmd/Ctrl+Enter to start batch run.
            </div>
          </div>
        )}

        {isRunning && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-body-sm" role="status" aria-live="polite">
              <Loader2 size={14} className="animate-spin" />
              <span>
                Running: {batchProgress.completed}/{batchProgress.total} completed
                {batchProgress.running > 0 && `, ${batchProgress.running} in progress`}
              </span>
            </div>
            <div className="w-full h-2 bg-surface-3 rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all"
                style={{ width: `${batchProgress.total > 0 ? (batchProgress.completed / batchProgress.total) * 100 : 0}%` }}
              />
            </div>
            <BatchInputPreview
              inputs={inputs}
              completedIndexes={completedInputIndexes}
              activeIndexes={activeInputIndexes}
            />
            <BatchItemList items={batchItems} />
          </div>
        )}

        {isDone && !batchSummary && (
          <div
            role="status"
            className="rounded-md border border-hairline bg-surface-2/70 px-3 py-2 ui-meta-text text-muted-foreground"
          >
            Batch completed, but summary is unavailable.
          </div>
        )}

        {isDone && batchSummary && (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <SummaryCard label="Pass Rate" value={`${(batchSummary.pass_rate * 100).toFixed(0)}%`} />
              <SummaryCard label="Passed" value={`${batchSummary.passed}/${batchSummary.processed}`} />
              <SummaryCard label="Failed" value={String(batchSummary.failed)} variant={batchSummary.failed > 0 ? "danger" : "default"} />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <SummaryCard label="Cancelled" value={String(batchSummary.cancelled)} />
              <SummaryCard label="Mean Cost" value={`$${batchSummary.mean_cost_usd.toFixed(4)}`} />
              <SummaryCard
                label={batchSummary.total !== batchSummary.processed ? `Mean Duration (${batchSummary.processed} processed)` : "Mean Duration"}
                value={`${(batchSummary.mean_duration_ms / 1000).toFixed(1)}s`}
              />
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleExportCsv} disabled={batchItems.length === 0}>
                <Download size={14} />
                Export CSV
              </Button>
              <Button variant="outline" size="sm" onClick={handleExportJson} disabled={batchItems.length === 0}>
                <Download size={14} />
                Export JSON
              </Button>
            </div>
            <BatchItemList items={batchItems} />
          </div>
        )}

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost" size="sm" disabled={isRunning}>Close</Button>
          </DialogClose>
          {isRunning ? (
            <Button variant="destructive" size="sm" onClick={cancelBatch}>
              <Square size={14} />
              Cancel
            </Button>
          ) : isDone ? (
            <Button
              size="sm"
              onClick={() => {
                setInputText("")
                setBatchStatus("idle")
                setBatchError(null)
                setBatchItems([])
                setBatchSummary(null)
                setBatchProgress({ completed: 0, total: 0, running: 0 })
              }}
            >
              New Batch
            </Button>
          ) : (
            <Button
              size="sm"
              variant="default"
              className="!text-primary-foreground [-webkit-text-fill-color:hsl(var(--primary-foreground))]"
              onClick={handleRun}
              disabled={inputs.length === 0}
            >
              <Play size={14} />
              Run {inputs.length} Item{inputs.length !== 1 ? "s" : ""}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function SummaryCard({
  label,
  value,
  variant = "default",
}: {
  label: string
  value: string
  variant?: "default" | "danger"
}) {
  return (
    <div className="rounded-md border border-hairline bg-surface-2 px-3 py-2">
      <div className="ui-meta-text text-muted-foreground">{label}</div>
      <div
        className={cn(
          "text-body-sm font-mono font-medium",
          variant === "danger" ? "text-status-danger" : "text-foreground",
        )}
      >
        {value}
      </div>
    </div>
  )
}

function BatchInputPreview({
  inputs,
  completedIndexes,
  activeIndexes,
}: {
  inputs: string[]
  completedIndexes: Set<number>
  activeIndexes: Set<number>
}) {
  if (inputs.length === 0) return null
  const previewCount = Math.min(inputs.length, 12)
  const hasHidden = inputs.length > previewCount

  return (
    <div className="rounded-md border border-hairline bg-surface-2/70 p-2">
      <div className="ui-meta-text text-muted-foreground mb-1">Inputs preview</div>
      <div className="space-y-1 max-h-40 overflow-y-auto">
        {inputs.slice(0, previewCount).map((value, index) => {
          const done = completedIndexes.has(index)
          const running = !done && activeIndexes.has(index)
          return (
            <div key={`preview-${index}-${value}`} className="flex items-center gap-2 ui-meta-text">
              <span className="text-muted-foreground w-8">#{index + 1}</span>
              <span
                className={cn(
                  "rounded px-1 py-0 font-mono",
                  done
                    ? "bg-status-success/20 text-status-success"
                    : running
                      ? "bg-status-info/20 text-status-info"
                      : "bg-surface-3 text-foreground/75",
                )}
              >
                {done ? "done" : running ? "running" : "waiting"}
              </span>
              <span className="truncate text-foreground/90">{value}</span>
            </div>
          )
        })}
        {hasHidden && (
          <div className="ui-meta-text text-muted-foreground">
            +{inputs.length - previewCount} more
          </div>
        )}
      </div>
    </div>
  )
}

function BatchItemList({ items }: { items: BatchItemResult[] }) {
  if (items.length === 0) return null
  return (
    <div className="border border-hairline rounded-md divide-y divide-hairline max-h-48 overflow-y-auto">
      {items.map((item) => {
        const evalSummary = Object.entries(item.eval_scores || {})
          .map(([id, score]) => `${id}:${score}`)
          .join(" · ")
        return (
          <div key={`${item.input_index}-${item.run_id}`} className="flex items-center gap-2 px-3 py-1.5 ui-meta-text">
            <span className="text-muted-foreground w-8">#{item.input_index + 1}</span>
            {item.status === "completed" ? (
              <Check size={12} className="text-status-success" />
            ) : item.status === "cancelled" || item.status === "interrupted" ? (
              <Square size={12} className="text-status-warning" />
            ) : (
              <X size={12} className="text-status-danger" />
            )}
            <span
              className={cn(
                item.status === "completed" && "text-foreground",
                item.status === "cancelled" || item.status === "interrupted"
                  ? "text-status-warning"
                  : item.status !== "completed" && "text-status-danger",
              )}
            >
              {item.status === "completed"
                ? "Passed"
                : item.status === "cancelled" || item.status === "interrupted"
                  ? "Cancelled"
                  : item.error || "Failed"}
            </span>
            <span className="text-muted-foreground font-mono">
              {typeof item.cost_usd === "number" ? `$${item.cost_usd.toFixed(4)}` : "n/a"}
            </span>
            {evalSummary && (
              <span className="truncate text-muted-foreground" title={evalSummary}>
                {evalSummary}
              </span>
            )}
            <span className="ml-auto text-muted-foreground">
              {(item.duration_ms / 1000).toFixed(1)}s
            </span>
          </div>
        )
      })}
    </div>
  )
}
