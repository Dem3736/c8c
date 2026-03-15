import { useEffect, useState } from "react"
import { useAtom, useSetAtom } from "jotai"
import {
  activeExecutionProviderAtom,
  selectedProjectAtom,
  selectedWorkflowPathAtom,
  desktopRuntimeAtom,
  defaultProviderAtom,
  multiRunDashboardOpenAtom,
  currentWorkflowAtom,
} from "@/lib/store"
import {
  nodeStatesAtom,
  runStartedAtAtom,
  runStatusAtom,
  runtimeNodesAtom,
  toWorkflowExecutionKey,
  workflowExecutionStatesAtom,
} from "@/features/execution"
import { cn } from "@/lib/cn"
import { PROVIDER_LABELS } from "@shared/provider-metadata"
import { Activity, GitBranch, Laptop, Loader2, ShieldCheck } from "lucide-react"
import { Button } from "@/components/ui/button"

interface AppStatusBarProps {
  environmentLabel?: string
  permissionsLabel?: string
}

function folderName(projectPath: string | null) {
  if (!projectPath) return null
  return projectPath.split("/").pop() || projectPath
}

function isStepNodeType(nodeType: string) {
  return nodeType !== "input" && nodeType !== "output"
}

function isRunInFlight(status: string) {
  return status === "starting" || status === "running" || status === "paused" || status === "cancelling"
}

function isDashboardVisibleState(state: { runStatus: string; runOutcome?: string | null; workspace?: string | null; reportPath?: string | null; finalContent?: string; lastError?: string | null; nodeStates?: Record<string, unknown> }) {
  return isRunInFlight(state.runStatus)
    || !!state.runOutcome
    || !!state.workspace
    || !!state.reportPath
    || !!state.lastError
    || !!state.finalContent?.trim()
    || Object.keys(state.nodeStates || {}).length > 0
}

export function AppStatusBar({
  environmentLabel,
  permissionsLabel = "Protected mode",
}: AppStatusBarProps = {}) {
  const [selectedProject] = useAtom(selectedProjectAtom)
  const [selectedWorkflowPath] = useAtom(selectedWorkflowPathAtom)
  const [desktopRuntime] = useAtom(desktopRuntimeAtom)
  const [defaultProvider] = useAtom(defaultProviderAtom)
  const [activeExecutionProvider] = useAtom(activeExecutionProviderAtom)
  const [runStatus] = useAtom(runStatusAtom)
  const [runStartedAt] = useAtom(runStartedAtAtom)
  const [nodeStates] = useAtom(nodeStatesAtom)
  const [workflow] = useAtom(currentWorkflowAtom)
  const [runtimeNodes] = useAtom(runtimeNodesAtom)
  const [workflowExecutionStates] = useAtom(workflowExecutionStatesAtom)
  const setMultiRunDashboardOpen = useSetAtom(multiRunDashboardOpenAtom)
  // undefined = loading, null = no git, string = branch name
  const [branch, setBranch] = useState<string | null | undefined>(undefined)
  const [elapsed, setElapsed] = useState("")

  useEffect(() => {
    if (!runStartedAt || (runStatus !== "running" && runStatus !== "starting" && runStatus !== "cancelling")) {
      setElapsed("")
      return
    }
    const tick = () => {
      const delta = Math.floor((Date.now() - runStartedAt) / 1000)
      const m = Math.floor(delta / 60)
      const s = delta % 60
      setElapsed(m > 0 ? `${m}m ${String(s).padStart(2, "0")}s` : `${s}s`)
    }
    tick()
    const id = window.setInterval(tick, 1000)
    return () => window.clearInterval(id)
  }, [runStartedAt, runStatus])
  const platformLabel = desktopRuntime.platform === "macos"
    ? "macOS"
    : desktopRuntime.platform === "windows"
      ? "Windows"
      : "Linux"
  const resolvedEnvironmentLabel = environmentLabel || platformLabel
  const selectedWorkflowKey = toWorkflowExecutionKey(selectedWorkflowPath)
  const trackedRunCount = Object.values(workflowExecutionStates).filter(isDashboardVisibleState).length
  const workflowProvider = workflow.defaults?.provider || defaultProvider
  const displayedProvider = isRunInFlight(runStatus) ? activeExecutionProvider : workflowProvider
  const backgroundRunCount = Object.entries(workflowExecutionStates).reduce((count, [workflowKey, state]) => {
    if (!isRunInFlight(state.runStatus) || workflowKey === selectedWorkflowKey) return count
    return count + 1
  }, 0)
  const nodeTypeById = new Map(
    (runtimeNodes.length > 0 ? runtimeNodes : workflow.nodes).map((node) => [node.id, node.type]),
  )
  const stepNodeIds = new Set<string>()
  for (const [nodeId, nodeType] of nodeTypeById.entries()) {
    if (isStepNodeType(nodeType)) stepNodeIds.add(nodeId)
  }
  for (const nodeId of Object.keys(nodeStates)) {
    const nodeType = nodeTypeById.get(nodeId)
    if ((nodeType && isStepNodeType(nodeType)) || nodeId.includes("::")) {
      stepNodeIds.add(nodeId)
    }
  }

  let completedSteps = 0
  let runningSteps = 0
  let waitingApprovalSteps = 0
  let failedSteps = 0
  for (const nodeId of stepNodeIds) {
    const status = nodeStates[nodeId]?.status || "pending"
    if (status === "completed" || status === "skipped") completedSteps += 1
    if (status === "running") runningSteps += 1
    if (status === "waiting_approval") waitingApprovalSteps += 1
    if (status === "failed") failedSteps += 1
  }

  const totalSteps = stepNodeIds.size
  const showRunProgress = runStatus !== "idle" && (totalSteps > 0 || runStatus === "starting" || runStatus === "cancelling")
  const runPhaseLabel = runStatus === "starting"
    ? "connecting to CLI..."
    : runStatus === "cancelling"
      ? "stopping..."
      : runStatus === "paused"
        ? "paused"
        : runStatus === "running"
          ? waitingApprovalSteps > 0
            ? "waiting for approval"
            : failedSteps > 0
              ? "errors detected"
              : runningSteps > 0
                ? "running"
                : "waiting"
          : runStatus === "done"
          ? "completed"
          : "failed"
  const runProgressClass = runStatus === "done"
    ? "border-status-success/30 text-status-success"
    : runStatus === "error"
      ? "border-status-danger/30 text-status-danger"
      : runStatus === "paused"
        ? "border-status-warning/40 text-status-warning"
        : failedSteps > 0
          ? "border-status-danger/30 text-status-danger"
        : waitingApprovalSteps > 0
          ? "border-status-warning/40 text-status-warning"
          : "border-status-info/40 text-status-info"

  useEffect(() => {
    if (!selectedProject) {
      setBranch(null)
      return
    }
    let cancelled = false
    setBranch(undefined)
    window.api.getProjectStatus(selectedProject).then((status) => {
      if (cancelled) return
      setBranch(status.branch)
    }).catch(console.error)
    return () => {
      cancelled = true
    }
  }, [selectedProject])

  return (
    <footer
      aria-label="Application status bar"
      className="h-control-md shrink-0 border-t border-hairline bg-gradient-to-b from-surface-1/90 to-surface-2/90 backdrop-blur-sm"
    >
      <div className="h-full px-6 flex items-center justify-between ui-meta-text text-muted-foreground">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-2">
            <Laptop size={12} aria-hidden="true" />
            {resolvedEnvironmentLabel}
          </span>
          <span className="flex items-center gap-2">
            <ShieldCheck size={12} aria-hidden="true" />
            {permissionsLabel}
          </span>
          <span className="inline-flex h-control-sm items-center rounded-md border border-hairline bg-surface-1/70 px-2 text-foreground-subtle ui-elevation-inset">
            {PROVIDER_LABELS[displayedProvider]}
          </span>
          {selectedProject ? (
            <span className="inline-flex h-control-sm max-w-56 items-center truncate rounded-md border border-hairline bg-surface-1/70 px-2 text-foreground-subtle ui-elevation-inset">
              {folderName(selectedProject)}
            </span>
          ) : null}
        </div>

        <div className="flex items-center gap-2">
          {showRunProgress && (
            <span
              role="status"
              aria-live="polite"
              className={cn(
                "inline-flex h-control-sm items-center gap-1.5 rounded-md border bg-surface-1/70 px-2 ui-elevation-inset ui-transition-colors ui-motion-fast",
                runProgressClass,
              )}
            >
              {(runStatus === "running" || runStatus === "starting" || runStatus === "cancelling") && <Loader2 size={11} className="animate-spin" aria-hidden="true" />}
              <span className="font-medium">Step {Math.min(completedSteps, totalSteps)}/{totalSteps}</span>
              <span className="text-current/80">{runPhaseLabel}</span>
              {elapsed && <span className="ui-meta-text text-current/60 tabular-nums">{elapsed}</span>}
            </span>
          )}
          {backgroundRunCount > 0 && (
            <span className="inline-flex h-control-sm items-center rounded-md border border-status-info/30 bg-status-info/10 px-2 text-status-info ui-elevation-inset">
              {backgroundRunCount} run{backgroundRunCount === 1 ? "" : "s"} in background
            </span>
          )}
          {trackedRunCount > 0 && (
            <Button
              variant="ghost"
              size="xs"
              className="gap-1.5 px-2 text-muted-foreground hover:text-foreground"
              onClick={() => setMultiRunDashboardOpen(true)}
            >
              <Activity size={12} />
              Runs
              <span className="tabular-nums">{trackedRunCount}</span>
            </Button>
          )}
          {selectedProject && (
            <span className="inline-flex h-control-sm items-center gap-2 rounded-md border border-hairline bg-surface-1/70 px-2 ui-elevation-inset ui-transition-colors ui-motion-fast">
              <GitBranch size={12} aria-hidden="true" />
              {branch === undefined ? <span className="opacity-60">Checking git...</span> : (branch ?? "No git branch")}
            </span>
          )}
        </div>
      </div>
    </footer>
  )
}
