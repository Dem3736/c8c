import type { ReactNode } from "react"
import { RotateCcw } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/cn"
import type { RuntimeStagePresentation } from "@/lib/runtime-flow-labels"
import type { ExecutionLoopSummary } from "@/lib/execution-loops"
import { ExecutionCheckRecord } from "@/components/ui/execution-check-record"
import { ExecutionLoopCard } from "@/components/ui/execution-loop-card"
import { LoopStateIndicator } from "@/components/ui/loop-state-indicator"

function StageSummaryCard({
  contextToneClass,
  contextLabelClass,
  contextLabel,
  title,
  artifactLabel,
  outcomeLabel,
  branchLabel,
  detail,
  statusLabel,
  hasOutput,
  rerunNodeId,
  onRerunFrom,
  loopIndicator,
}: {
  contextToneClass: string
  contextLabelClass: string
  contextLabel: string
  title: string
  artifactLabel: string
  outcomeLabel?: string | null
  branchLabel?: string | null
  detail?: string | null
  statusLabel?: string | null
  hasOutput?: boolean
  rerunNodeId?: string | null
  onRerunFrom?: (nodeId: string) => void
  loopIndicator?: ReactNode
}) {
  return (
    <div className={cn("rounded-lg border px-3 py-2.5", contextToneClass)}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className={cn("ui-meta-label", contextLabelClass)}>{contextLabel}</div>
          <div className="mt-1 text-body-sm font-medium text-foreground">{title}</div>
          <div className="mt-1 ui-meta-text text-muted-foreground">
            {artifactLabel}
            {outcomeLabel ? ` · ${outcomeLabel}` : ""}
            {branchLabel ? ` · ${branchLabel}` : ""}
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <div className="ui-badge-row">
            {statusLabel && (
              <Badge variant="outline" className="ui-meta-text px-2 py-0">
                {statusLabel}
              </Badge>
            )}
            {hasOutput && (
              <Badge variant="outline" className="ui-meta-text px-2 py-0 text-muted-foreground">
                Output ready
              </Badge>
            )}
          </div>
          {rerunNodeId && onRerunFrom && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7"
              onClick={() => onRerunFrom(rerunNodeId)}
            >
              <RotateCcw size={12} />
              Rerun from here
            </Button>
          )}
        </div>
      </div>
      {detail ? (
        <p className="mt-2 ui-meta-text text-muted-foreground">{detail}</p>
      ) : null}
      {loopIndicator}
    </div>
  )
}

export function SelectedStepSummaryPanel({
  selectedStagePresentation,
  selectedStageContextToneClass,
  selectedStageContextLabelClass,
  selectedStageContextLabel,
  selectedStageBranchLabel,
  selectedStageBranchDetail,
  selectedStageStatusLabel,
  selectedStageHasOutput,
  canRerunSelectedStage,
  selectedStageId,
  onRerunFrom,
  showLoopStateIndicator,
  executionLoopSummary,
  approvalLoopSummary,
  activitySummaryItems = [],
  budgetWarning,
  budgetWarningClassName = "text-status-warning",
  showActivitySummary = false,
}: {
  selectedStagePresentation: RuntimeStagePresentation | null
  selectedStageContextToneClass: string
  selectedStageContextLabelClass: string
  selectedStageContextLabel: string
  selectedStageBranchLabel?: string | null
  selectedStageBranchDetail?: string | null
  selectedStageStatusLabel: string
  selectedStageHasOutput: boolean
  canRerunSelectedStage: boolean
  selectedStageId: string | null
  onRerunFrom?: (nodeId: string) => void
  showLoopStateIndicator: boolean
  executionLoopSummary: ExecutionLoopSummary | null
  approvalLoopSummary: ExecutionLoopSummary | null
  activitySummaryItems?: string[]
  budgetWarning?: string | null
  budgetWarningClassName?: string
  showActivitySummary?: boolean
}) {
  return (
    <>
      {selectedStagePresentation && (
        <StageSummaryCard
          contextToneClass={selectedStageContextToneClass}
          contextLabelClass={selectedStageContextLabelClass}
          contextLabel={selectedStageContextLabel}
          title={selectedStagePresentation.title}
          artifactLabel={selectedStagePresentation.artifactLabel}
          outcomeLabel={selectedStagePresentation.outcomeLabel}
          branchLabel={selectedStageBranchLabel}
          detail={selectedStageBranchDetail || selectedStagePresentation.outcomeText}
          statusLabel={selectedStageStatusLabel}
          hasOutput={selectedStageHasOutput}
          rerunNodeId={canRerunSelectedStage ? selectedStageId : null}
          onRerunFrom={onRerunFrom}
          loopIndicator={showLoopStateIndicator ? <LoopStateIndicator summary={executionLoopSummary} /> : null}
        />
      )}
      <ExecutionCheckRecord summary={executionLoopSummary} compact />
      <ExecutionLoopCard summary={approvalLoopSummary} compact detailSummary="Why / checks" />
      {showActivitySummary && activitySummaryItems.length > 0 && (
        <div className="rounded-lg border border-hairline bg-surface-2/50 px-3 py-2">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 ui-meta-text text-foreground-subtle">
            {activitySummaryItems.map((item) => (
              <span key={item}>{item}</span>
            ))}
            {budgetWarning && (
              <span className={budgetWarningClassName}>
                {budgetWarning}
              </span>
            )}
          </div>
        </div>
      )}
    </>
  )
}
