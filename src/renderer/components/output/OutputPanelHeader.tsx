import { History } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { RunResult } from "@shared/types"
import { cn } from "@/lib/cn"

function formatRunCompletedAt(run: RunResult): string {
  if (!Number.isFinite(run.completedAt) || run.completedAt <= 0) {
    return "n/a"
  }
  const completedDate = new Date(run.completedAt)
  if (Number.isNaN(completedDate.getTime())) {
    return "n/a"
  }
  return completedDate.toLocaleString()
}

export function OutputPanelHeader({
  activeTab,
  hasResult,
  pastRuns,
  runStatus,
  selectedReviewRunId,
  onSelectReviewRun,
  canStartFreshRun,
  onStartNewRun,
  resultReadyPulse,
  resultLabel,
  executionProgress,
}: {
  activeTab: string
  hasResult: boolean
  pastRuns: RunResult[]
  runStatus: string
  selectedReviewRunId: string | null
  onSelectReviewRun: (runId: string) => void
  canStartFreshRun: boolean
  onStartNewRun?: () => void
  resultReadyPulse: boolean
  resultLabel?: string | null
  executionProgress?: { completed: number; total: number } | null
}) {
  return (
    <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
      <div className="min-w-0">
        {executionProgress && (
          <div className="flex items-center gap-2.5">
            <div className="ui-progress-track h-1 w-20 rounded-full">
              <div
                className="ui-progress-bar h-full rounded-full bg-status-info ui-motion-standard"
                style={{ width: `${Math.round((executionProgress.completed / executionProgress.total) * 100)}%` }}
              />
            </div>
            <span className="ui-meta-text text-muted-foreground tabular-nums whitespace-nowrap">
              {executionProgress.completed} / {executionProgress.total} steps
            </span>
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2">
        {pastRuns.length > 0 && runStatus === "idle" && (
          <div className="flex items-center gap-2 rounded-lg border border-hairline bg-surface-1/80 px-2 py-1 ui-elevation-inset">
            <span className="ui-meta-label text-muted-foreground">Saved run</span>
            <Select
              value={selectedReviewRunId || undefined}
              onValueChange={onSelectReviewRun}
            >
              <SelectTrigger className="h-control-sm min-w-[240px] border-none bg-transparent px-2 text-body-sm shadow-none">
                <SelectValue placeholder="Select a run" />
              </SelectTrigger>
              <SelectContent>
                {pastRuns.map((run, index) => (
                  <SelectItem key={`review-run-${run.runId}`} value={run.runId}>
                    {index === 0 ? "Latest run" : `Run ${index + 1}`} · {formatRunCompletedAt(run)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        {canStartFreshRun && onStartNewRun && (
          <Button variant="outline" size="sm" className="h-control-sm" onClick={onStartNewRun}>
            New run
          </Button>
        )}
        <TabsList className="h-control-md">
          <TabsTrigger value="nodes" className="px-3 py-1 text-body-sm">
            Activity
          </TabsTrigger>
          <TabsTrigger value="log" className="px-3 py-1 text-body-sm">
            Log
          </TabsTrigger>
          <TabsTrigger
            value="result"
            className={cn(
              "px-3 py-1 text-body-sm",
              resultReadyPulse && activeTab !== "result" && "border-status-success/40 text-status-success",
            )}
            disabled={!hasResult}
          >
            {resultReadyPulse && activeTab !== "result" && (
              <span className="ui-status-beacon mr-1.5" aria-hidden="true">
                <span className="ui-status-beacon-ring bg-status-success/35" />
                <span className="ui-status-beacon-core bg-status-success" />
              </span>
            )}
            {resultLabel || "Result"}
          </TabsTrigger>
          <TabsTrigger value="history" className="px-3 py-1 text-body-sm" disabled={pastRuns.length === 0}>
            <History size={12} className="mr-1" />
            History{pastRuns.length > 0 && ` (${pastRuns.length})`}
          </TabsTrigger>
        </TabsList>
      </div>
    </div>
  )
}
