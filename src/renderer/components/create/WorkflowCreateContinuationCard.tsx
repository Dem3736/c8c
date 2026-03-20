import { useEffect, useState } from "react"
import { ArrowUpRight, Loader2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/cn"
import { ScopeBanner } from "@/components/ui/scope-banner"
import { formatRelativeTime } from "@/components/sidebar/projectSidebarUtils"
import type { WorkflowCreateContinuationCandidate } from "@/lib/workflow-create-continuation"

const MAX_COLLAPSED_SECONDARY_CONTINUATIONS = 3

function continuationStatusLabel(status: WorkflowCreateContinuationCandidate["status"]) {
  return status === "blocked" ? "Waiting on you" : "Ready"
}

function continuationStatusVariant(status: WorkflowCreateContinuationCandidate["status"]) {
  return status === "blocked" ? "warning" : "success"
}

export function buildContinuationActionLabel(continuation: WorkflowCreateContinuationCandidate): string {
  if (continuation.action.kind === "open_blocked_work") {
    return continuation.action.task.kind === "approval" ? "Open approval" : "Provide input"
  }
  return "Continue work"
}

export function buildContinuationStepChips(continuation: WorkflowCreateContinuationCandidate): string[] {
  const chips: string[] = []
  if (continuation.latestStepLabel) {
    chips.push(`Latest step: ${continuation.latestStepLabel}`)
  }
  if (continuation.nextStepLabel) {
    chips.push(`Next step: ${continuation.nextStepLabel}`)
  }
  return chips
}

export function deriveSecondaryContinuationVisibility(
  secondaryContinuations: WorkflowCreateContinuationCandidate[],
  expanded: boolean,
) {
  const visibleContinuations = expanded
    ? secondaryContinuations
    : secondaryContinuations.slice(0, MAX_COLLAPSED_SECONDARY_CONTINUATIONS)

  return {
    visibleContinuations,
    hiddenCount: Math.max(0, secondaryContinuations.length - visibleContinuations.length),
    canToggle: secondaryContinuations.length > MAX_COLLAPSED_SECONDARY_CONTINUATIONS,
  }
}

export function WorkflowCreateContinuationCard({
  continuation,
  secondaryContinuations,
  loading,
  pending,
  onContinue,
}: {
  continuation: WorkflowCreateContinuationCandidate | null
  secondaryContinuations: WorkflowCreateContinuationCandidate[]
  loading: boolean
  pending: boolean
  onContinue: (continuation: WorkflowCreateContinuationCandidate) => void
}) {
  const [secondaryExpanded, setSecondaryExpanded] = useState(false)

  useEffect(() => {
    if (secondaryContinuations.length <= MAX_COLLAPSED_SECONDARY_CONTINUATIONS) {
      setSecondaryExpanded(false)
    }
  }, [secondaryContinuations.length])

  if (!loading && !continuation) return null
  const primaryStepChips = continuation ? buildContinuationStepChips(continuation) : []
  const secondaryVisibility = deriveSecondaryContinuationVisibility(secondaryContinuations, secondaryExpanded)

  return (
    <section aria-label="Continue saved work" className="w-full space-y-2.5">
      <div className="flex flex-col gap-1 px-1 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-body-sm font-medium text-muted-foreground">Continue saved work</p>
        {secondaryVisibility.canToggle ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-auto px-1.5 py-1 text-body-xs text-muted-foreground"
            onClick={() => setSecondaryExpanded((previous) => !previous)}
          >
            {secondaryExpanded
              ? "Show less"
              : `Show ${secondaryVisibility.hiddenCount} more saved ${secondaryVisibility.hiddenCount === 1 ? "item" : "items"}`}
          </Button>
        ) : null}
      </div>

      {loading && !continuation ? (
        <div className="h-28 animate-pulse rounded-xl surface-panel" />
      ) : continuation ? (
        <ScopeBanner
          tone="accent"
          eyebrow={(
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge variant="outline" className="ui-meta-text px-2 py-0">
                Saved work
              </Badge>
              <Badge variant={continuationStatusVariant(continuation.status)} className="ui-meta-text px-2 py-0">
                {continuationStatusLabel(continuation.status)}
              </Badge>
            </div>
          )}
          title={continuation.title}
          description={continuation.readinessText}
          actions={(
            <Button size="sm" onClick={() => onContinue(continuation)} disabled={pending}>
              {pending ? <Loader2 size={14} className="animate-spin" /> : <ArrowUpRight size={14} />}
              {buildContinuationActionLabel(continuation)}
            </Button>
          )}
        >
          <div className="space-y-1 text-body-sm text-muted-foreground">
            <p>{continuation.supportText}</p>
            {continuation.lastGateText ? (
              <p className="text-body-xs text-muted-foreground">Latest check: {continuation.lastGateText}</p>
            ) : null}
            {primaryStepChips.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {primaryStepChips.map((chip) => (
                  <Badge key={chip} variant="outline" className="ui-meta-text px-2 py-0">
                    {chip}
                  </Badge>
                ))}
              </div>
            ) : null}
            <div className="flex flex-wrap gap-3">
              {continuation.latestResultLabel ? (
                <span>Latest result: {continuation.latestResultLabel}</span>
              ) : null}
              <span>Updated {formatRelativeTime(continuation.updatedAt) || "recently"}</span>
            </div>
          </div>
        </ScopeBanner>
      ) : null}

      {secondaryVisibility.visibleContinuations.length > 0 && (
        <div className="space-y-2">
          <p className="px-1 text-body-xs font-medium uppercase tracking-[0.14em] text-muted-foreground/80">
            More saved work
          </p>
          <div className="space-y-2">
            {secondaryVisibility.visibleContinuations.map((item) => {
              const itemStepChips = buildContinuationStepChips(item)

              return (
                <div
                  key={item.caseId}
                  className={cn(
                    "rounded-lg border border-hairline bg-surface-2/50 px-4 py-3",
                    item.status === "blocked" ? "border-status-warning/30" : "",
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-body-sm font-medium text-foreground">{item.title}</p>
                        <Badge variant={continuationStatusVariant(item.status)} className="ui-meta-text px-2 py-0">
                          {continuationStatusLabel(item.status)}
                        </Badge>
                      </div>
                      <p className="text-body-sm text-muted-foreground">{item.readinessText}</p>
                      <p className="text-body-xs text-muted-foreground">{item.supportText}</p>
                      {item.lastGateText ? (
                        <p className="text-body-xs text-muted-foreground">Latest check: {item.lastGateText}</p>
                      ) : null}
                      {itemStepChips.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {itemStepChips.map((chip) => (
                            <Badge key={chip} variant="outline" className="ui-meta-text px-2 py-0">
                              {chip}
                            </Badge>
                          ))}
                        </div>
                      ) : null}
                      <div className="flex flex-wrap gap-3 text-body-xs text-muted-foreground">
                        {item.latestResultLabel ? <span>Latest result: {item.latestResultLabel}</span> : null}
                        <span>Updated {formatRelativeTime(item.updatedAt) || "recently"}</span>
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={pending}
                      onClick={() => onContinue(item)}
                      className="shrink-0"
                    >
                      <ArrowUpRight size={14} />
                      {buildContinuationActionLabel(item)}
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </section>
  )
}
