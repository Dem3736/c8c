import type { ReactNode } from "react"

import { SelectedStepSummaryPanel } from "@/components/output/SelectedStepSummaryPanel"
import { NodesTab } from "@/components/output/OutputSections"
import { cn } from "@/lib/cn"
import type { ExecutionLoopSummary } from "@/lib/execution-loops"
import type { RuntimeStagePresentation } from "@/lib/runtime-flow-labels"
import type { EvaluationResult } from "@/lib/store"
import type { NodeState } from "@shared/types"

interface DisplayNode {
  id: string
  label: string
  type: string
  indent?: boolean
}

export function ActivityTab({
  showIdleState,
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
  activitySummaryItems,
  budgetWarning,
  budgetWarningClassName,
  nodes,
  nodeStates,
  activeNodeId,
  evalResults,
  canRerun,
  onSelectNode,
  runAttentionNotice,
}: {
  showIdleState: boolean
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
  activitySummaryItems: string[]
  budgetWarning?: string | null
  budgetWarningClassName: string
  nodes: DisplayNode[]
  nodeStates: Record<string, NodeState>
  activeNodeId: string | null
  evalResults: Record<string, EvaluationResult[]>
  canRerun: boolean
  onSelectNode: (nodeId: string) => void
  runAttentionNotice?: ReactNode
}) {
  if (showIdleState) {
    return (
      <div className="rounded-lg surface-soft p-4">
        <div className="space-y-2">
          {selectedStagePresentation && (
            <div className={cn("rounded-lg border px-3 py-2.5", selectedStageContextToneClass)}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className={cn("ui-meta-label", selectedStageContextLabelClass)}>{selectedStageContextLabel}</div>
                  <div className="text-body-sm font-medium text-foreground">
                    {selectedStagePresentation.title}
                  </div>
                </div>
                <span className="ui-status-badge ui-meta-text border-hairline bg-surface-2 text-muted-foreground">
                  {selectedStagePresentation.artifactLabel}
                </span>
              </div>
              <p className="mt-1 ui-meta-text text-muted-foreground">
                {selectedStagePresentation.outcomeText}
              </p>
            </div>
          )}
          <p className="text-body-sm text-muted-foreground">
            No activity yet.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <SelectedStepSummaryPanel
        selectedStagePresentation={selectedStagePresentation}
        selectedStageContextToneClass={selectedStageContextToneClass}
        selectedStageContextLabelClass={selectedStageContextLabelClass}
        selectedStageContextLabel={selectedStageContextLabel}
        selectedStageBranchLabel={selectedStageBranchLabel}
        selectedStageBranchDetail={selectedStageBranchDetail}
        selectedStageStatusLabel={selectedStageStatusLabel}
        selectedStageHasOutput={selectedStageHasOutput}
        canRerunSelectedStage={canRerunSelectedStage}
        selectedStageId={selectedStageId}
        onRerunFrom={onRerunFrom}
        showLoopStateIndicator={showLoopStateIndicator}
        executionLoopSummary={executionLoopSummary}
        approvalLoopSummary={approvalLoopSummary}
        activitySummaryItems={activitySummaryItems}
        budgetWarning={budgetWarning}
        budgetWarningClassName={budgetWarningClassName}
        showActivitySummary
      />
      <NodesTab
        nodes={nodes}
        nodeStates={nodeStates}
        activeNodeId={activeNodeId}
        evalResults={evalResults}
        canRerun={canRerun}
        onRerunFrom={onRerunFrom}
        onSelectNode={onSelectNode}
      />
      {runAttentionNotice}
    </div>
  )
}
