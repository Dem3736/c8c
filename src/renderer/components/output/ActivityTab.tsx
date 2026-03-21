import type { ReactNode } from "react"

import { NodesTab } from "@/components/output/OutputSections"
import { SelectedStepSummaryPanel } from "@/components/output/SelectedStepSummaryPanel"
import { cn } from "@/lib/cn"
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
  onRerunFrom,
  activitySummaryItems,
  budgetWarning,
  budgetWarningClassName,
  nodes,
  nodeStates,
  activeNodeId,
  evalResults,
  canRerun,
  onSelectNode,
  onViewStepLog,
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
  onRerunFrom?: (nodeId: string) => void
  activitySummaryItems: string[]
  budgetWarning?: string | null
  budgetWarningClassName: string
  nodes: DisplayNode[]
  nodeStates: Record<string, NodeState>
  activeNodeId: string | null
  evalResults: Record<string, EvaluationResult[]>
  canRerun: boolean
  onSelectNode: (nodeId: string) => void
  onViewStepLog?: (() => void) | null
  runAttentionNotice?: ReactNode
}) {
  if (showIdleState) {
    return (
      <div className="space-y-2 px-1 py-1">
        <div className="space-y-2">
          {selectedStagePresentation && (
            <div className="border-l-2 border-hairline pl-3 py-0.5">
              <div className="min-w-0">
                <div className={cn("ui-meta-label", selectedStageContextLabelClass)}>{selectedStageContextLabel}</div>
                <div className="text-body-sm font-medium text-foreground">
                  {selectedStagePresentation.title}
                </div>
                <div className="mt-1 ui-meta-text text-muted-foreground">
                  {selectedStagePresentation.artifactLabel}
                </div>
              </div>
              <p className="mt-1 ui-meta-text text-muted-foreground">
                {selectedStagePresentation.outcomeText}
              </p>
            </div>
          )}
          <div className="ui-meta-text text-muted-foreground">No activity yet. Run this flow to see step-by-step progress here.</div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {selectedStagePresentation && (
        <SelectedStepSummaryPanel
          selectedStagePresentation={selectedStagePresentation}
          selectedStageContextLabelClass={selectedStageContextLabelClass}
          selectedStageContextLabel={selectedStageContextLabel}
          selectedStageBranchLabel={selectedStageBranchLabel}
          selectedStageBranchDetail={selectedStageBranchDetail}
          selectedStageStatusLabel={selectedStageStatusLabel}
        />
      )}
      {(activitySummaryItems.length > 0 || budgetWarning) && (
        <div className="border-b border-hairline px-1 pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
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
            {onViewStepLog ? (
              <button
                type="button"
                className="ui-meta-text text-muted-foreground hover:text-foreground ui-pressable"
                onClick={onViewStepLog}
              >
                View step log
              </button>
            ) : null}
          </div>
        </div>
      )}
      <NodesTab
        nodes={nodes}
        nodeStates={nodeStates}
        activeNodeId={activeNodeId}
        evalResults={evalResults}
        canRerun={canRerun}
        onRerunFrom={onRerunFrom}
        onSelectNode={onSelectNode}
        surface="flat"
      />
      {runAttentionNotice}
    </div>
  )
}
