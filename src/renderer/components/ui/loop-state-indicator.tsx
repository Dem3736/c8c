import { Badge } from "@/components/ui/badge"
import { DisclosurePanel } from "@/components/ui/disclosure-panel"
import { cn } from "@/lib/cn"
import type { ExecutionLoopSummary } from "@/lib/execution-loops"
import { AlertTriangle, CheckCircle2, RefreshCcw, ShieldAlert, TimerReset } from "lucide-react"

function deriveLoopStatePresentation(summary: ExecutionLoopSummary) {
  switch (summary.outcome) {
    case "auto-pass":
      return {
        Icon: CheckCircle2,
        badgeVariant: "success" as const,
        toneClass: "text-status-success",
        stateLabel: "Passed",
      }
    case "auto-return":
      return {
        Icon: RefreshCcw,
        badgeVariant: "info" as const,
        toneClass: "text-status-info",
        stateLabel: "Returning to fix",
      }
    case "retry cap reached":
      return {
        Icon: TimerReset,
        badgeVariant: "warning" as const,
        toneClass: "text-status-warning",
        stateLabel: "Needs attention",
      }
    default:
      return {
        Icon: ShieldAlert,
        badgeVariant: "warning" as const,
        toneClass: "text-status-warning",
        stateLabel: "Waiting for approval",
      }
  }
}

function deriveLoopTypeLabel(loopLabel: string) {
  return loopLabel.replace(/\s+loop$/i, "")
}

export function LoopStateIndicator({
  summary,
  className,
}: {
  summary: ExecutionLoopSummary | null
  className?: string
}) {
  if (!summary) return null

  const presentation = deriveLoopStatePresentation(summary)
  const loopType = deriveLoopTypeLabel(summary.loopLabel)
  const compactReason = summary.reason || summary.fixInstructions || summary.outcomeSentence

  return (
    <DisclosurePanel
      summary={(
        <span className="flex min-w-0 items-center gap-2">
          <span className={cn("inline-flex items-center gap-1", presentation.toneClass)}>
            <presentation.Icon size={12} aria-hidden="true" />
            <span>{loopType}</span>
          </span>
          <Badge variant="outline" size="compact">
            {summary.attempt}/{summary.maxAttempts}
          </Badge>
          <Badge variant={presentation.badgeVariant} size="compact">
            {presentation.stateLabel}
          </Badge>
        </span>
      )}
      className={cn("mt-2 border border-hairline bg-surface-1/75", className)}
      summaryClassName="py-1.5"
      contentClassName="space-y-2.5"
    >
      <div>
        <p className="ui-meta-label text-muted-foreground">Latest check</p>
        <p className="mt-1 text-body-sm text-foreground whitespace-pre-wrap">{compactReason}</p>
      </div>
      {summary.fixInstructions && summary.fixInstructions !== summary.reason && (
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
  )
}
