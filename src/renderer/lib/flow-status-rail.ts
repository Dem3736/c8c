import type { AppShellWorkflowEntry } from "./app-shell-command-palette"
import { buildRunProgressSummary, type RunStripTone } from "./run-progress"
import type { WorkflowExecutionState } from "./workflow-execution"

export interface FlowStatusRailEntry {
  id: string
  workflowPath: string
  projectPath: string
  label: string
  projectLabel: string
  stageLabel: string | null
  statusLabel: string
  tone: RunStripTone
  approvalPending: boolean
  selected: boolean
  keyHint: number | null
}

function isInFlight(status: WorkflowExecutionState["runStatus"]) {
  return status === "starting" || status === "running" || status === "paused" || status === "cancelling"
}

function hasRuntimeSummary(state: WorkflowExecutionState | null | undefined) {
  return Boolean(
    state?.workflowSnapshot
    && (isInFlight(state.runStatus) || state.runStatus === "done" || state.runStatus === "error"),
  )
}

function deriveRailEntryRank({
  state,
  selected,
  baseIndex,
}: {
  state: WorkflowExecutionState | null | undefined
  selected: boolean
  baseIndex: number
}) {
  const summary = hasRuntimeSummary(state)
    ? buildRunProgressSummary({
      workflow: state!.workflowSnapshot!,
      runtimeNodes: state!.runtimeNodes,
      runtimeMeta: state!.runtimeMeta,
      nodeStates: state!.nodeStates,
      runStatus: state!.runStatus,
      runOutcome: state!.runOutcome,
      activeNodeId: state!.activeNodeId,
    })
    : null

  let score = 0
  if (summary?.waitingApprovalSteps) score += 500
  if (summary?.tone === "danger") score += 400
  if (state && isInFlight(state.runStatus)) score += 300
  if (summary?.tone === "warning") score += 200
  if (summary) score += 100
  if (selected) score += 20
  score -= baseIndex

  return { score, summary }
}

function fallbackStageLabel(summary: ReturnType<typeof buildRunProgressSummary> | null) {
  if (!summary) return null
  if (summary.activeStepLabel) return summary.activeStepLabel
  if (summary.totalSteps > 0 && summary.completedSteps > 0) {
    return `${summary.completedSteps}/${summary.totalSteps} steps done`
  }
  return null
}

export function buildFlowStatusRailEntries({
  workflowEntries,
  executionStates,
  selectedWorkflowPath,
  limit = 5,
}: {
  workflowEntries: AppShellWorkflowEntry[]
  executionStates: Record<string, WorkflowExecutionState>
  selectedWorkflowPath: string | null
  limit?: number
}) {
  const ranked = workflowEntries.map((entry, index) => {
    const state = executionStates[entry.workflowPath]
      || Object.values(executionStates).find((candidate) => candidate.runWorkflowPath === entry.workflowPath)
      || null
    const selected = entry.workflowPath === selectedWorkflowPath
    const { score, summary } = deriveRailEntryRank({
      state,
      selected,
      baseIndex: index,
    })

    return {
      entry,
      state,
      summary,
      selected,
      score,
    }
  })

  ranked.sort((left, right) => right.score - left.score)

  return ranked.slice(0, limit).map((item, index) => ({
    id: item.entry.id,
    workflowPath: item.entry.workflowPath,
    projectPath: item.entry.projectPath,
    label: item.entry.label,
    projectLabel: item.entry.projectLabel,
    stageLabel: fallbackStageLabel(item.summary),
    statusLabel: item.summary?.phaseLabel || item.entry.metaLabel || "Idle",
    tone: item.summary?.tone || "info",
    approvalPending: Boolean(item.summary?.waitingApprovalSteps),
    selected: item.selected,
    keyHint: index < 5 ? index + 1 : null,
  }))
}
