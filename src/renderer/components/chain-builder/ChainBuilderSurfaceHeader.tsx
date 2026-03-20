import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/cn"

interface ChainBuilderRuntimeStepSummary {
  label: string
  status: string
}

interface ChainBuilderSurfaceHeaderProps {
  reviewSnapshot: boolean
  runtimeMode: boolean
  currentStep: ChainBuilderRuntimeStepSummary | null
  nextStepLabel: string | null
  completedCount: number
  pendingCount: number
  totalMonitoredSteps: number
  totalSteps: number
}

export function ChainBuilderSurfaceHeader({
  reviewSnapshot,
  runtimeMode,
  currentStep,
  nextStepLabel,
  completedCount,
  pendingCount,
  totalMonitoredSteps,
  totalSteps,
}: ChainBuilderSurfaceHeaderProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="space-y-1.5">
        <h2 className="section-kicker">{runtimeMode ? "Flow" : "Preview"}</h2>
        <div className="ui-badge-row">
          {reviewSnapshot && (
            <Badge variant="outline" className="ui-meta-text px-2 py-0 text-muted-foreground">
              Saved run
            </Badge>
          )}
          <Badge variant="outline" className="ui-meta-text px-2 py-0 text-muted-foreground">
            Select step to inspect
          </Badge>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-1.5">
        {runtimeMode && currentStep && (
          <span
            className={cn(
              "ui-status-badge ui-meta-text shrink-0",
              "border-hairline bg-surface-2 text-foreground",
              currentStep.status === "running" && "ui-status-badge-info",
              (currentStep.status === "waiting_approval" || currentStep.status === "waiting_human") && "ui-status-badge-warning",
              currentStep.status === "failed" && "ui-status-badge-danger",
            )}
          >
            {currentStep.status === "running"
              ? `Current: ${currentStep.label}`
              : currentStep.status === "failed"
                ? `Needs attention: ${currentStep.label}`
                : `Blocked at: ${currentStep.label}`}
          </span>
        )}
        {runtimeMode && nextStepLabel && (
          <Badge variant="outline" className="ui-meta-text px-2 py-0 border-primary/25 bg-primary/5 text-foreground">
            Next: {nextStepLabel}
          </Badge>
        )}
        {runtimeMode && (
          <Badge variant="outline" className="ui-meta-text px-2 py-0 text-muted-foreground">
            {completedCount}/{totalMonitoredSteps} done
          </Badge>
        )}
        {runtimeMode && pendingCount > 0 && (
          <Badge variant="outline" className="ui-meta-text px-2 py-0 text-muted-foreground">
            {pendingCount} pending
          </Badge>
        )}
        <span className="ui-meta-text tabular-nums text-muted-foreground">{totalSteps} steps</span>
      </div>
    </div>
  )
}
