import { useState, useEffect, useCallback } from "react"
import { cn } from "@/lib/cn"
import { FileText } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import { CursorMenu } from "@/components/ui/cursor-menu"
import { RunCompare, RunTrends } from "@/components/RunTrends"
import { formatCost } from "@/components/output/OutputSections"
import type { RunResult } from "@shared/types"
import ReactMarkdown, { type Components as MarkdownComponents } from "react-markdown"
import remarkGfm from "remark-gfm"
import rehypeHighlight from "rehype-highlight"
import { toast } from "sonner"

const PREVIEW_MAX_W = "max-w-52" as const
const MARKDOWN_PROSE_CLASS = "prose-c8c"
const MARKDOWN_COMPONENTS: MarkdownComponents = {
  a: ({ href, children, ...props }) => {
    const safeHref = typeof href === "string" ? href : ""
    return (
      <a
        {...props}
        href={safeHref}
        target="_blank"
        rel="noreferrer noopener"
        onClick={(event) => {
          if (!safeHref) {
            event.preventDefault()
          }
        }}
      >
        {children}
      </a>
    )
  },
}

// ── Formatting helpers ──────────────────────────────────────

function formatDurationMs(durationMs: number): string {
  if (durationMs < 1_000) return `${durationMs}ms`
  const seconds = durationMs / 1_000
  if (seconds < 60) return `${seconds.toFixed(1)}s`
  const minutes = Math.floor(seconds / 60)
  const remainSeconds = Math.round(seconds % 60)
  return `${minutes}m ${remainSeconds}s`
}

function formatRunDuration(run: RunResult): string {
  if (typeof run.durationMs === "number" && run.durationMs >= 0) {
    return formatDurationMs(run.durationMs)
  }
  if (run.completedAt > 0 && run.startedAt > 0) {
    const delta = run.completedAt - run.startedAt
    if (delta > 0) return formatDurationMs(delta)
  }
  return "n/a"
}

function formatRunCost(run: RunResult): string {
  if (typeof run.totalCost === "number") {
    return formatCost(run.totalCost)
  }
  return "n/a"
}

function formatRunCompletedAt(run: RunResult, includeTime: boolean): string {
  if (!Number.isFinite(run.completedAt) || run.completedAt <= 0) {
    return "n/a"
  }
  const completedDate = new Date(run.completedAt)
  if (Number.isNaN(completedDate.getTime())) {
    return "n/a"
  }
  return includeTime ? completedDate.toLocaleString() : completedDate.toLocaleDateString()
}

function isRunContinuable(run: RunResult): boolean {
  return run.status !== "completed" && run.status !== "failed" && run.status !== "cancelled"
}

// ── HistoryTab ──────────────────────────────────────────────

export interface HistoryTabProps {
  pastRuns: RunResult[]
  runStatus: string
  onOpenReport: (path: string) => Promise<void> | void
  onContinueRun?: (run: RunResult) => Promise<void> | void
}

export function HistoryTab({ pastRuns, runStatus, onOpenReport, onContinueRun }: HistoryTabProps) {
  const [selectedHistoryRunId, setSelectedHistoryRunId] = useState<string | null>(null)
  const [selectedRunDetails, setSelectedRunDetails] = useState<(RunResult & { reportContent: string }) | null>(null)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState<string | null>(null)
  const [compareRunAId, setCompareRunAId] = useState<string | null>(null)
  const [compareRunBId, setCompareRunBId] = useState<string | null>(null)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; runId: string } | null>(null)

  const completedRuns = pastRuns.filter((run) => run.status === "completed")
  const selectedHistoryRun = pastRuns.find((run) => run.runId === selectedHistoryRunId) || null
  const compareRunA = completedRuns.find((run) => run.runId === compareRunAId) || null
  const compareRunB = completedRuns.find((run) => run.runId === compareRunBId) || null
  const contextHistoryRun = contextMenu ? pastRuns.find((run) => run.runId === contextMenu.runId) || null : null

  const handleOpenReport = useCallback(async (path: string) => {
    try {
      await Promise.resolve(onOpenReport(path))
    } catch (error) {
      console.error("[HistoryTab] open report failed:", error)
      toast.error("Could not open report file", { description: String(error) })
    }
  }, [onOpenReport])

  const handleCopyRunId = useCallback(async (runId: string) => {
    try {
      await navigator.clipboard.writeText(runId)
    } catch (error) {
      console.error("[HistoryTab] copy run ID failed:", error)
      toast.error("Could not copy run ID", { description: String(error) })
    }
  }, [])

  // Keep selection in sync with available runs
  useEffect(() => {
    if (pastRuns.length === 0) {
      setSelectedHistoryRunId(null)
      return
    }
    const exists = selectedHistoryRunId && pastRuns.some((run) => run.runId === selectedHistoryRunId)
    if (!exists) {
      setSelectedHistoryRunId(pastRuns[0].runId)
    }
  }, [pastRuns, selectedHistoryRunId])

  // Keep compare run IDs in sync
  useEffect(() => {
    if (completedRuns.length < 2) {
      setCompareRunAId(null)
      setCompareRunBId(null)
      return
    }
    const runIds = completedRuns.map((run) => run.runId)
    const nextA = compareRunAId && runIds.includes(compareRunAId) ? compareRunAId : runIds[0]
    const nextB = compareRunBId && runIds.includes(compareRunBId) && compareRunBId !== nextA
      ? compareRunBId
      : runIds.find((id) => id !== nextA) || null
    if (nextA !== compareRunAId) setCompareRunAId(nextA)
    if (nextB !== compareRunBId) setCompareRunBId(nextB)
  }, [compareRunAId, compareRunBId, completedRuns])

  // Load run details when selection changes
  useEffect(() => {
    if (!selectedHistoryRun?.workspace) {
      setSelectedRunDetails(null)
      setHistoryError(null)
      return
    }
    let cancelled = false
    setSelectedRunDetails(null)
    setHistoryLoading(true)
    setHistoryError(null)
    window.api.loadRunResult(selectedHistoryRun.workspace)
      .then((result) => {
        if (cancelled) return
        if (!result) {
          setSelectedRunDetails(null)
          setHistoryError("Run details are unavailable for this entry.")
          return
        }
        setSelectedRunDetails(result)
      })
      .catch(() => {
        if (cancelled) return
        setSelectedRunDetails(null)
        setHistoryError("Failed to load run details.")
      })
      .finally(() => {
        if (!cancelled) setHistoryLoading(false)
      })
    return () => { cancelled = true }
  }, [selectedHistoryRun?.runId, selectedHistoryRun?.workspace])

  if (pastRuns.length === 0) {
    return (
      <div className="rounded-lg surface-soft p-6 ui-empty-state text-body-md text-muted-foreground">
        No past runs yet. Start a workflow run to build history.
      </div>
    )
  }

  return (
    <>
      <div className="space-y-3">
        <RunTrends runs={pastRuns} />

        {compareRunA && compareRunB && (
          <div className="rounded-lg surface-soft p-3 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="ui-meta-label text-foreground-subtle">Compare runs</span>
              <Select
                value={compareRunA.runId}
                onValueChange={(nextRunId) => {
                  setCompareRunAId(nextRunId)
                  if (nextRunId === compareRunB?.runId) {
                    const fallback = completedRuns.find((run) => run.runId !== nextRunId)
                    setCompareRunBId(fallback ? fallback.runId : null)
                  }
                }}
              >
                <SelectTrigger className="h-control-sm w-[220px] text-body-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {completedRuns.map((run) => (
                    <SelectItem key={`compare-a-${run.runId}`} value={run.runId}>
                      {(run.workflowName || run.runId)} · {formatRunCompletedAt(run, false)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={compareRunB.runId}
                onValueChange={(nextRunId) => {
                  setCompareRunBId(nextRunId)
                  if (nextRunId === compareRunA?.runId) {
                    const fallback = completedRuns.find((run) => run.runId !== nextRunId)
                    setCompareRunAId(fallback ? fallback.runId : null)
                  }
                }}
              >
                <SelectTrigger className="h-control-sm w-[220px] text-body-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {completedRuns.map((run) => (
                    <SelectItem key={`compare-b-${run.runId}`} value={run.runId}>
                      {(run.workflowName || run.runId)} · {formatRunCompletedAt(run, false)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <RunCompare runA={compareRunA} runB={compareRunB} />
          </div>
        )}

        <div className="rounded-lg surface-soft overflow-hidden">
          {pastRuns.map((run) => {
            const isSelected = selectedHistoryRun?.runId === run.runId
            const canOpenReport = Boolean(run.reportPath)
            const canContinue = Boolean(
              onContinueRun
              && run.workspace
              && isRunContinuable(run)
              && runStatus !== "running",
            )
            return (
              <div
                key={run.runId}
                className="flex items-center gap-2 border-b border-hairline px-2 py-1.5 last:border-b-0"
                onContextMenu={(event) => {
                  event.preventDefault()
                  setSelectedHistoryRunId(run.runId)
                  setContextMenu({ x: event.clientX, y: event.clientY, runId: run.runId })
                }}
              >
                <button
                  type="button"
                  className={cn(
                    "flex flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left ui-transition-colors ui-motion-fast hover:bg-surface-3/80",
                    isSelected && "bg-surface-3/80",
                  )}
                  onClick={() => setSelectedHistoryRunId(run.runId)}
                >
                  <FileText size={14} className="text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-body-md font-medium truncate">{run.workflowName || run.runId}</div>
                    <div className="ui-meta-text text-muted-foreground">
                      {formatRunCompletedAt(run, true)} · {formatRunDuration(run)} · {formatRunCost(run)}
                    </div>
                  </div>
                  <Badge
                    variant={
                      run.status === "completed"
                        ? "outline"
                        : run.status === "interrupted"
                          ? "outline"
                          : "destructive"
                    }
                    className={cn(
                      "ui-meta-text px-2 py-0 shrink-0",
                      run.status === "completed" && "text-status-success border-status-success/30 bg-status-success/10",
                      run.status === "interrupted" && "text-status-warning border-status-warning/30",
                    )}
                  >
                    {run.status}
                  </Badge>
                </button>
                <button
                  type="button"
                  className={cn(
                    "h-control-sm rounded-md px-2 ui-meta-text ui-transition-colors ui-motion-fast",
                    canOpenReport
                      ? "border border-hairline bg-surface-1/80 text-foreground hover:bg-surface-3"
                      : "border border-hairline bg-surface-2/70 text-muted-foreground/80 cursor-not-allowed",
                  )}
                  disabled={!canOpenReport}
                  title={canOpenReport ? "Open the saved report file" : "This run does not have a saved report file."}
                  onClick={() => {
                    if (!run.reportPath) return
                    void handleOpenReport(run.reportPath)
                  }}
                >
                  Open file
                </button>
                <button
                  type="button"
                  className={cn(
                    "h-control-sm rounded-md px-2 ui-meta-text ui-transition-colors ui-motion-fast",
                    canContinue
                      ? "border border-hairline bg-surface-1/80 text-foreground hover:bg-surface-3"
                      : "border border-hairline bg-surface-2/70 text-muted-foreground/80 cursor-not-allowed",
                  )}
                  disabled={!canContinue}
                  title={canContinue ? "Continue this run from its saved workspace" : "Continue is only available for paused or interrupted runs."}
                  onClick={() => {
                    if (!canContinue || !onContinueRun) return
                    void onContinueRun(run)
                  }}
                >
                  Continue
                </button>
              </div>
            )
          })}
        </div>

        {selectedHistoryRun && (
          <div className="rounded-lg surface-soft p-3 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-body-md font-medium">Run details</span>
              <span className="ui-meta-text text-muted-foreground">
                {formatRunCompletedAt(selectedHistoryRun, true)}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 ui-meta-text">
              <div className="rounded-md border border-hairline bg-surface-2/60 px-2 py-1.5">
                <div className="text-muted-foreground">Status</div>
                <div className="font-medium text-foreground">{selectedHistoryRun.status}</div>
              </div>
              <div className="rounded-md border border-hairline bg-surface-2/60 px-2 py-1.5">
                <div className="text-muted-foreground">Duration</div>
                <div className="font-medium text-foreground">{formatRunDuration(selectedHistoryRun)}</div>
              </div>
              <div className="rounded-md border border-hairline bg-surface-2/60 px-2 py-1.5">
                <div className="text-muted-foreground">Total cost</div>
                <div className="font-medium text-foreground">{formatRunCost(selectedHistoryRun)}</div>
              </div>
              <div className="rounded-md border border-hairline bg-surface-2/60 px-2 py-1.5">
                <div className="text-muted-foreground">Run ID</div>
                <div className={cn("font-mono text-foreground truncate", PREVIEW_MAX_W)} title={selectedHistoryRun.runId}>
                  {selectedHistoryRun.runId}
                </div>
              </div>
            </div>

            {historyLoading && (
              <div className="ui-meta-text text-muted-foreground">Loading run details...</div>
            )}
            {!historyLoading && historyError && (
              <div role="alert" className="ui-meta-text text-status-danger">{historyError}</div>
            )}
            {!historyLoading && !historyError && selectedRunDetails?.reportContent && (
              <div className="rounded-md border border-hairline bg-surface-1/70 p-2">
                <div className="ui-meta-text text-muted-foreground mb-1">Report preview</div>
                <div className="max-h-80 overflow-y-auto ui-scroll-region">
                  <div className={MARKDOWN_PROSE_CLASS}>
                    <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]} components={MARKDOWN_COMPONENTS}>
                      {selectedRunDetails.reportContent}
                    </ReactMarkdown>
                  </div>
                </div>
              </div>
            )}
            {!historyLoading && !historyError && !selectedRunDetails?.reportContent && (
              <div className="ui-meta-text text-muted-foreground">
                No report content is available for this run.
              </div>
            )}
          </div>
        )}
      </div>

      <CursorMenu
        open={contextMenu !== null}
        x={contextMenu?.x || 0}
        y={contextMenu?.y || 0}
        onOpenChange={(open) => { if (!open) setContextMenu(null) }}
      >
        {contextHistoryRun && (
          <>
            <DropdownMenuLabel>{contextHistoryRun.workflowName || "Run"}</DropdownMenuLabel>
            <DropdownMenuItem
              onSelect={() => {
                setSelectedHistoryRunId(contextHistoryRun.runId)
                setContextMenu(null)
              }}
            >
              Open run details
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => {
                void handleCopyRunId(contextHistoryRun.runId)
                setContextMenu(null)
              }}
            >
              Copy run ID
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={!onContinueRun || !contextHistoryRun.workspace || !isRunContinuable(contextHistoryRun) || runStatus === "running"}
              onSelect={() => {
                if (!onContinueRun || !contextHistoryRun.workspace || !isRunContinuable(contextHistoryRun) || runStatus === "running") return
                void onContinueRun(contextHistoryRun)
                setContextMenu(null)
              }}
            >
              Continue run
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              disabled={!contextHistoryRun.reportPath}
              onSelect={() => {
                if (!contextHistoryRun.reportPath) return
                void handleOpenReport(contextHistoryRun.reportPath)
                setContextMenu(null)
              }}
            >
              Open report file
            </DropdownMenuItem>
          </>
        )}
      </CursorMenu>
    </>
  )
}
