import { useEffect, useMemo, useState } from "react"
import { useAtom, useAtomValue, useSetAtom } from "jotai"
import { toast } from "sonner"
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
  selectedProjectAtom,
  selectedWorkflowPathAtom,
  workflowDirtyAtom,
  workflowSavedSnapshotAtom,
} from "@/lib/store"
import {
  approvalRequestsAtom,
  clearWorkflowExecutionStateAtom,
  pastRunsAtom,
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
    return "border-status-warning/30 bg-status-warning/10 text-status-warning"
  }
  if (entry.runStatus === "starting" || entry.runStatus === "running" || entry.runStatus === "cancelling") {
    return "border-status-info/30 bg-status-info/10 text-status-info"
  }
  if (entry.runOutcome === "failed" || entry.runOutcome === "interrupted" || entry.lastError) {
    return "border-status-danger/30 bg-status-danger/10 text-status-danger"
  }
  return "border-status-success/30 bg-status-success/10 text-status-success"
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

  const totalCost = Object.values(entry.nodeStates).reduce((sum, nodeState) => sum + (nodeState.metrics?.cost_usd || 0), 0)
  const totalTokens = Object.values(entry.nodeStates).reduce(
    (sum, nodeState) => sum + (nodeState.metrics?.tokens_in || 0) + (nodeState.metrics?.tokens_out || 0),
    0,
  )
  return { totalCost, totalTokens }
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

export function MultiRunDashboard() {
  const [open, setOpen] = useAtom(multiRunDashboardOpenAtom)
  const [workflowExecutionStates] = useAtom(workflowExecutionStatesAtom)
  const [approvalRequests] = useAtom(approvalRequestsAtom)
  const [pastRuns] = useAtom(pastRunsAtom)
  const [selectedProject, setSelectedProject] = useAtom(selectedProjectAtom)
  const [selectedWorkflowPath, setSelectedWorkflowPath] = useAtom(selectedWorkflowPathAtom)
  const [, setCurrentWorkflow] = useAtom(currentWorkflowAtom)
  const [, setWorkflowSavedSnapshot] = useAtom(workflowSavedSnapshotAtom)
  const workflowDirty = useAtomValue(workflowDirtyAtom)
  const [, setMainView] = useAtom(mainViewAtom)
  const updateWorkflowExecutionState = useSetAtom(updateWorkflowExecutionStateAtom)
  const clearWorkflowExecutionState = useSetAtom(clearWorkflowExecutionStateAtom)
  const [selectedEntryKey, setSelectedEntryKey] = useState<string | null>(null)
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
        const matchingRequests = approvalRequests.filter((request) => request.runId === state.runId)
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
        const leftActive = isRunInFlight(left.runStatus) ? 1 : 0
        const rightActive = isRunInFlight(right.runStatus) ? 1 : 0
        if (leftActive !== rightActive) return rightActive - leftActive
        return buildEntrySortTimestamp(right) - buildEntrySortTimestamp(left)
      })
  }, [approvalRequests, pastRuns, selectedWorkflowPath, workflowExecutionStates])

  const selectedEntry = entriesWithHistory.find((entry) => entry.workflowKey === selectedEntryKey) || entriesWithHistory[0] || null
  const activeCount = entriesWithHistory.filter((entry) => isRunInFlight(entry.runStatus)).length

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

  const focusWorkflow = async (entry: DashboardEntry) => {
    if (entry.isSelectedWorkflow) {
      setMainView("thread")
      setOpen(false)
      return
    }
    if (!(await confirmDiscard("open another workflow", workflowDirty))) {
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
      return true
    }

    if (entry.workflowPath) {
      try {
        const loadedWorkflow = await window.api.loadWorkflow(entry.workflowPath)
        setSelectedWorkflowPath(entry.workflowPath)
        setCurrentWorkflow(loadedWorkflow)
        setWorkflowSavedSnapshot(workflowSnapshot(loadedWorkflow))
        setOpen(false)
        return
      } catch (error) {
        if (!restoreWorkflowSnapshot(entry.workflowSnapshot)) {
          toast.error("Could not open workflow", {
            description: String(error),
          })
          return
        }
      }
    } else if (!restoreWorkflowSnapshot(entry.workflowSnapshot)) {
      toast.error("Could not open workflow", {
        description: "This dashboard entry does not have a restorable workflow snapshot.",
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
        toast.error("Could not pause run")
        return
      }
      updateWorkflowExecutionState({
        key: entry.workflowKey,
        update: (previous) => ({ ...previous, runStatus: "paused" }),
      })
    } catch (error) {
      toast.error("Could not pause run", {
        description: String(error),
      })
    }
  }

  const resumeExecution = async (entry: DashboardEntry) => {
    if (!entry.runId) return
    try {
      const resumed = await window.api.resumeRun(entry.runId)
      if (!resumed) {
        toast.error("Could not resume run")
        return
      }
      updateWorkflowExecutionState({
        key: entry.workflowKey,
        update: (previous) => ({ ...previous, runStatus: "running" }),
      })
    } catch (error) {
      toast.error("Could not resume run", {
        description: String(error),
      })
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
        toast.error("Could not stop run")
      }
    } catch (error) {
      updateWorkflowExecutionState({
        key: entry.workflowKey,
        update: (previous) => ({ ...previous, runStatus: entry.runStatus }),
      })
      toast.error("Could not stop run", {
        description: String(error),
      })
    }
  }

  const clearEntry = (entry: DashboardEntry) => {
    if (isRunInFlight(entry.runStatus)) return
    clearWorkflowExecutionState(entry.workflowKey)
  }

  const selectedEntryCost = selectedEntry ? summarizeCost(selectedEntry) : { totalCost: 0, totalTokens: 0 }
  const selectedEntryDuration = selectedEntry?.pastRun?.durationMs
    ?? ((selectedEntry?.completedAt && selectedEntry.runStartedAt)
      ? (selectedEntry.completedAt - selectedEntry.runStartedAt)
      : null)

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
                ? `${activeCount} run${activeCount === 1 ? "" : "s"} active across workflows.`
                : "Inspect recent session runs and jump back into any workflow."}
            </DialogDescription>
          </CanvasDialogHeader>

          <CanvasDialogBody className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[320px,1fr] gap-0 p-0">
            <div className="border-b border-hairline lg:border-b-0 lg:border-r bg-surface-1/40 min-h-[240px] lg:min-h-0">
              <div className="flex items-center justify-between px-4 py-3 border-b border-hairline">
                <div>
                  <p className="text-body-sm font-medium text-foreground">Session runs</p>
                  <p className="ui-meta-text text-muted-foreground">{entriesWithHistory.length} tracked</p>
                </div>
              </div>
              <div className="ui-scroll-region max-h-[30vh] lg:max-h-none lg:h-full overflow-y-auto p-2">
                {entriesWithHistory.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-hairline bg-surface-1/70 p-4 text-body-sm text-muted-foreground">
                    No active or recent runs in this session yet.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {entriesWithHistory.map((entry) => (
                      <button
                        key={entry.workflowKey}
                        type="button"
                        onClick={() => setSelectedEntryKey(entry.workflowKey)}
                        className={cn(
                          "ui-pressable ui-surface-lift w-full rounded-lg border p-3 text-left ui-transition-colors ui-motion-fast",
                          selectedEntry?.workflowKey === entry.workflowKey
                            ? "border-primary/40 bg-primary/8 shadow-[inset_0_1px_0_hsl(var(--primary)/0.08),0_10px_22px_hsl(var(--foreground)/0.08)]"
                            : "border-hairline bg-surface-1/80 ui-elevation-base hover:bg-surface-2/70",
                        )}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-body-sm font-medium text-foreground">
                              {entry.workflowName || (entry.workflowPath ? "Untitled workflow" : "Unsaved draft")}
                            </p>
                            <p className="mt-0.5 truncate ui-meta-text text-muted-foreground">
                              {folderName(entry.projectPath)}
                            </p>
                          </div>
                          <Badge variant="outline" className={cn("shrink-0 gap-1 border", outcomeClasses(entry))}>
                            {outcomeIcon(entry)}
                            {outcomeLabel(entry)}
                          </Badge>
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-2 ui-meta-text text-muted-foreground">
                          <span className="tabular-nums">
                            Step {Math.min(entry.progress.completedSteps, entry.progress.totalSteps)}/{entry.progress.totalSteps || 0}
                          </span>
                          {entry.activeNodeLabel && (
                            <span className="truncate">Active: {entry.activeNodeLabel}</span>
                          )}
                          {entry.approvalCount > 0 && (
                            <span className="text-status-warning">{entry.approvalCount} approval pending</span>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="min-h-0">
              {selectedEntry ? (
                <div key={selectedEntry.workflowKey} className="flex h-full flex-col ui-fade-slide-in">
                  <div className="border-b border-hairline px-5 py-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="truncate text-title-md text-foreground">
                            {selectedEntry.workflowName || (selectedEntry.workflowPath ? "Untitled workflow" : "Unsaved draft")}
                          </h3>
                          {selectedEntry.isSelectedWorkflow && (
                            <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">
                              Current editor
                            </Badge>
                          )}
                        </div>
                        <p className="mt-1 text-body-sm text-muted-foreground">
                          {selectedEntry.workflowPath || "Unsaved draft workflow"}
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <Button variant="outline" size="sm" onClick={() => void focusWorkflow(selectedEntry)}>
                          <Eye size={14} />
                          Open
                        </Button>
                        {selectedEntry.runStatus === "paused" ? (
                          <Button variant="outline" size="sm" className="ui-fade-slide-in-trailing" onClick={() => void resumeExecution(selectedEntry)}>
                            <Play size={14} />
                            Resume
                          </Button>
                        ) : isRunInFlight(selectedEntry.runStatus) && selectedEntry.runStatus !== "cancelling" ? (
                          <Button variant="outline" size="sm" className="ui-fade-slide-in-trailing" onClick={() => void pauseExecution(selectedEntry)} disabled={!selectedEntry.runId || selectedEntry.runStatus === "starting"}>
                            <Pause size={14} />
                            Pause
                          </Button>
                        ) : null}
                        {isRunInFlight(selectedEntry.runStatus) && (
                          <Button variant="destructive" size="sm" className="ui-fade-slide-in-trailing" onClick={() => void cancelExecution(selectedEntry)} disabled={!selectedEntry.runId || selectedEntry.runStatus === "cancelling"}>
                            <Square size={14} />
                            Stop
                          </Button>
                        )}
                        {!isRunInFlight(selectedEntry.runStatus) && (
                          <Button variant="ghost" size="sm" className="ui-fade-slide-in-trailing" onClick={() => clearEntry(selectedEntry)}>
                            <TimerReset size={14} />
                            Clear
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="ui-scroll-region flex-1 overflow-y-auto px-5 py-4 space-y-4">
                    <div className="grid grid-cols-1 gap-3 xl:grid-cols-4">
                      <div className="rounded-lg border border-hairline bg-surface-1/70 p-3 ui-elevation-base">
                        <p className="ui-meta-text text-muted-foreground">Status</p>
                        <div className="mt-2 flex items-center gap-2 text-body-sm font-medium text-foreground">
                          {outcomeIcon(selectedEntry)}
                          {outcomeLabel(selectedEntry)}
                        </div>
                        <p className="mt-2 ui-meta-text text-muted-foreground">
                          Updated {formatDateTime(selectedEntry.lastUpdatedAt)}
                        </p>
                      </div>
                      <div className="rounded-lg border border-hairline bg-surface-1/70 p-3 ui-elevation-base">
                        <p className="ui-meta-text text-muted-foreground">Progress</p>
                        <p className="mt-2 text-body-sm font-medium text-foreground tabular-nums">
                          Step {Math.min(selectedEntry.progress.completedSteps, selectedEntry.progress.totalSteps)}/{selectedEntry.progress.totalSteps || 0}
                        </p>
                        {selectedEntry.progress.totalSteps > 0 && (
                          <div className="sidebar-progress-track mt-2">
                            <div
                              className="sidebar-progress-bar"
                              style={{
                                width: `${Math.min(100, (selectedEntry.progress.completedSteps / selectedEntry.progress.totalSteps) * 100)}%`,
                                background: selectedEntry.progress.failedSteps > 0
                                  ? "hsl(var(--status-danger))"
                                  : "hsl(var(--primary) / 0.72)",
                              }}
                            />
                          </div>
                        )}
                        <p className="mt-2 ui-meta-text text-muted-foreground">
                          {selectedEntry.progress.runningSteps} running, {selectedEntry.progress.failedSteps} failed, {selectedEntry.progress.waitingApprovalSteps} waiting approval
                        </p>
                      </div>
                      <div className="rounded-lg border border-hairline bg-surface-1/70 p-3 ui-elevation-base">
                        <p className="ui-meta-text text-muted-foreground">Runtime</p>
                        <p className="mt-2 text-body-sm font-medium text-foreground tabular-nums">
                          {formatDurationMs(selectedEntryDuration)}
                        </p>
                        <p className="mt-2 ui-meta-text text-muted-foreground">
                          Started {formatDateTime(selectedEntry.runStartedAt)}
                        </p>
                      </div>
                      <div className="rounded-lg border border-hairline bg-surface-1/70 p-3 ui-elevation-base">
                        <p className="ui-meta-text text-muted-foreground">Usage</p>
                        <p className="mt-2 text-body-sm font-medium text-foreground tabular-nums">
                          {selectedEntryCost.totalCost > 0 ? `$${selectedEntryCost.totalCost.toFixed(2)}` : "No cost yet"}
                        </p>
                        <p className="mt-2 ui-meta-text text-muted-foreground tabular-nums">
                          {selectedEntryCost.totalTokens > 0 ? `${formatTokenCount(selectedEntryCost.totalTokens)} tokens` : "No tokens yet"}
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.2fr,0.8fr]">
                      <div className="rounded-lg border border-hairline bg-surface-1/70 p-4 ui-elevation-base">
                        <div className="flex items-center gap-2">
                          <WorkflowIcon size={15} className="text-muted-foreground" />
                          <h4 className="text-body-sm font-medium text-foreground">Execution details</h4>
                        </div>
                        <dl className="mt-3 space-y-3 text-body-sm">
                          <div className="flex items-start justify-between gap-3">
                            <dt className="text-muted-foreground">Project</dt>
                            <dd className="text-right text-foreground">{folderName(selectedEntry.projectPath)}</dd>
                          </div>
                          <div className="flex items-start justify-between gap-3">
                            <dt className="text-muted-foreground">Run ID</dt>
                            <dd className="max-w-[60%] truncate text-right text-foreground">{selectedEntry.runId || selectedEntry.pastRun?.runId || "Not active"}</dd>
                          </div>
                          <div className="flex items-start justify-between gap-3">
                            <dt className="text-muted-foreground">Active node</dt>
                            <dd className="max-w-[60%] text-right text-foreground">
                              <span className="inline-flex max-w-full items-center justify-end gap-1.5">
                                {isRunInFlight(selectedEntry.runStatus) && selectedEntry.activeNodeLabel && (
                                  <span className="ui-status-beacon" aria-hidden="true">
                                    <span className="ui-status-beacon-ring bg-status-info/50" />
                                    <span className="ui-status-beacon-core bg-status-info" />
                                  </span>
                                )}
                                <span className="truncate">{selectedEntry.activeNodeLabel || "None"}</span>
                              </span>
                            </dd>
                          </div>
                          <div className="flex items-start justify-between gap-3">
                            <dt className="text-muted-foreground">Approvals</dt>
                            <dd className="max-w-[60%] text-right text-foreground">{selectedEntry.approvalCount > 0 ? `${selectedEntry.approvalCount} pending` : "None"}</dd>
                          </div>
                          <div className="flex items-start justify-between gap-3">
                            <dt className="text-muted-foreground">Finished</dt>
                            <dd className="max-w-[60%] text-right text-foreground">{formatDateTime(selectedEntry.completedAt)}</dd>
                          </div>
                        </dl>

                        <div
                          data-open={selectedEntry.approvalMessages.length > 0 ? "true" : "false"}
                          className="ui-collapsible"
                        >
                          <div className="ui-collapsible-inner">
                            <div className="mt-4 rounded-md surface-warning-soft p-3">
                              <p className="text-body-sm font-medium text-status-warning">Pending approvals</p>
                              <div className="mt-2 space-y-1.5">
                                {selectedEntry.approvalMessages.map((message, index) => (
                                  <p key={`${message}-${index}`} className="ui-meta-text text-status-warning/90">
                                    {message}
                                  </p>
                                ))}
                              </div>
                            </div>
                          </div>
                        </div>

                        <div
                          data-open={selectedEntry.lastError ? "true" : "false"}
                          className="ui-collapsible"
                        >
                          <div className="ui-collapsible-inner">
                            <div className="mt-4 rounded-md surface-danger-soft p-3">
                              <div className="flex items-center gap-2 text-status-danger">
                                <AlertTriangle size={14} />
                                <p className="text-body-sm font-medium">Last error</p>
                              </div>
                              <p className="mt-2 text-body-sm text-status-danger/90 whitespace-pre-wrap break-words">
                                {selectedEntry.lastError || ""}
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <div className="rounded-lg border border-hairline bg-surface-1/70 p-4 ui-elevation-base">
                          <h4 className="text-body-sm font-medium text-foreground">Artifacts</h4>
                          <div className="mt-3 flex flex-wrap gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={!selectedEntry.reportPath}
                              onClick={() => selectedEntry.reportPath && void window.api.openReport(selectedEntry.reportPath)}
                            >
                              <ExternalLink size={14} />
                              Open report
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={!selectedEntry.workspace}
                              onClick={() => selectedEntry.workspace && void window.api.showInFinder(selectedEntry.workspace)}
                            >
                              <FolderSearch2 size={14} />
                              Reveal workspace
                            </Button>
                          </div>
                        </div>

                        <div className="rounded-lg border border-hairline bg-surface-1/70 p-4 ui-elevation-base">
                          <h4 className="text-body-sm font-medium text-foreground">Result preview</h4>
                          {selectedEntry.finalContent.trim() ? (
                            <pre className="mt-3 max-h-[320px] overflow-auto whitespace-pre-wrap break-words rounded-md border border-hairline bg-surface-2/70 p-3 text-body-sm text-foreground">
                              {selectedEntry.finalContent}
                            </pre>
                          ) : (
                            <p className="mt-3 text-body-sm text-muted-foreground">
                              No final output captured for this run yet.
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex h-full items-center justify-center px-6 py-12 text-center">
                  <div className="max-w-sm rounded-lg border border-dashed border-hairline bg-surface-1/70 p-6">
                    <p className="text-title-sm text-foreground">No runs to show</p>
                    <p className="mt-2 text-body-sm text-muted-foreground">
                      Start a workflow and it will appear here with live status, approvals, and artifacts.
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
