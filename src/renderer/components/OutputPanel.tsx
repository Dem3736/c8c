import { cn } from "@/lib/cn"
import { useAtomValue } from "jotai"
import {
  ArrowRight,
  FileText,
  History,
  Download,
  FolderTree,
  RotateCcw,
} from "lucide-react"
import { useRef, useEffect, useState, useCallback } from "react"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  DropdownMenuItem,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu"
import { CursorMenu } from "@/components/ui/cursor-menu"
import { Button } from "@/components/ui/button"
import { desktopRuntimeAtom } from "@/lib/store"
import {
  getRuntimeBranchDetail,
  getRuntimeBranchLabel,
  getRuntimeNodeLabel,
  getRuntimeStagePresentation,
} from "@/lib/runtime-flow-labels"
import { useOutputPanel } from "@/hooks/useOutputPanel"
import { HistoryTab } from "@/components/output/HistoryTab"
import { LogTab, NodesTab, formatCost } from "@/components/output/OutputSections"
import type { ArtifactRecord, LoadedRunResult, RunResult, WorkflowTemplate } from "@shared/types"
import ReactMarkdown, { type Components as MarkdownComponents } from "react-markdown"
import remarkGfm from "remark-gfm"
import rehypeHighlight from "rehype-highlight"
import { toast } from "sonner"
import { CopyButton } from "@/components/ui/copy-button"
import { DisclosurePanel } from "@/components/ui/disclosure-panel"
import { isRunInFlight } from "@/lib/workflow-execution"
import { templateAutoRunsOnContinue, templateRequiresStartApproval } from "@/lib/stage-run-policy"
import { consumeShortcut, isShortcutConsumed } from "@/lib/keyboard-shortcuts"
import { deriveTemplateDisplayLabel } from "@/lib/workflow-entry"
import { ExecutionSurfaceNoticeBanner } from "@/components/ui/execution-surface-notice"

const PREVIEW_MAX_W = "max-w-52" as const
const MARKDOWN_PROSE_CLASS = "prose-c8c"
const MARKDOWN_COMPONENTS: MarkdownComponents = {
  a: ({ href, children, ...props }) => {
    const safeHref = typeof href === "string" ? href : ""
    return (
      <a
        {...props}
        href={safeHref}
        target="_blank"
        rel="noreferrer noopener"
        onClick={(event) => {
          if (!safeHref) {
            event.preventDefault()
          }
        }}
      >
        {children}
      </a>
    )
  },
}

function formatTokenCount(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}k`
  return String(tokens)
}

function formatRunDuration(run: RunResult): string {
  if (typeof run.durationMs === "number" && run.durationMs >= 0) {
    if (run.durationMs < 1_000) return `${run.durationMs}ms`
    const seconds = run.durationMs / 1_000
    if (seconds < 60) return `${seconds.toFixed(1)}s`
    const minutes = Math.floor(seconds / 60)
    const remainSeconds = Math.round(seconds % 60)
    return `${minutes}m ${remainSeconds}s`
  }
  if (run.completedAt > 0 && run.startedAt > 0) {
    const delta = run.completedAt - run.startedAt
    if (delta > 0) {
      if (delta < 1_000) return `${delta}ms`
      const seconds = delta / 1_000
      if (seconds < 60) return `${seconds.toFixed(1)}s`
      const minutes = Math.floor(seconds / 60)
      const remainSeconds = Math.round(seconds % 60)
      return `${minutes}m ${remainSeconds}s`
    }
  }
  return "n/a"
}

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

const OUTPUT_STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  queued: "Queued",
  running: "Running",
  completed: "Completed",
  failed: "Needs attention",
  skipped: "Skipped",
  waiting_approval: "Waiting for approval",
  waiting_human: "Waiting for input",
}

function formatOutputStatusLabel(status: string | null) {
  if (!status) return "Pending"
  return OUTPUT_STATUS_LABELS[status] || status.replace(/_/g, " ")
}

function formatArtifactCountLabel(count: number) {
  return `${count} artifact${count === 1 ? "" : "s"}`
}

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
    </div>
  )
}

// ── Main OutputPanel ─────────────────────────────────────

export function OutputPanel({
  onOpenReport = (path: string) => { void window.api.openReport(path) },
  onRerunFrom,
  onContinueRun,
  requestedTab,
  reviewingPastRun = false,
  reviewedRun = null,
  reviewedRunDetails = null,
  reviewedRunLoading = false,
  reviewedRunError = null,
  onStartNewRun,
  onOpenInbox,
  onOpenArtifacts,
  nextStageTemplate = null,
  nextStageArtifacts = [],
  onRunNextStage,
  nextStagePending = false,
}: {
  onOpenReport?: (path: string) => void | Promise<void>
  onRerunFrom?: (nodeId: string, options?: { workspace?: string | null }) => Promise<void> | void
  onContinueRun?: (run: RunResult) => Promise<void> | void
  requestedTab?: { tab: "nodes" | "log" | "result" | "history"; nodeId?: string; nonce: number } | null
  reviewingPastRun?: boolean
  reviewedRun?: RunResult | null
  reviewedRunDetails?: LoadedRunResult | null
  reviewedRunLoading?: boolean
  reviewedRunError?: string | null
  onStartNewRun?: () => void
  onOpenInbox?: () => void
  onOpenArtifacts?: () => void
  nextStageTemplate?: WorkflowTemplate | null
  nextStageArtifacts?: ArtifactRecord[]
  onRunNextStage?: (() => Promise<void> | void) | null
  nextStagePending?: boolean
}) {
  const desktopRuntime = useAtomValue(desktopRuntimeAtom)
  const {
    runStatus,
    runOutcome,
    nodeStates,
    activeNodeId,
    selectedNodeId: inspectedNodeId,
    setSelectedNodeId: setInspectedNodeId,
    finalContent,
    workflow,
    evalResults,
    runtimeMeta,
    reportPath,
    pastRuns,
    selectedPastRun,
    setSelectedPastRun,
    workspace,
    artifactRecords,
    artifactPersistenceStatus,
    artifactPersistenceError,
    surfaceNotice,
    setSurfaceNotice,
  } = useOutputPanel()
  const [activeTab, setActiveTab] = useState("nodes")
  const [resultReadyPulse, setResultReadyPulse] = useState(false)
  const [outputContextMenu, setOutputContextMenu] = useState<
    | { x: number, y: number, scope: "result" }
    | null
  >(null)
  const resultPulseTimerRef = useRef<number | null>(null)
  const resultSignalShownRef = useRef(false)
  const previousRunStatusRef = useRef(runStatus)
  const latestPastRun = pastRuns[0] || null
  const selectedReviewRun = reviewedRun || selectedPastRun || latestPastRun
  const rerunWorkspace = reviewingPastRun ? selectedReviewRun?.workspace || null : workspace

  const handleRerunFrom = useCallback((nodeId: string) => {
    if (!onRerunFrom || !rerunWorkspace) return
    void onRerunFrom(nodeId, { workspace: rerunWorkspace })
  }, [onRerunFrom, rerunWorkspace])

  const reviewingRunHistory = reviewingPastRun && runStatus === "idle" && !!selectedReviewRun
  const reviewSnapshot = reviewingRunHistory ? reviewedRunDetails?.snapshot || null : null
  const reviewHumanTasks = reviewingRunHistory ? Object.values(reviewSnapshot?.humanTasks || {}) : []
  const openReviewTaskCount = reviewHumanTasks.filter((task) => task.status === "open").length
  const displayNodeStates = reviewingRunHistory ? (reviewSnapshot?.nodeStates || {}) : nodeStates
  const displayRuntimeMeta = reviewingRunHistory ? (reviewSnapshot?.runtimeMeta || {}) : runtimeMeta
  const displayEvalResults = reviewingRunHistory ? (reviewSnapshot?.evalResults || {}) : evalResults

  // Filter out template nodes that were replaced by runtime branches
  const replacedTemplateIds = new Set(
    Object.values(displayRuntimeMeta).map((m) => m.templateId).filter(Boolean),
  )

  const displayNodes = workflow.nodes
    .filter((n) => n.type !== "input" && n.type !== "output")
    .filter((n) => !replacedTemplateIds.has(n.id))
    .map((n) => ({
      id: n.id,
      label: getRuntimeNodeLabel(n, { fallbackId: n.id }),
      type: n.type,
    }))

  // Add runtime branch nodes (created by splitter expansion)
  const staticNodeIds = new Set(workflow.nodes.map((n) => n.id))
  const runtimeBranchIds = Object.keys(displayNodeStates)
    .filter((id) => id.includes("::") && !staticNodeIds.has(id))

  const templateById = new Map(workflow.nodes.map((n) => [n.id, n]))
  const templateLabelByBranchId = new Map<string, string>()
  const templateLabelCounts = new Map<string, number>()

  for (const branchId of runtimeBranchIds) {
    const meta = displayRuntimeMeta[branchId]
    if (!meta) continue
    const templateNode = templateById.get(meta.templateId)
    const templateLabel = templateNode
      ? getRuntimeNodeLabel(templateNode, { fallbackId: templateNode.id })
      : meta.templateId
    templateLabelByBranchId.set(branchId, templateLabel)
    templateLabelCounts.set(templateLabel, (templateLabelCounts.get(templateLabel) || 0) + 1)
  }

  const runtimeBranchNodes = runtimeBranchIds.map((id) => {
    const meta = displayRuntimeMeta[id]
    if (!meta) {
      return { id, label: `branch: ${id.split("::").pop()}`, type: "skill" as const, indent: true }
    }

    const templateLabel = templateLabelByBranchId.get(id)
    const shouldDisambiguateTemplate = !!templateLabel && (templateLabelCounts.get(templateLabel) || 0) > 1
    const templateSuffix = templateLabel
      ? shouldDisambiguateTemplate
        ? `${templateLabel} [${meta.templateId}]`
        : templateLabel
      : meta.templateId

    return {
      id,
      label: `branch: ${getRuntimeBranchLabel(meta.subtaskKey)} (${meta.branchIndex + 1}/${meta.totalBranches}) · ${templateSuffix}`,
      type: "skill" as const,
      indent: true,
    }
  })

  const allDisplayNodes = [...displayNodes, ...runtimeBranchNodes]
  const inspectableNodeIds = new Set([
    ...allDisplayNodes.map((node) => node.id),
    ...Object.keys(displayNodeStates),
  ])
  const selectedNodeId = inspectedNodeId && inspectableNodeIds.has(inspectedNodeId)
    ? inspectedNodeId
    : null
  const displayActiveNodeId = reviewingRunHistory ? selectedNodeId : activeNodeId
  const displayLabelByNodeId = new Map(allDisplayNodes.map((node) => [node.id, node.label]))
  for (const node of workflow.nodes) {
    if (!displayLabelByNodeId.has(node.id)) {
      displayLabelByNodeId.set(node.id, getRuntimeNodeLabel(node, { fallbackId: node.id }))
    }
  }
  const workflowOrderIndex = new Map(workflow.nodes.map((node, index) => [node.id, index]))
  const resultNodeOptions = Object.entries(displayNodeStates)
    .filter(([, state]) => typeof state.output?.content === "string")
    .map(([id, state]) => {
      const workflowNode = templateById.get(id)
      const label = workflowNode?.type === "output"
        ? `${displayLabelByNodeId.get(id) || id} (final)`
        : (displayLabelByNodeId.get(id) || id)
      return {
        id,
        label,
        hasContent: state.output!.content.trim().length > 0,
      }
    })
    .sort((a, b) => {
      const aIndex = workflowOrderIndex.get(a.id)
      const bIndex = workflowOrderIndex.get(b.id)
      if (aIndex != null && bIndex != null) return aIndex - bIndex
      if (aIndex != null) return -1
      if (bIndex != null) return 1
      return a.label.localeCompare(b.label)
    })
  const resultNodeOptionIds = new Set(resultNodeOptions.map((option) => option.id))

  // Parallel execution indicator
  const totalBranches = runtimeBranchNodes.length
  const completedBranches = runtimeBranchNodes.filter((n) => {
    const status = displayNodeStates[n.id]?.status
    return status === "completed" || status === "failed" || status === "skipped"
  }).length
  const branchesProgressPct = totalBranches > 0
    ? Math.round((completedBranches / totalBranches) * 100)
    : 0

  // Budget tracking
  const budgetCost = workflow.defaults?.budget_cost_usd ?? null
  const budgetTokens = workflow.defaults?.budget_tokens ?? null
  const accumulatedCost = Object.values(displayNodeStates).reduce(
    (sum, s) => sum + (s.metrics?.cost_usd || 0),
    0,
  )
  const totalTokensIn = Object.values(displayNodeStates).reduce(
    (sum, s) => sum + (s.metrics?.tokens_in || 0),
    0,
  )
  const totalTokensOut = Object.values(displayNodeStates).reduce(
    (sum, s) => sum + (s.metrics?.tokens_out || 0),
    0,
  )
  const totalTokens = totalTokensIn + totalTokensOut
  const budgetProgressRatio = budgetCost && budgetCost > 0
    ? accumulatedCost / budgetCost
    : 1
  const budgetWarning = budgetCost == null
    ? null
    : budgetProgressRatio >= 1
      ? "Budget exceeded. Execution may stop on the next budget check."
      : budgetProgressRatio >= 0.9
        ? "Budget warning: over 90% of cost limit is used."
        : budgetProgressRatio >= 0.7
          ? "Budget notice: over 70% of cost limit is used."
          : null

  const historicalResultContent = reviewedRunDetails?.reportContent || ""
  const hasNodeStates = Object.keys(displayNodeStates).length > 0
  const hasFinalResult = finalContent.trim().length > 0
  const hasStageResult = resultNodeOptions.length > 0
  const hasLiveResult = hasFinalResult || hasStageResult
  const hasHistoricalResult = reviewingRunHistory && !!selectedReviewRun
  const hasResult = hasLiveResult || hasHistoricalResult
  const outputResultNode = resultNodeOptions.find((option) => templateById.get(option.id)?.type === "output") || null
  const selectedResultNodeId = selectedNodeId && resultNodeOptionIds.has(selectedNodeId)
    ? selectedNodeId
    : outputResultNode?.id || resultNodeOptions[0]?.id || null
  const selectedResultNode = selectedResultNodeId
    ? resultNodeOptions.find((option) => option.id === selectedResultNodeId) || null
    : null
  const selectedResultOutput = selectedResultNodeId ? displayNodeStates[selectedResultNodeId]?.output : undefined
  const selectedResultMeta = selectedResultNodeId ? displayRuntimeMeta[selectedResultNodeId] : undefined
  const selectedResultWorkflowNode = selectedResultNodeId
    ? templateById.get(selectedResultMeta?.templateId || selectedResultNodeId) || null
    : null
  const selectedResultPresentation = selectedResultWorkflowNode
    ? getRuntimeStagePresentation(selectedResultWorkflowNode, {
      fallbackId: selectedResultNodeId || undefined,
      output: selectedResultOutput,
    })
    : null
  const selectedResultBranchLabel = selectedResultMeta
    ? getRuntimeBranchLabel(selectedResultMeta.subtaskKey)
    : null
  const selectedResultBranchDetail = selectedResultMeta
    ? getRuntimeBranchDetail(selectedResultMeta)
    : null
  const selectedResultMetrics = selectedResultNodeId
    ? displayNodeStates[selectedResultNodeId]?.metrics
    : undefined
  const selectedResultMetricItems = selectedResultMetrics
    ? [
        selectedResultMetrics.tokens_in > 0 ? `${formatTokenCount(selectedResultMetrics.tokens_in)} in` : null,
        selectedResultMetrics.tokens_out > 0 ? `${formatTokenCount(selectedResultMetrics.tokens_out)} out` : null,
        selectedResultMetrics.cost_usd > 0 ? formatCost(selectedResultMetrics.cost_usd) : null,
      ].filter(Boolean) as string[]
    : []
  const selectedResultMetricsLabel = selectedResultMetricItems.join(" · ")
  const selectedResultContent = selectedResultNodeId
    ? (displayNodeStates[selectedResultNodeId]?.output?.content || "")
    : null
  const displayedResultContent = reviewingRunHistory
    ? historicalResultContent
    : (selectedResultContent ?? finalContent)
  const isDisplayedResultEmpty = displayedResultContent.trim().length === 0
  const canCopyResult = displayedResultContent.length > 0
  const hasMultipleResultOptions = resultNodeOptions.length > 1
  const showIdleState = runStatus === "idle" && !hasNodeStates && !hasLiveResult && !reviewingRunHistory
  const defaultReviewStageId = reviewingRunHistory
    ? allDisplayNodes[0]?.id || null
    : null
  const selectedStageId = selectedNodeId || displayActiveNodeId || defaultReviewStageId
  const selectedStageMeta = selectedStageId ? displayRuntimeMeta[selectedStageId] : undefined
  const selectedStageWorkflowNode = selectedStageId
    ? templateById.get(selectedStageMeta?.templateId || selectedStageId) || null
    : null
  const selectedStageOutput = selectedStageId ? displayNodeStates[selectedStageId]?.output : undefined
  const selectedStagePresentation = selectedStageWorkflowNode
    ? getRuntimeStagePresentation(selectedStageWorkflowNode, {
      fallbackId: selectedStageId || undefined,
      output: selectedStageOutput,
    })
    : null
  const selectedStageBranchLabel = selectedStageMeta
    ? getRuntimeBranchLabel(selectedStageMeta.subtaskKey)
    : null
  const selectedStageBranchDetail = selectedStageMeta
    ? getRuntimeBranchDetail(selectedStageMeta)
    : null
  const selectedStageStatus = selectedStageId ? (displayNodeStates[selectedStageId]?.status || "pending") : null
  const selectedStageHasOutput = selectedStageId
    ? typeof displayNodeStates[selectedStageId]?.output?.content === "string" && displayNodeStates[selectedStageId]!.output!.content.trim().length > 0
    : false
  const selectedStageStatusLabel = formatOutputStatusLabel(selectedStageStatus)
  const nextStageId = allDisplayNodes.find((node) => {
    const status = displayNodeStates[node.id]?.status || "pending"
    return status === "queued" || status === "pending"
  })?.id || null
  const selectedStageContextLabel = selectedStageId
    ? selectedStageId === displayActiveNodeId && (
      selectedStageStatus === "running"
      || selectedStageStatus === "waiting_approval"
      || selectedStageStatus === "waiting_human"
      || selectedStageStatus === "failed"
    )
      ? selectedStageStatus === "failed"
        ? "Stage needing attention"
        : selectedStageStatus === "running"
          ? "Current stage"
          : "Blocked stage"
      : !reviewingRunHistory && selectedStageId === nextStageId
        ? "Next stage"
        : selectedStageStatus === "completed" || selectedStageStatus === "skipped"
          ? "Completed stage"
          : "Selected stage"
    : "Selected stage"
  const selectedStageContextToneClass = "border-hairline bg-surface-2/60"
  const selectedStageContextLabelClass = selectedStageId === displayActiveNodeId && selectedStageStatus === "running"
    ? "text-status-info"
    : selectedStageId === displayActiveNodeId && (selectedStageStatus === "waiting_approval" || selectedStageStatus === "waiting_human")
      ? "text-status-warning"
      : selectedStageStatus === "failed"
        ? "text-status-danger"
        : !reviewingRunHistory && selectedStageId === nextStageId
          ? "text-foreground"
          : selectedStageStatus === "completed" || selectedStageStatus === "skipped"
            ? "text-status-success"
            : "text-muted-foreground"
  const activitySummaryItems = [
    `${formatCost(accumulatedCost)}${budgetCost != null ? ` / ${formatCost(budgetCost)}` : ""} cost`,
    `${formatTokenCount(totalTokens)} tokens${budgetTokens != null ? ` / ${formatTokenCount(budgetTokens)}` : ""}`,
    totalBranches > 0 ? `${branchesProgressPct}% branches ready` : null,
  ].filter(Boolean) as string[]
  const selectedRunLabel = selectedReviewRun
    ? `${selectedReviewRun.workflowName || workflow.name || "Process"} · ${formatRunCompletedAt(selectedReviewRun)}`
    : null
  const canInspectSavedRun = reviewingRunHistory && !!reviewSnapshot && !reviewedRunLoading && !reviewedRunError
  const showBlockedReviewStrip = reviewingRunHistory && selectedReviewRun?.status === "blocked"
  const canContinueBlockedReview = showBlockedReviewStrip
    && !!reviewSnapshot
    && !reviewedRunLoading
    && openReviewTaskCount === 0
    && !!onContinueRun
    && !!selectedReviewRun
  const canStartFreshRun = Boolean(onStartNewRun) && !isRunInFlight(runStatus) && (reviewingRunHistory || runStatus === "done" || runStatus === "error" || pastRuns.length > 0)
  const canRerunStages = Boolean(onRerunFrom) && !isRunInFlight(runStatus) && !!rerunWorkspace
  const canRerunSelectedStage = Boolean(
    selectedStageId
    && canRerunStages
    && (selectedStageStatus === "completed" || selectedStageStatus === "failed"),
  )
  const showArtifactContinuation = !reviewingRunHistory && runOutcome === "completed" && (
    artifactPersistenceStatus !== "idle"
    || artifactRecords.length > 0
    || Boolean(artifactPersistenceError)
    || Boolean(nextStageTemplate)
  )
  const failedNodeErrors = Object.entries(displayNodeStates)
    .filter(([, state]) => state.status === "failed" && state.error)
  const artifactContinuationToneClass = artifactPersistenceStatus === "error"
    ? "surface-danger-soft"
    : artifactPersistenceStatus === "saved"
      ? "surface-success-soft"
      : "surface-inset-card"
  const nextStageRequiresApproval = templateRequiresStartApproval(nextStageTemplate)
  const nextStageAutoRuns = templateAutoRunsOnContinue(nextStageTemplate)
  const nextStageLabel = nextStageTemplate
    ? (deriveTemplateDisplayLabel(nextStageTemplate) || nextStageTemplate.name)
    : null
  const visibleArtifactContinuation = artifactRecords.slice(0, 4)
  const hiddenArtifactContinuationCount = Math.max(0, artifactRecords.length - visibleArtifactContinuation.length)
  const visibleNextStageArtifacts = nextStageArtifacts.slice(0, 4)
  const hiddenNextStageArtifactCount = Math.max(0, nextStageArtifacts.length - visibleNextStageArtifacts.length)
  const savedRunLoadingNotice = reviewingRunHistory && reviewedRunLoading ? (
    <div className="rounded-lg surface-soft p-4 ui-meta-text text-muted-foreground">
      Loading saved run details...
    </div>
  ) : null
  const savedRunErrorNotice = reviewingRunHistory && !reviewedRunLoading && reviewedRunError ? (
    <ExecutionSurfaceNoticeBanner
      notice={{
        level: "error",
        title: "Saved run unavailable",
        description: reviewedRunError,
        actionLabel: "",
        actionTarget: "result",
      }}
    />
  ) : null
  const savedRunSnapshotNotice = reviewingRunHistory && !reviewedRunLoading && !reviewedRunError && !reviewSnapshot ? (
    <ExecutionSurfaceNoticeBanner
      notice={{
        level: "warning",
        title: "Saved snapshot missing",
        description: "This saved run still has its final result, but the full stage snapshot is unavailable.",
        actionLabel: "",
        actionTarget: "result",
      }}
    />
  ) : null
  const blockedReviewBanner = showBlockedReviewStrip ? (
    <ExecutionSurfaceNoticeBanner
      notice={{
        level: "warning",
        title: "Run is blocked",
        description: openReviewTaskCount > 0
          ? `${openReviewTaskCount} review ${openReviewTaskCount === 1 ? "task is" : "tasks are"} still open for this run.`
          : "The checkpoint has been answered. Continue the process to finish this stage path.",
        actionLabel: "",
        actionTarget: "inbox",
      }}
      actions={(
        <>
          {openReviewTaskCount > 0 && !!reviewSnapshot && onOpenInbox && (
            <Button type="button" variant="outline" size="sm" onClick={onOpenInbox}>
              Open inbox
            </Button>
          )}
          {canContinueBlockedReview && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              title={`${desktopRuntime.primaryModifierLabel}↵`}
              onClick={() => {
                if (!selectedReviewRun || !onContinueRun) return
                void Promise.resolve(onContinueRun(selectedReviewRun))
              }}
            >
              Continue process
            </Button>
          )}
        </>
      )}
    />
  ) : null
  const runAttentionBanner = !reviewingRunHistory && (runStatus === "error" || runOutcome === "failed" || runOutcome === "interrupted") ? (
    <ExecutionSurfaceNoticeBanner
      notice={{
        level: "error",
        title: "Run needs attention",
        description: failedNodeErrors.length === 0
          ? "Inspect the activity log for the failing stage or the last interrupted step."
          : "One or more stages failed during the latest run.",
        actionLabel: "",
        actionTarget: "activity",
      }}
      children={failedNodeErrors.length > 0 ? (
        <div className="space-y-1 ui-meta-text text-status-danger">
          {failedNodeErrors.map(([id, s]) => {
            const node = allDisplayNodes.find((n) => n.id === id)
            return (
              <div key={id} className="text-status-danger/80">
                <span className="font-medium">{node?.label || id}:</span>{" "}
                {s.error}
              </div>
            )
          })}
        </div>
      ) : null}
    />
  ) : null

  const openNodeDetails = useCallback((nodeId: string) => {
    setInspectedNodeId(nodeId)
    const hasNodeOutput = typeof displayNodeStates[nodeId]?.output?.content === "string"
      && displayNodeStates[nodeId]!.output!.content.trim().length > 0
    setActiveTab(hasNodeOutput ? "result" : "log")
  }, [displayNodeStates, setInspectedNodeId])

  const handleCopyResult = useCallback(async () => {
    if (!canCopyResult) return
    try {
      await navigator.clipboard.writeText(displayedResultContent)
    } catch (error) {
      console.error("[OutputPanel] copy result failed:", error)
      toast.error("Could not copy result", {
        description: String(error),
      })
    }
  }, [canCopyResult, displayedResultContent])

  const handleExportResult = useCallback(async () => {
    if (!canCopyResult) return
    const content = displayedResultContent
    const stamp = new Date().toISOString().replace(/[:.]/g, "-")
    const workflowName = workflow.name || "process"
    const mdContent = `# ${workflowName}\n\nExported: ${new Date().toLocaleString()}\n\n---\n\n${content}`
    const blob = new Blob([mdContent], { type: "text/markdown;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${workflowName}-result-${stamp}.md`
    a.click()
    URL.revokeObjectURL(url)
  }, [canCopyResult, displayedResultContent, workflow.name])

  const handleOpenReport = useCallback(async (path: string) => {
    try {
      await Promise.resolve(onOpenReport(path))
    } catch (error) {
      console.error("[OutputPanel] open report failed:", error)
      toast.error("Could not open report file", {
        description: String(error),
      })
    }
  }, [onOpenReport])

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.defaultPrevented || isShortcutConsumed(event)) return

      const target = event.target as HTMLElement | null
      const tag = target?.tagName
      const isEditable = Boolean(
        target?.isContentEditable ||
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        target?.closest("[contenteditable=true]"),
      )
      if (isEditable) return

      const usesPrimaryModifier = desktopRuntime.primaryModifierKey === "meta"
        ? event.metaKey
        : event.ctrlKey
      if (!usesPrimaryModifier || event.key !== "Enter") return

      if (
        activeTab === "result"
        && showArtifactContinuation
        && !!nextStageTemplate
        && !!onRunNextStage
        && artifactPersistenceStatus !== "saving"
        && !nextStagePending
      ) {
        consumeShortcut(event)
        void Promise.resolve(onRunNextStage())
        return
      }

      if (canContinueBlockedReview && selectedReviewRun && onContinueRun) {
        consumeShortcut(event)
        void Promise.resolve(onContinueRun(selectedReviewRun))
      }
    }

    window.addEventListener("keydown", handler, true)
    return () => {
      window.removeEventListener("keydown", handler, true)
    }
  }, [
    activeTab,
    artifactPersistenceStatus,
    canContinueBlockedReview,
    desktopRuntime.primaryModifierKey,
    nextStagePending,
    nextStageTemplate,
    onContinueRun,
    onRunNextStage,
    selectedReviewRun,
    showArtifactContinuation,
  ])

  const handleSurfaceNoticeAction = useCallback(() => {
    if (!surfaceNotice) return
    if (surfaceNotice.actionTarget === "result") {
      setActiveTab("result")
      setSurfaceNotice(null)
      return
    }
    if (surfaceNotice.actionTarget === "activity") {
      setActiveTab("nodes")
      setSurfaceNotice(null)
      return
    }
    if (surfaceNotice.actionTarget === "inbox" && onOpenInbox) {
      onOpenInbox()
      setSurfaceNotice(null)
    }
  }, [onOpenInbox, setSurfaceNotice, surfaceNotice])

  useEffect(() => {
    if (!hasResult && activeTab === "result") {
      setActiveTab("nodes")
    }
  }, [activeTab, hasResult])

  useEffect(() => {
    if (activeTab === "history" && pastRuns.length === 0) {
      setActiveTab("nodes")
    }
  }, [activeTab, pastRuns.length])

  useEffect(() => {
    if (!requestedTab) return
    if (requestedTab.tab === "result" && !hasResult) return
    if (requestedTab.tab === "history" && pastRuns.length === 0) return
    if (requestedTab.nodeId) {
      setInspectedNodeId(requestedTab.nodeId)
    }
    setActiveTab(requestedTab.tab)
  }, [hasResult, pastRuns.length, requestedTab, setInspectedNodeId])

  useEffect(() => {
    if (runStatus !== "done" || !hasResult) {
      resultSignalShownRef.current = false
      setResultReadyPulse(false)
      previousRunStatusRef.current = runStatus
      return
    }
    const runJustCompleted = previousRunStatusRef.current !== "done"
    previousRunStatusRef.current = runStatus
    if (runJustCompleted) {
      resultSignalShownRef.current = true
      if (activeTab !== "result" && activeTab !== "history") {
        setActiveTab("result")
        setResultReadyPulse(false)
        return
      }
    }
    if (resultSignalShownRef.current) return
    resultSignalShownRef.current = true
    if (activeTab === "result") return
    setResultReadyPulse(true)
    if (resultPulseTimerRef.current) {
      window.clearTimeout(resultPulseTimerRef.current)
    }
    resultPulseTimerRef.current = window.setTimeout(() => setResultReadyPulse(false), 2800)
  }, [activeTab, hasResult, runStatus])

  useEffect(() => {
    return () => {
      if (resultPulseTimerRef.current) {
        window.clearTimeout(resultPulseTimerRef.current)
      }
    }
  }, [])

  return (
    <>
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-2.5 ui-fade-slide-in">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <label className="section-kicker">
              Inspect
            </label>
            {reviewingRunHistory && selectedReviewRun && (
              <p className="mt-1 ui-meta-text text-muted-foreground">
                Reviewing the latest saved run.
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {pastRuns.length > 0 && runStatus === "idle" && (
              <div className="flex items-center gap-2 rounded-lg border border-hairline bg-surface-1/80 px-2 py-1 ui-elevation-inset">
                <span className="ui-meta-label text-muted-foreground">Runs</span>
                <Select
                  value={selectedReviewRun?.runId || undefined}
                  onValueChange={(nextRunId) => {
                    const nextRun = pastRuns.find((run) => run.runId === nextRunId) || null
                    setSelectedPastRun(nextRun)
                    if (nextRun) setActiveTab("result")
                  }}
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
            {canStartFreshRun && (
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
                Result
              </TabsTrigger>
              <TabsTrigger value="history" className="px-3 py-1 text-body-sm" disabled={pastRuns.length === 0}>
                <History size={12} className="mr-1" />
                History{pastRuns.length > 0 && ` (${pastRuns.length})`}
              </TabsTrigger>
            </TabsList>
          </div>
        </div>
        {!reviewingRunHistory && surfaceNotice && (
          <ExecutionSurfaceNoticeBanner
            notice={surfaceNotice}
            onAction={
              surfaceNotice.actionTarget === "inbox" && !onOpenInbox
                ? null
                : handleSurfaceNoticeAction
            }
            onDismiss={() => setSurfaceNotice(null)}
          />
        )}
        {blockedReviewBanner}

        <TabsContent value="nodes" className="mt-0 ui-fade-slide-in">
          {showIdleState ? (
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
                      <Badge variant="outline" className="ui-meta-text px-2 py-0">
                        {selectedStagePresentation.artifactLabel}
                      </Badge>
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
          ) : (
            <div className="space-y-2">
              {reviewingRunHistory && (
                <div className="rounded-lg border border-hairline bg-surface-2/60 px-3 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="ui-meta-label text-muted-foreground">Viewing saved run</div>
                      <div className="mt-1 text-body-sm font-medium text-foreground">
                        {selectedRunLabel || "Last run"}
                      </div>
                    </div>
                    <Badge variant="outline" className="ui-meta-text px-2 py-0">
                      {selectedReviewRun?.status || "completed"}
                    </Badge>
                  </div>
                  <p className="mt-1 ui-meta-text text-muted-foreground">
                    Switch runs from the selector above.
                  </p>
                </div>
              )}
              {savedRunLoadingNotice}
              {savedRunErrorNotice}
              {savedRunSnapshotNotice}
              {(!reviewingRunHistory || canInspectSavedRun) && (
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
                  onRerunFrom={handleRerunFrom}
                />
              )}
              {activitySummaryItems.length > 0 && (
                <div className="rounded-lg border border-hairline bg-surface-2/50 px-3 py-2">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 ui-meta-text text-foreground-subtle">
                    {activitySummaryItems.map((item) => (
                      <span key={item}>{item}</span>
                    ))}
                    {budgetWarning && (
                      <span className={cn(
                        budgetProgressRatio >= 0.9 ? "text-status-danger" : "text-status-warning",
                      )}>
                        {budgetWarning}
                      </span>
                    )}
                  </div>
                </div>
              )}
              <NodesTab
                nodes={allDisplayNodes}
                nodeStates={displayNodeStates}
                activeNodeId={displayActiveNodeId}
                evalResults={displayEvalResults}
                canRerun={canRerunStages}
                onRerunFrom={handleRerunFrom}
                onSelectNode={openNodeDetails}
              />

                  {runAttentionBanner}
                </>
              )}
            </div>
          )}
        </TabsContent>

        <TabsContent value="log" className="mt-2 ui-fade-slide-in">
          {showIdleState ? (
            <div className="rounded-lg surface-soft p-6 text-center text-body-md text-muted-foreground">
              No log yet.
            </div>
          ) : (
            <div className="space-y-2">
              {savedRunLoadingNotice}
              {savedRunErrorNotice}
              {savedRunSnapshotNotice}
              {(!reviewingRunHistory || canInspectSavedRun) && (
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
                  onRerunFrom={handleRerunFrom}
                />
              )}
              <LogTab selectedNodeId={selectedStageId} nodeStates={displayNodeStates} evalResults={displayEvalResults} />
                </>
              )}
            </div>
          )}
        </TabsContent>

        <TabsContent value="result" className="mt-2 ui-fade-slide-in">
          {hasResult ? (
            <div
              className="space-y-2"
              onContextMenu={(event) => {
                event.preventDefault()
                setOutputContextMenu({
                  x: event.clientX,
                  y: event.clientY,
                  scope: "result",
                })
              }}
            >
              <div className="rounded-lg border border-hairline bg-surface-2/60 px-3 py-2.5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 space-y-1">
                    <div className="ui-meta-label text-foreground-subtle">
                      {reviewingRunHistory ? "Saved artifact" : "Primary artifact"}
                    </div>
                    <div className="text-body-sm font-medium text-foreground">
                      {reviewingRunHistory
                        ? (selectedResultPresentation?.artifactLabel || "Saved result")
                        : (selectedResultPresentation?.artifactLabel || "Final result")}
                    </div>
                    <div className="ui-meta-text text-muted-foreground">
                      {reviewingRunHistory
                        ? (selectedRunLabel || "Reviewing the selected saved run.")
                        : (selectedResultPresentation?.title || "Result from the latest completed stage.")}
                    </div>
                  </div>
                  <div className="ui-badge-row">
                    {reviewingRunHistory ? (
                      <Badge variant="outline" className="ui-meta-text px-2 py-0">
                        {selectedReviewRun?.status || "completed"}
                      </Badge>
                    ) : selectedResultPresentation && (
                      <Badge variant="outline" className="ui-meta-text px-2 py-0">
                        {selectedResultPresentation.artifactLabel}
                      </Badge>
                    )}
                    <Badge variant="outline" className="ui-meta-text px-2 py-0 text-muted-foreground">
                      {reviewingRunHistory
                        ? (selectedReviewRun ? formatRunDuration(selectedReviewRun) : "Saved run")
                        : (selectedResultBranchLabel || (isDisplayedResultEmpty ? "No content" : "Result"))}
                    </Badge>
                    {!reviewingRunHistory && selectedResultPresentation?.outcomeLabel && (
                      <Badge variant="outline" className="ui-meta-text px-2 py-0 text-muted-foreground">
                        {selectedResultPresentation.outcomeLabel}
                      </Badge>
                    )}
                  </div>
                </div>
                <p className="mt-2 ui-meta-text text-muted-foreground">
                  {reviewingRunHistory
                    ? (selectedRunLabel || "Reviewing the saved result from the selected run.")
                    : (selectedResultBranchDetail || selectedResultPresentation?.outcomeText || "Result ready.")}
                </p>
                {!reviewingRunHistory && selectedResultMetricsLabel && (
                  <div className="mt-2 ui-meta-text text-muted-foreground">
                    {selectedResultMetricsLabel}
                  </div>
                )}
              </div>
              {savedRunLoadingNotice}
              {savedRunErrorNotice}
              {!reviewingRunHistory && hasMultipleResultOptions && (
                <DisclosurePanel
                  summary={`Other stage results (${resultNodeOptions.length})`}
                  className="border border-hairline bg-surface-1/70"
                  contentClassName="space-y-2"
                >
                  <div className="space-y-1">
                    <p className="ui-meta-text text-muted-foreground">
                      Keep one primary artifact above. Switch only when you need a stage-specific result.
                    </p>
                    <Select
                      value={selectedResultNodeId || undefined}
                      onValueChange={(nextNodeId) => {
                        setInspectedNodeId(nextNodeId)
                      }}
                    >
                      <SelectTrigger className="h-control-sm w-full text-body-sm sm:w-[360px]">
                        <SelectValue placeholder="Select another result" />
                      </SelectTrigger>
                      <SelectContent>
                        {resultNodeOptions.map((option) => (
                          <SelectItem key={`result-node-${option.id}`} value={option.id}>
                            {option.label}{option.hasContent ? "" : " · empty result"}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </DisclosurePanel>
              )}
              {showArtifactContinuation && (
                <div className={cn("rounded-lg px-3 py-3", artifactContinuationToneClass)}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 space-y-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <div className="ui-meta-label text-muted-foreground">Continue with</div>
                        <Badge
                          variant={
                            artifactPersistenceStatus === "error"
                              ? "destructive"
                              : artifactPersistenceStatus === "saved"
                                ? "success"
                                : "outline"
                          }
                          className="ui-meta-text px-2 py-0"
                        >
                          {artifactPersistenceStatus === "saving"
                            ? "Preparing artifacts"
                            : artifactPersistenceStatus === "error"
                              ? "Needs attention"
                              : artifactRecords.length > 0
                                ? `${formatArtifactCountLabel(artifactRecords.length)} ready`
                                : "No artifacts"}
                        </Badge>
                        {nextStageLabel && (
                          <Badge variant="outline" className="ui-meta-text px-2 py-0">
                            Next: {nextStageLabel}
                          </Badge>
                        )}
                        {nextStageRequiresApproval && (
                          <Badge variant="warning" className="ui-meta-text px-2 py-0">
                            Approval before run
                          </Badge>
                        )}
                        {nextStageAutoRuns && (
                          <Badge variant="success" className="ui-meta-text px-2 py-0">
                            Auto-runs on continue
                          </Badge>
                        )}
                      </div>
                      <div className="text-body-sm font-medium text-foreground">
                        {artifactPersistenceStatus === "saving"
                          ? "Preparing reusable artifacts for the next stage."
                          : artifactPersistenceError
                            ? artifactPersistenceError
                            : nextStageTemplate
                              ? "Next stage is ready."
                              : artifactPersistenceStatus === "saved"
                                ? "Artifacts saved."
                                : "No reusable artifacts saved from this run."}
                      </div>
                      {nextStageTemplate?.output && (
                        <div className="rounded-lg border border-hairline bg-surface-1/70 px-3 py-2.5">
                          <div className="ui-meta-label text-muted-foreground">Next result</div>
                          <p className="mt-1 line-clamp-2 text-body-sm text-foreground">
                            {nextStageTemplate.output}
                          </p>
                        </div>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {nextStageTemplate && onRunNextStage && (
                        <Button
                          type="button"
                          size="sm"
                          title={`${desktopRuntime.primaryModifierLabel}↵`}
                          onClick={() => {
                            void Promise.resolve(onRunNextStage())
                          }}
                          disabled={artifactPersistenceStatus === "saving" || nextStagePending}
                        >
                          <ArrowRight size={12} />
                          {nextStagePending
                            ? "Opening..."
                            : nextStageLabel
                              ? `Continue: ${nextStageLabel}`
                              : "Continue"}
                        </Button>
                      )}
                      {onOpenArtifacts && artifactPersistenceStatus === "saved" && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={onOpenArtifacts}
                        >
                          <FolderTree size={12} />
                          Artifacts
                        </Button>
                      )}
                    </div>
                  </div>
                  {(artifactRecords.length > 0 || visibleNextStageArtifacts.length > 0) && (
                    <div className="mt-2 space-y-2">
                      {artifactRecords.length > 0 && (
                        <div className="space-y-1">
                          <div className="ui-meta-label text-muted-foreground">Saved now</div>
                          <div className="flex flex-wrap gap-1.5">
                            {visibleArtifactContinuation.map((artifact) => (
                              <Badge key={artifact.id} variant="outline" className="ui-meta-text px-2 py-0">
                                {artifact.title}
                              </Badge>
                            ))}
                            {hiddenArtifactContinuationCount > 0 && (
                              <Badge variant="outline" className="ui-meta-text px-2 py-0">
                                +{hiddenArtifactContinuationCount} more
                              </Badge>
                            )}
                          </div>
                        </div>
                      )}
                      {visibleNextStageArtifacts.length > 0 && (
                        <div className="space-y-1">
                          <div className="ui-meta-label text-muted-foreground">Used in next stage</div>
                          <div className="flex flex-wrap gap-1.5">
                            {visibleNextStageArtifacts.map((artifact) => (
                              <Badge key={`next-stage-${artifact.id}`} variant="success" className="ui-meta-text px-2 py-0">
                                {artifact.title}
                              </Badge>
                            ))}
                            {hiddenNextStageArtifactCount > 0 && (
                              <Badge variant="outline" className="ui-meta-text px-2 py-0">
                                +{hiddenNextStageArtifactCount} more
                              </Badge>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
              <div className="flex flex-wrap items-center gap-2">
                {(reviewingRunHistory ? selectedReviewRun?.reportPath : reportPath) && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const nextReportPath = reviewingRunHistory ? selectedReviewRun?.reportPath : reportPath
                      if (!nextReportPath) return
                      void handleOpenReport(nextReportPath)
                    }}
                  >
                    <FileText size={12} />
                    Open Report
                    <span
                      className={cn("text-muted-foreground truncate", PREVIEW_MAX_W)}
                      title={(reviewingRunHistory ? selectedReviewRun?.reportPath : reportPath) ?? undefined}
                    >
                      {(reviewingRunHistory ? selectedReviewRun?.reportPath : reportPath)?.split("/").pop()}
                    </span>
                  </Button>
                )}
                <CopyButton
                  text={displayedResultContent}
                  idleLabel="Copy Result"
                  copiedLabel="Copied"
                  idleAriaLabel="Copy result"
                  disabled={!canCopyResult}
                  onCopyError={(error) => {
                    console.error("[OutputPanel] copy result failed:", error)
                    toast.error("Could not copy result", {
                      description: String(error),
                    })
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void handleExportResult()}
                  disabled={!canCopyResult}
                >
                  <Download size={12} />
                  Export
                </Button>
                {canStartFreshRun && (
                  <Button type="button" variant="outline" size="sm" onClick={onStartNewRun}>
                    New run
                  </Button>
                )}
              </div>
              <div className="rounded-lg surface-soft p-3">
                {isDisplayedResultEmpty ? (
                  <div className="ui-meta-text text-muted-foreground">
                    {reviewingRunHistory
                      ? "No saved result content is available for this run."
                      : selectedResultNode
                      ? "This stage finished without a primary result."
                      : "Final result is empty."}
                  </div>
                ) : (
                  <div className={MARKDOWN_PROSE_CLASS}>
                    <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]} components={MARKDOWN_COMPONENTS}>
                      {displayedResultContent}
                    </ReactMarkdown>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="rounded-lg surface-soft p-6 ui-empty-state text-body-md text-muted-foreground">
              Step results will appear here as nodes complete.
            </div>
          )}
        </TabsContent>

        <TabsContent value="history" className="mt-2 ui-fade-slide-in">
          <HistoryTab
            pastRuns={pastRuns}
            runStatus={runStatus}
            onOpenReport={handleOpenReport}
            onContinueRun={onContinueRun}
            selectedRunId={selectedReviewRun?.runId || null}
            onSelectRun={(run) => {
              setSelectedPastRun(run)
              setActiveTab("result")
            }}
          />
        </TabsContent>
      </Tabs>

      <CursorMenu
        open={outputContextMenu !== null}
        x={outputContextMenu?.x || 0}
        y={outputContextMenu?.y || 0}
        onOpenChange={(open) => {
          if (!open) setOutputContextMenu(null)
        }}
      >
        {outputContextMenu?.scope === "result" && (
          <>
            <DropdownMenuLabel>Result</DropdownMenuLabel>
            <DropdownMenuItem
              disabled={!canCopyResult}
              onSelect={() => {
                void handleCopyResult()
                setOutputContextMenu(null)
              }}
            >
              Copy result
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={!reportPath}
              onSelect={() => {
                if (!reportPath) return
                void handleOpenReport(reportPath)
                setOutputContextMenu(null)
              }}
            >
              Open report file
            </DropdownMenuItem>
          </>
        )}
      </CursorMenu>
    </>
  )
}
