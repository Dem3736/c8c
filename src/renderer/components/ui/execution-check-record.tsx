import { Badge } from "@/components/ui/badge"
import { DisclosurePanel } from "@/components/ui/disclosure-panel"
import { cn } from "@/lib/cn"
import type { ExecutionCheckRecord, ExecutionLoopSummary } from "@/lib/execution-loops"
import { deriveExecutionCheckRecord } from "@/lib/execution-loops"
import { AlertTriangle, CheckCircle2, RotateCcw } from "lucide-react"

function getCheckPresentation(status: ExecutionCheckRecord["status"]) {
  switch (status) {
    case "passed":
      return {
        Icon: CheckCircle2,
        toneClass: "text-status-success bg-status-success/10 border-status-success/20",
        badgeVariant: "success" as const,
      }
    case "returned":
      return {
        Icon: RotateCcw,
        toneClass: "text-status-warning bg-status-warning/10 border-status-warning/20",
        badgeVariant: "warning" as const,
      }
    default:
      return {
        Icon: AlertTriangle,
        toneClass: "text-status-warning bg-status-warning/10 border-status-warning/20",
        badgeVariant: "warning" as const,
      }
  }
}

export function ExecutionCheckRecord({
  summary,
  className,
  compact = false,
}: {
  summary: ExecutionLoopSummary | null
  className?: string
  compact?: boolean
}) {
  const record = deriveExecutionCheckRecord(summary)
  if (!record || !summary) return null

  const presentation = getCheckPresentation(record.status)

  return (
    <div className={cn("rounded-lg border border-hairline bg-surface-2/55 px-3 py-2.5", compact && "px-2.5 py-2", className)}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn("inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border", presentation.toneClass)}>
              <presentation.Icon size={13} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" size="compact">Check</Badge>
                <span className="text-body-sm font-medium text-foreground">{record.title}</span>
              </div>
              <p className="mt-1 line-clamp-2 text-body-sm text-muted-foreground">{record.summary}</p>
            </div>
          </div>
        </div>
        <div className="ui-badge-row">
          <Badge variant={presentation.badgeVariant} size="compact">{record.statusLabel}</Badge>
          <Badge variant="outline" size="compact">{summary.loopLabel} {summary.attempt}/{summary.maxAttempts}</Badge>
          <Badge variant={summary.score >= summary.threshold ? "success" : "warning"} size="compact">
            {summary.score}/10
          </Badge>
        </div>
      </div>

      {(summary.reason || summary.fixInstructions || summary.criteriaBreakdown?.length) && (
        <DisclosurePanel
          summary={record.detailSummary || "Why"}
          className="mt-2 border border-hairline bg-surface-1/75"
          summaryClassName="py-1.5"
          contentClassName="space-y-2.5"
        >
          {summary.reason && (
            <div>
              <p className="ui-meta-label text-muted-foreground">Why</p>
              <p className="mt-1 text-body-sm text-foreground whitespace-pre-wrap">{summary.reason}</p>
            </div>
          )}
          {summary.fixInstructions && record.status === "returned" && (
            <div>
              <p className="ui-meta-label text-muted-foreground">Next fix</p>
              <p className="mt-1 text-body-sm text-foreground whitespace-pre-wrap">{summary.fixInstructions}</p>
            </div>
          )}
          {summary.criteriaBreakdown && summary.criteriaBreakdown.length > 0 && (
            <div className="space-y-1.5">
              <p className="ui-meta-label text-muted-foreground">Checks</p>
              <div className="space-y-1">
                {summary.criteriaBreakdown.map((criterion) => (
                  <div
                    key={`${criterion.id}-${criterion.score}`}
                    className="flex items-center justify-between gap-3 rounded-md border border-hairline bg-surface-2/45 px-2.5 py-1.5 text-body-sm"
                  >
                    <span className="min-w-0 truncate text-foreground">{criterion.id}</span>
                    <Badge
                      variant={criterion.score >= summary.threshold ? "success" : "warning"}
                      size="compact"
                    >
                      {criterion.score}/10
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          )}
        </DisclosurePanel>
      )}
    </div>
  )
}
