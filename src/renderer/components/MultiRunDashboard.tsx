import { memo, useEffect, useMemo, useState } from "react"
import { useAtom, useAtomValue, useSetAtom } from "jotai"
import { toast } from "sonner"
import { toastError, toastErrorFromCatch } from "@/lib/toast-error"
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  CircleSlash2,
  ExternalLink,
  Eye,
  FolderSearch2,
  Loader2,
  Pause,
  Play,
  Square,
  TimerReset,
  Workflow as WorkflowIcon,
  XCircle,
} from "lucide-react"
import {
  currentWorkflowAtom,
  mainViewAtom,
  multiRunDashboardOpenAtom,
  selectedInboxTaskKeyAtom,
  selectedProjectAtom,
  selectedWorkflowPathAtom,
  workflowDirtyAtom,
  workflowSavedSnapshotAtom,
} from "@/lib/store"
import {
  approvalRequestsAtom,
  clearWorkflowExecutionStateAtom,
  pastRunsAtom,
  selectedPastRunAtom,
  updateWorkflowExecutionStateAtom,
  workflowExecutionStatesAtom,
  type WorkflowExecutionState,
} from "@/features/execution"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  CanvasDialogBody,
  CanvasDialogContent,
  CanvasDialogHeader,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/cn"
import { getWorkflowNodeLabel } from "@/lib/workflow-labels"
import { workflowSnapshot } from "@/lib/workflow-snapshot"
import { createEmptyWorkflow } from "@/lib/default-workflow"
import { useUnsavedChangesDialog } from "@/hooks/useUnsavedChangesDialog"
import type { RunResult, Workflow } from "@shared/types"

function isRunInFlight(status: WorkflowExecutionState["runStatus"]): boolean {
  return status === "starting" || status === "running" || status === "paused" || status === "cancelling"
}

function isDashboardVisibleState(state: WorkflowExecutionState): boolean {
  return isRunInFlight(state.runStatus)
    || state.runOutcome !== null
    || state.workspace !== null
    || state.reportPath !== null
    || state.finalContent.trim().length > 0
    || state.lastError !== null
    || Object.keys(state.nodeStates).length > 0
}

function folderName(path: string | null): string {
  if (!path) return "No project"
  return path.split(/[\\/]/).pop() || path
}

function formatDateTime(timestamp: number | null): string {
  if (!timestamp) return "Not available"
  return new Date(timestamp).toLocaleString()
}

function formatDurationMs(durationMs: number | null | undefined): string {
  if (durationMs == null || durationMs < 0) return "Not available"
  const totalSeconds = Math.round(durationMs / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  if (minutes <= 0) return `${seconds}s`
  return `${minutes}m ${String(seconds).padStart(2, "0")}s`
}

function formatTokenCount(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}k`
  return String(tokens)
}

function outcomeLabel(entry: DashboardEntry): string {
  if (entry.runStatus === "starting") return "Starting"
  if (entry.runStatus === "running") return entry.approvalCount > 0 ? "Waiting for approval" : "Running"
  if (entry.runStatus === "paused") return "Paused"
  if (entry.runStatus === "cancelling") return "Stopping"
  if (entry.runOutcome === "cancelled") return "Cancelled"
  if (entry.runOutcome === "failed") return "Failed"
  if (entry.runOutcome === "interrupted") return "Interrupted"
  if (entry.runOutcome === "completed") return "Completed"
  if (entry.runStatus === "error") return "Failed"
  if (entry.runStatus === "done") return "Completed"
  return "Idle"
}

function outcomeClasses(entry: DashboardEntry): string {
  if (entry.runStatus === "paused" || entry.approvalCount > 0) {
    return "ui-status-badge-warning"
  }
  if (entry.runStatus === "starting" || entry.runStatus === "running" || entry.runStatus === "cancelling") {
    return "ui-status-badge-info"
  }
  if (entry.runOutcome === "failed" || entry.runOutcome === "interrupted" || entry.lastError) {
    return "ui-status-badge-danger"
  }
  return "ui-status-badge-success"
}

function outcomeIcon(entry: DashboardEntry) {
  if (entry.runStatus === "starting" || entry.runStatus === "running" || entry.runStatus === "cancelling") {
    return <Loader2 size={12} className="animate-spin" aria-hidden="true" />
  }
  if (entry.runStatus === "paused" || entry.approvalCount > 0) {
    return <Pause size={12} aria-hidden="true" />
  }
  if (entry.runOutcome === "failed" || entry.runOutcome === "interrupted" || entry.lastError) {
    return <XCircle size={12} aria-hidden="true" />
  }
  if (entry.runOutcome === "cancelled") {
    return <CircleSlash2 size={12} aria-hidden="true" />
  }
  return <CheckCircle2 size={12} aria-hidden="true" />
}

function buildNodeLabel(state: WorkflowExecutionState, nodeId: string | null): string | null {
  if (!nodeId) return null
  const runtimeNode = state.runtimeNodes.find((node) => node.id === nodeId)
  if (runtimeNode) return getWorkflowNodeLabel(runtimeNode)
  const workflowNode = state.workflowSnapshot?.nodes.find((node) => node.id === nodeId)
  if (workflowNode) return getWorkflowNodeLabel(workflowNode)
  if (nodeId.includes("::")) {
    const runtimeMeta = state.runtimeMeta[nodeId]
    if (runtimeMeta) {
      return `branch: ${runtimeMeta.subtaskKey} (${runtimeMeta.branchIndex + 1}/${runtimeMeta.totalBranches})`
    }
  }
  return nodeId
}

function summarizeExecution(state: WorkflowExecutionState) {
  const nodeTypeById = new Map(
    (state.runtimeNodes.length > 0 ? state.runtimeNodes : state.workflowSnapshot?.nodes || [])
      .map((node) => [node.id, node.type]),
  )
  const stepNodeIds = new Set<string>()
  for (const [nodeId, nodeType] of nodeTypeById.entries()) {
    if (nodeType !== "input" && nodeType !== "output") {
      stepNodeIds.add(nodeId)
    }
  }
  for (const nodeId of Object.keys(state.nodeStates)) {
    const nodeType = nodeTypeById.get(nodeId)
    if ((nodeType && nodeType !== "input" && nodeType !== "output") || nodeId.includes("::")) {
      stepNodeIds.add(nodeId)
    }
  }

  let completedSteps = 0
  let runningSteps = 0
  let waitingApprovalSteps = 0
  let failedSteps = 0

  for (const nodeId of stepNodeIds) {
    const status = state.nodeStates[nodeId]?.status || "pending"
    if (status === "completed" || status === "skipped") completedSteps += 1
    if (status === "running") runningSteps += 1
    if (status === "waiting_approval" || status === "waiting_human") waitingApprovalSteps += 1
    if (status === "failed") failedSteps += 1
  }

  return {
    totalSteps: stepNodeIds.size,
    completedSteps,
    runningSteps,
    waitingApprovalSteps,
    failedSteps,
  }
}

function buildEntrySortTimestamp(entry: DashboardEntry): number {
  return entry.lastUpdatedAt
    || entry.completedAt
    || entry.runStartedAt
    || entry.pastRun?.completedAt
    || entry.pastRun?.startedAt
    || 0
}

function summarizeCost(entry: DashboardEntry): { totalCost: number; totalTokens: number } {
  if (entry.pastRun?.totalCost != null || entry.pastRun?.totalTokensIn != null || entry.pastRun?.totalTokensOut != null) {
    return {
      totalCost: entry.pastRun.totalCost || 0,
      totalTokens: (entry.pastRun.totalTokensIn || 0) + (entry.pastRun.totalTokensOut || 0),
    }
  }

  let totalCost = 0
  let totalTokens = 0
  for (const nodeState of Object.values(entry.nodeStates)) {
    if (nodeState.metrics) {
      totalCost += nodeState.metrics.cost_usd || 0
      totalTokens += (nodeState.metrics.tokens_in || 0) + (nodeState.metrics.tokens_out || 0)
    }
  }
  return { totalCost, totalTokens }
}

function isFailureEntry(entry: DashboardEntry): boolean {
  return entry.runStatus === "error"
    || entry.runOutcome === "failed"
    || entry.runOutcome === "interrupted"
    || Boolean(entry.lastError)
}

function triageGroup(entry: DashboardEntry): "needs_action" | "running" | "recent" {
  if (entry.approvalCount > 0 || isFailureEntry(entry)) return "needs_action"
  if (entry.runStatus === "paused" || isRunInFlight(entry.runStatus)) return "running"
  return "recent"
}

function triagePriority(entry: DashboardEntry): number {
  if (entry.approvalCount > 0) return 0
  if (isFailureEntry(entry)) return 1
  if (entry.runStatus === "paused") return 2
  if (isRunInFlight(entry.runStatus)) return 3
  if (entry.runOutcome === "completed" || entry.runStatus === "done") return 4
  if (entry.runOutcome === "cancelled") return 5
  return 6
}

function entryDurationMs(entry: DashboardEntry, now: number): number | null {
  if (entry.pastRun?.durationMs != null) return entry.pastRun.durationMs
  if (entry.runStartedAt && isRunInFlight(entry.runStatus)) {
    return Math.max(0, now - entry.runStartedAt)
  }
  if (entry.completedAt && entry.runStartedAt) {
    return Math.max(0, entry.completedAt - entry.runStartedAt)
  }
  return null
}

function entryDurationLabel(entry: DashboardEntry, now: number): string | null {
  const durationMs = entryDurationMs(entry, now)
  return durationMs == null ? null : formatDurationMs(durationMs)
}

function entryScanLine(entry: DashboardEntry, now: number): string {
  const parts = [
    entry.progress.totalSteps > 0
      ? `Step ${Math.min(entry.progress.completedSteps, entry.progress.totalSteps)}/${entry.progress.totalSteps}`
      : null,
    entryDurationLabel(entry, now),
    entry.activeNodeLabel && isRunInFlight(entry.runStatus)
      ? entry.activeNodeLabel
      : null,
    entry.approvalCount > 0
      ? `${entry.approvalCount} approval${entry.approvalCount === 1 ? "" : "s"} pending`
      : null,
    isFailureEntry(entry) && !entry.approvalCount
      ? "Needs review"
      : null,
  ].filter((value): value is string => Boolean(value))

  return parts.join(" · ")
}

function triageHeadline(entry: DashboardEntry): string {
  if (entry.approvalCount > 0) {
    return `${entry.approvalCount} approval${entry.approvalCount === 1 ? "" : "s"} waiting`
  }
  if (isFailureEntry(entry)) {
    return entry.activeNodeLabel
      ? `${entry.activeNodeLabel} failed`
      : "Run failed"
  }
  if (entry.runStatus === "paused") return "Run paused"
  if (entry.runStatus === "starting") return "Run starting"
  if (entry.runStatus === "running") {
    return entry.activeNodeLabel
      ? `${entry.activeNodeLabel} is running`
      : "Run in progress"
  }
  if (entry.runStatus === "cancelling") return "Run stopping"
  if (entry.runOutcome === "completed" || entry.runStatus === "done") return "Run completed"
  if (entry.runOutcome === "cancelled") return "Run cancelled"
  return "Recent flow state"
}

function triageSummary(entry: DashboardEntry, now: number): string {
  const parts = [
    folderName(entry.projectPath),
    entry.progress.totalSteps > 0
      ? `Step ${Math.min(entry.progress.completedSteps, entry.progress.totalSteps)}/${entry.progress.totalSteps}`
      : null,
    entryDurationLabel(entry, now),
    entry.approvalCount > 0
      ? `${entry.approvalCount} pending approval${entry.approvalCount === 1 ? "" : "s"}`
      : null,
    entry.lastError && entry.approvalCount === 0
      ? "Open the flow to inspect the failing step."
      : null,
  ].filter((value): value is string => Boolean(value))

  return parts.join(" · ")
}

function primaryActionLabel(entry: DashboardEntry): string {
  if (entry.runStatus === "paused" && entry.runId) return "Resume run"
  if (entry.approvalCount > 0) return "Review decision"
  if (isFailureEntry(entry)) return "Inspect failure"
  if (isRunInFlight(entry.runStatus)) return "Open live run"
  if (entry.runOutcome === "completed" || entry.runStatus === "done") return "Review result"
  return "Open flow"
}

function groupMetaLabel(group: "needs_action" | "running" | "recent"): string {
  if (group === "needs_action") return "Needs action"
  if (group === "running") return "Running now"
  return "Recent"
}

function toExecutionStateSnapshot(entry: DashboardEntry): WorkflowExecutionState {
  const {
    workflowKey: _workflowKey,
    workflowPath: _workflowPath,
    approvalCount: _approvalCount,
    approvalMessages: _approvalMessages,
    isSelectedWorkflow: _isSelectedWorkflow,
    activeNodeLabel: _activeNodeLabel,
    progress: _progress,
    pastRun: _pastRun,
    ...state
  } = entry

  return structuredClone(state)
}

interface DashboardEntry extends WorkflowExecutionState {
  workflowKey: string
  workflowPath: string | null
  approvalCount: number
  approvalMessages: string[]
  isSelectedWorkflow: boolean
  activeNodeLabel: string | null
  progress: ReturnType<typeof summarizeExecution>
  pastRun: RunResult | null
}

const DashboardSidebarEntry = memo(function DashboardSidebarEntry({
  entry,
  isSelected,
  onSelect,
  now,
}: {
  entry: DashboardEntry
  isSelected: boolean
  onSelect: (key: string) => void
  now: number
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(entry.workflowKey)}
      className={cn(
        "ui-pressable w-full rounded-lg px-3 py-3 text-left ui-transition-colors ui-motion-fast",
        isSelected
          ? "bg-surface-2/80 text-foreground"
          : "bg-transparent text-foreground hover:bg-surface-2/50",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-body-sm font-medium text-foreground">
            {entry.workflowName || (entry.workflowPath ? "Untitled flow" : "Unsaved draft")}
          </p>
          <p className="mt-0.5 truncate ui-meta-text text-muted-foreground">
            {folderName(entry.projectPath)}
          </p>
        </div>
        <span className={cn("ui-status-badge shrink-0 ui-meta-text", outcomeClasses(entry))}>
          {outcomeIcon(entry)}
          {outcomeLabel(entry)}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 ui-meta-text text-muted-foreground">
        <span>{entryScanLine(entry, now)}</span>
      </div>
    </button>
  )
})

export function MultiRunDashboard() {
  const [open, setOpen] = useAtom(multiRunDashboardOpenAtom)
  const [workflowExecutionStates] = useAtom(workflowExecutionStatesAtom)
  const [approvalRequests] = useAtom(approvalRequestsAtom)
  const [pastRuns] = useAtom(pastRunsAtom)
  const [selectedProject, setSelectedProject] = useAtom(selectedProjectAtom)
  const [selectedWorkflowPath, setSelectedWorkflowPath] = useAtom(selectedWorkflowPathAtom)
  const [, setCurrentWorkflow] = useAtom(currentWorkflowAtom)
  const [, setWorkflowSavedSnapshot] = useAtom(workflowSavedSnapshotAtom)
  const [, setSelectedInboxTaskKey] = useAtom(selectedInboxTaskKeyAtom)
  const [, setSelectedPastRun] = useAtom(selectedPastRunAtom)
  const workflowDirty = useAtomValue(workflowDirtyAtom)
  const [, setMainView] = useAtom(mainViewAtom)
  const updateWorkflowExecutionState = useSetAtom(updateWorkflowExecutionStateAtom)
  const clearWorkflowExecutionState = useSetAtom(clearWorkflowExecutionStateAtom)
  const [selectedEntryKey, setSelectedEntryKey] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const { confirmDiscard, unsavedChangesDialog } = useUnsavedChangesDialog()

  const entriesWithHistory = useMemo(() => {
    const historyByWorkspace = new Map<string, RunResult>()
    const historyByPath = new Map<string, RunResult>()
    for (const run of pastRuns) {
      if (run.workspace && !historyByWorkspace.has(run.workspace)) {
        historyByWorkspace.set(run.workspace, run)
      }
      if (run.workflowPath && !historyByPath.has(run.workflowPath)) {
        historyByPath.set(run.workflowPath, run)
      }
    }

    return Object.entries(workflowExecutionStates)
      .filter(([, state]) => isDashboardVisibleState(state))
      .map(([workflowKey, state]): DashboardEntry => {
        const matchingRequests = approvalRequests.filter((request) => request.workflowKey === workflowKey)
        const workflowPath = workflowKey === "__draft__" ? null : workflowKey
        const matchingPastRun = state.workspace
          ? historyByWorkspace.get(state.workspace)
          : (workflowPath ? historyByPath.get(workflowPath) : undefined)
        const progress = summarizeExecution(state)
        return {
          ...state,
          workflowKey,
          workflowPath,
          approvalCount: matchingRequests.length,
          approvalMessages: matchingRequests.map((request) => request.message || request.nodeId),
          isSelectedWorkflow: selectedWorkflowPath === workflowPath,
          activeNodeLabel: buildNodeLabel(state, state.activeNodeId),
          progress,
          pastRun: matchingPastRun || null,
        }
      })
      .sort((left, right) => {
        const priorityDiff = triagePriority(left) - triagePriority(right)
        if (priorityDiff !== 0) return priorityDiff
        return buildEntrySortTimestamp(right) - buildEntrySortTimestamp(left)
      })
  }, [approvalRequests, pastRuns, selectedWorkflowPath, workflowExecutionStates])

  const selectedEntry = entriesWithHistory.find((entry) => entry.workflowKey === selectedEntryKey) || entriesWithHistory[0] || null
  const activeCount = entriesWithHistory.filter((entry) => isRunInFlight(entry.runStatus)).length
  const aggregateCounts = useMemo(() => ({
    needsAction: entriesWithHistory.filter((entry) => triageGroup(entry) === "needs_action").length,
    running: entriesWithHistory.filter((entry) => triageGroup(entry) === "running").length,
    recent: entriesWithHistory.filter((entry) => triageGroup(entry) === "recent").length,
  }), [entriesWithHistory])
  const groupedEntries = useMemo(
    () => [
      {
        id: "needs_action" as const,
        label: "Needs action",
        entries: entriesWithHistory.filter((entry) => triageGroup(entry) === "needs_action"),
      },
      {
        id: "running" as const,
        label: "Running now",
        entries: entriesWithHistory.filter((entry) => triageGroup(entry) === "running"),
      },
      {
        id: "recent" as const,
        label: "Recent",
        entries: entriesWithHistory.filter((entry) => triageGroup(entry) === "recent"),
      },
    ].filter((group) => group.entries.length > 0),
    [entriesWithHistory],
  )

  useEffect(() => {
    if (!open) return
    if (entriesWithHistory.length === 0) {
      setSelectedEntryKey(null)
      return
    }
    if (!selectedEntryKey || !entriesWithHistory.some((entry) => entry.workflowKey === selectedEntryKey)) {
      setSelectedEntryKey(entriesWithHistory[0].workflowKey)
    }
  }, [entriesWithHistory, open, selectedEntryKey])

  useEffect(() => {
    if (!open || activeCount === 0) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [activeCount, open])

  const focusWorkflow = async (entry: DashboardEntry) => {
    const clearReviewState = () => {
      setSelectedInboxTaskKey(null)
      setSelectedPastRun(null)
    }

    if (entry.isSelectedWorkflow) {
      clearReviewState()
      setMainView("thread")
      setOpen(false)
      return
    }
    if (!(await confirmDiscard("open another flow", workflowDirty))) {
      return
    }

    if (entry.projectPath && entry.projectPath !== selectedProject) {
      setSelectedProject(entry.projectPath)
    }

    setMainView("thread")

    const restoreWorkflowSnapshot = (snapshot: Workflow | null) => {
      if (!snapshot) return false
      const restoredWorkflow = structuredClone(snapshot)
      setSelectedWorkflowPath(null)
      setCurrentWorkflow(restoredWorkflow)
      setWorkflowSavedSnapshot(workflowSnapshot(createEmptyWorkflow()))
      clearReviewState()
      return true
    }

    if (entry.workflowPath) {
      try {
        const loadedWorkflow = await window.api.loadWorkflow(entry.workflowPath)
        setSelectedWorkflowPath(entry.workflowPath)
        setCurrentWorkflow(loadedWorkflow)
        setWorkflowSavedSnapshot(workflowSnapshot(loadedWorkflow))
        clearReviewState()
        setOpen(false)
        return
      } catch (error) {
        if (!restoreWorkflowSnapshot(entry.workflowSnapshot)) {
          toastErrorFromCatch("Could not open flow", error)
          return
        }
      }
    } else if (!restoreWorkflowSnapshot(entry.workflowSnapshot)) {
      toastError("Could not open flow", {
        description: "This dashboard entry does not have a restorable flow snapshot.",
      })
      return
    }

    setOpen(false)
  }

  const pauseExecution = async (entry: DashboardEntry) => {
    if (!entry.runId) return
    try {
      const paused = await window.api.pauseRun(entry.runId)
      if (!paused) {
        toastError("Could not pause run")
        return
      }
      updateWorkflowExecutionState({
        key: entry.workflowKey,
        update: (previous) => ({ ...previous, runStatus: "paused" }),
      })
    } catch (error) {
      toastErrorFromCatch("Could not pause run", error)
    }
  }

  const resumeExecution = async (entry: DashboardEntry) => {
    if (!entry.runId) return
    try {
      const resumed = await window.api.resumeRun(entry.runId)
      if (!resumed) {
        toastError("Could not resume run")
        return
      }
      updateWorkflowExecutionState({
        key: entry.workflowKey,
        update: (previous) => ({ ...previous, runStatus: "running" }),
      })
    } catch (error) {
      toastErrorFromCatch("Could not resume run", error)
    }
  }

  const cancelExecution = async (entry: DashboardEntry) => {
    if (!entry.runId) return
    updateWorkflowExecutionState({
      key: entry.workflowKey,
      update: (previous) => ({ ...previous, runStatus: "cancelling" }),
    })
    try {
      const cancelled = await window.api.cancelRun(entry.runId)
      if (!cancelled) {
        updateWorkflowExecutionState({
          key: entry.workflowKey,
          update: (previous) => ({ ...previous, runStatus: entry.runStatus }),
        })
        toastError("Could not stop run")
      }
    } catch (error) {
      updateWorkflowExecutionState({
        key: entry.workflowKey,
        update: (previous) => ({ ...previous, runStatus: entry.runStatus }),
      })
      toastErrorFromCatch("Could not stop run", error)
    }
  }

  const clearEntry = (entry: DashboardEntry) => {
    if (isRunInFlight(entry.runStatus)) return
    const snapshot = toExecutionStateSnapshot(entry)
    clearWorkflowExecutionState(entry.workflowKey)
    toast.success("Removed from triage view", {
      action: {
        label: "Undo",
        onClick: () => {
          updateWorkflowExecutionState({
            key: entry.workflowKey,
            update: snapshot,
          })
          setSelectedEntryKey(entry.workflowKey)
        },
      },
    })
  }

  const selectedEntryCost = selectedEntry ? summarizeCost(selectedEntry) : { totalCost: 0, totalTokens: 0 }
  const selectedEntryDurationLabel = selectedEntry ? entryDurationLabel(selectedEntry, now) : null

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <CanvasDialogContent size="xl" className="max-h-[86vh] flex flex-col p-0 gap-0">
          <CanvasDialogHeader className="surface-depth-header border-b border-hairline">
            <DialogTitle className="flex items-center gap-2">
              <Activity size={16} />
              Runs Dashboard
            </DialogTitle>
            <DialogDescription>
              {activeCount > 0
                ? `${activeCount} run${activeCount === 1 ? "" : "s"} active across flows.`
                : "Inspect recent session runs and jump back into any flow."}
            </DialogDescription>
          </CanvasDialogHeader>

          <CanvasDialogBody className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[320px,1fr] gap-0 p-0">
            <div className="border-b border-hairline lg:border-b-0 lg:border-r bg-surface-1/40 min-h-[240px] lg:min-h-0 flex flex-col">
              <div className="flex items-center justify-between px-4 py-3 border-b border-hairline">
                <div>
                  <p className="text-body-sm font-medium text-foreground">Session runs</p>
                  <p className="ui-meta-text text-muted-foreground">
                    {aggregateCounts.needsAction} need action · {aggregateCounts.running} live · {aggregateCounts.recent} recent
                  </p>
                </div>
              </div>
              <div className="ui-scroll-region min-h-0 max-h-[320px] overflow-y-auto p-2 lg:max-h-none lg:flex-1">
                {entriesWithHistory.length === 0 ? (
                  <div className="p-4 text-body-sm text-muted-foreground">
                    No active or recent runs in this session yet.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {groupedEntries.map((group) => (
                      <section key={group.id} className="space-y-1.5">
                        <div className="px-3">
                          <p className="ui-meta-label text-muted-foreground">{group.label}</p>
                        </div>
                        <div className="space-y-1">
                          {group.entries.map((entry) => (
                            <DashboardSidebarEntry
                              key={entry.workflowKey}
                              entry={entry}
                              isSelected={selectedEntryKey === entry.workflowKey}
                              onSelect={setSelectedEntryKey}
                              now={now}
                            />
                          ))}
                        </div>
                      </section>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="min-h-0">
              {selectedEntry ? (
                <div key={selectedEntry.workflowKey} className="flex h-full flex-col ui-fade-slide-in">
                  <div className="border-b border-hairline px-5 py-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="truncate text-title-md text-foreground">
                          {selectedEntry.workflowName || (selectedEntry.workflowPath ? "Untitled flow" : "Unsaved draft")}
                        </h3>
                        {selectedEntry.isSelectedWorkflow && (
                          <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">
                            Current flow
                          </Badge>
                        )}
                      </div>
                      <p className="mt-1 text-body-sm text-muted-foreground">
                        {selectedEntry.workflowPath || "Unsaved draft flow"}
                      </p>
                    </div>
                  </div>

                  <div className="ui-scroll-region flex-1 overflow-y-auto px-5 py-4">
                    <section className="rounded-xl surface-panel p-5 space-y-5 ui-fade-slide-in">
                      <div className="space-y-2">
                        <p className="section-kicker">{groupMetaLabel(triageGroup(selectedEntry))}</p>
                        <h4 className="text-title-md text-foreground">{triageHeadline(selectedEntry)}</h4>
                        <p className="text-body-sm text-muted-foreground">
                          {triageSummary(selectedEntry, now)}
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 border-t border-hairline pt-4">
                        {selectedEntry.runStatus === "paused" && selectedEntry.runId ? (
                          <Button size="sm" onClick={() => void resumeExecution(selectedEntry)}>
                            <Play size={14} />
                            {primaryActionLabel(selectedEntry)}
                          </Button>
                        ) : (
                          <Button size="sm" onClick={() => void focusWorkflow(selectedEntry)}>
                            <Eye size={14} />
                            {primaryActionLabel(selectedEntry)}
                          </Button>
                        )}

                        {selectedEntry.runStatus === "paused" && (
                          <Button variant="outline" size="sm" onClick={() => void focusWorkflow(selectedEntry)}>
                            <ExternalLink size={14} />
                            Open flow
                          </Button>
                        )}

                        {isRunInFlight(selectedEntry.runStatus) && selectedEntry.runStatus !== "paused" && selectedEntry.runStatus !== "cancelling" && selectedEntry.runStatus !== "starting" && selectedEntry.runId ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => void pauseExecution(selectedEntry)}
                          >
                            <Pause size={14} />
                            Pause
                          </Button>
                        ) : null}

                        {selectedEntry.runStatus === "cancelling" ? (
                          <span className="ui-meta-text text-muted-foreground">Stopping…</span>
                        ) : isRunInFlight(selectedEntry.runStatus) && selectedEntry.runId ? (
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => void cancelExecution(selectedEntry)}
                          >
                            <Square size={14} />
                            Stop
                          </Button>
                        ) : (
                          <Button variant="ghost" size="sm" onClick={() => clearEntry(selectedEntry)}>
                            <TimerReset size={14} />
                            Clear
                          </Button>
                        )}
                      </div>

                      <div className="grid grid-cols-1 gap-x-6 gap-y-3 border-t border-hairline pt-4 text-body-sm md:grid-cols-2">
                        <div className="flex items-start justify-between gap-3">
                          <span className="text-muted-foreground">Project</span>
                          <span className="text-right text-foreground">{folderName(selectedEntry.projectPath)}</span>
                        </div>
                        <div className="flex items-start justify-between gap-3">
                          <span className="text-muted-foreground">Status</span>
                          <span className="inline-flex items-center gap-2 text-right text-foreground">
                            {outcomeIcon(selectedEntry)}
                            {outcomeLabel(selectedEntry)}
                          </span>
                        </div>
                        <div className="flex items-start justify-between gap-3">
                          <span className="text-muted-foreground">Progress</span>
                          <span className="text-right text-foreground tabular-nums">
                            Step {Math.min(selectedEntry.progress.completedSteps, selectedEntry.progress.totalSteps)}/{selectedEntry.progress.totalSteps || 0}
                          </span>
                        </div>
                        <div className="flex items-start justify-between gap-3">
                          <span className="text-muted-foreground">Runtime</span>
                          <span className="text-right text-foreground tabular-nums">
                            {selectedEntryDurationLabel || "Not available"}
                          </span>
                        </div>
                        <div className="flex items-start justify-between gap-3">
                          <span className="text-muted-foreground">Active step</span>
                          <span className="max-w-[60%] text-right text-foreground">
                            {selectedEntry.activeNodeLabel || "None"}
                          </span>
                        </div>
                        <div className="flex items-start justify-between gap-3">
                          <span className="text-muted-foreground">Approvals</span>
                          <span className="text-right text-foreground">
                            {selectedEntry.approvalCount > 0 ? `${selectedEntry.approvalCount} pending` : "None"}
                          </span>
                        </div>
                        <div className="flex items-start justify-between gap-3">
                          <span className="text-muted-foreground">Started</span>
                          <span className="text-right text-foreground">{formatDateTime(selectedEntry.runStartedAt)}</span>
                        </div>
                        <div className="flex items-start justify-between gap-3">
                          <span className="text-muted-foreground">Usage</span>
                          <span className="text-right text-foreground tabular-nums">
                            {selectedEntryCost.totalCost > 0 ? `$${selectedEntryCost.totalCost.toFixed(2)}` : "No cost yet"}
                            {selectedEntryCost.totalTokens > 0 ? ` · ${formatTokenCount(selectedEntryCost.totalTokens)} tokens` : ""}
                          </span>
                        </div>
                      </div>

                      {selectedEntry.approvalMessages.length > 0 && (
                        <div className="space-y-2 border-t border-hairline pt-4" role="status" aria-live="polite">
                          <div className="flex items-center gap-2 text-status-warning">
                            <AlertTriangle size={14} />
                            <p className="text-body-sm font-medium">Pending approvals</p>
                          </div>
                          <div className="space-y-1.5">
                            {selectedEntry.approvalMessages.map((message, index) => (
                              <p key={`${message}-${index}`} className="text-body-sm text-status-warning/90">
                                {message}
                              </p>
                            ))}
                          </div>
                        </div>
                      )}

                      {selectedEntry.lastError && (
                        <div className="space-y-2 border-t border-hairline pt-4" role="alert" aria-live="assertive">
                          <div className="flex items-center gap-2 text-status-danger">
                            <AlertTriangle size={14} />
                            <p className="text-body-sm font-medium">Last error</p>
                          </div>
                          <p className="text-body-sm text-status-danger/90 whitespace-pre-wrap break-words">
                            {selectedEntry.lastError}
                          </p>
                        </div>
                      )}

                      <div className="space-y-3 border-t border-hairline pt-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <WorkflowIcon size={15} className="text-muted-foreground" />
                            <h4 className="text-body-sm font-medium text-foreground">Result snapshot</h4>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {selectedEntry.reportPath ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => void window.api.openReport(selectedEntry.reportPath!)}
                              >
                                <ExternalLink size={14} />
                                Open report
                              </Button>
                            ) : null}
                            {selectedEntry.workspace ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => void window.api.showInFinder(selectedEntry.workspace!)}
                              >
                                <FolderSearch2 size={14} />
                                Reveal workspace
                              </Button>
                            ) : null}
                          </div>
                        </div>

                        {selectedEntry.finalContent.trim() ? (
                          <pre className="ui-scroll-region max-h-[320px] overflow-auto whitespace-pre-wrap break-words text-body-sm text-foreground">
                            {selectedEntry.finalContent}
                          </pre>
                        ) : (
                          <p className="text-body-sm text-muted-foreground">
                            No final output captured for this run yet.
                          </p>
                        )}
                      </div>
                    </section>
                  </div>
                </div>
              ) : (
                <div className="flex h-full items-center justify-center px-6 py-12 text-center">
                  <div className="max-w-sm">
                    <p className="text-title-sm text-foreground">No runs to show</p>
                    <p className="mt-2 text-body-sm text-muted-foreground">
                      Start a flow and it will appear here with live status, approvals, and results.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </CanvasDialogBody>
        </CanvasDialogContent>
      </Dialog>
      {unsavedChangesDialog}
    </>
  )
}
