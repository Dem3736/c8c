import { cn } from "@/lib/cn"
import type { RuntimeStagePresentation } from "@/lib/runtime-flow-labels"

function StepSummaryStrip({
  contextLabelClass,
  contextLabel,
  title,
  artifactLabel,
  branchLabel,
  detail,
  statusLabel,
}: {
  contextLabelClass: string
  contextLabel: string
  title: string
  artifactLabel: string
  branchLabel?: string | null
  detail?: string | null
  statusLabel?: string | null
}) {
  return (
    <div className="border-b border-hairline px-1 pb-3">
      <div className="min-w-0">
        <div className={cn("ui-meta-label", contextLabelClass)}>{contextLabel}</div>
        <div className="mt-1 text-body-sm font-medium text-foreground">{title}</div>
        <div className="mt-1 ui-meta-text text-muted-foreground">
          {[artifactLabel, statusLabel, branchLabel].filter(Boolean).join(" · ")}
        </div>
      </div>
      {detail ? (
        <p className="mt-2 ui-meta-text text-muted-foreground">{detail}</p>
      ) : null}
    </div>
  )
}

export function SelectedStepSummaryPanel({
  selectedStagePresentation,
  selectedStageContextLabelClass,
  selectedStageContextLabel,
  selectedStageBranchLabel,
  selectedStageBranchDetail,
  selectedStageStatusLabel,
}: {
  selectedStagePresentation: RuntimeStagePresentation | null
  selectedStageContextLabelClass: string
  selectedStageContextLabel: string
  selectedStageBranchLabel?: string | null
  selectedStageBranchDetail?: string | null
  selectedStageStatusLabel: string
}) {
  if (!selectedStagePresentation) return null

  return (
    <StepSummaryStrip
      contextLabelClass={selectedStageContextLabelClass}
      contextLabel={selectedStageContextLabel}
      title={selectedStagePresentation.title}
      artifactLabel={selectedStagePresentation.artifactLabel}
      branchLabel={selectedStageBranchLabel}
      detail={selectedStageBranchDetail || selectedStagePresentation.outcomeText}
      statusLabel={selectedStageStatusLabel}
    />
  )
}
