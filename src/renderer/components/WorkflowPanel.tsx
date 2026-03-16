import { useEffect, useMemo, useRef, useState } from "react"
import { useAtom } from "jotai"
import { cn } from "@/lib/cn"
import {
  chatStatusAtom,
  selectedProjectAtom,
  selectedWorkflowPathAtom,
  currentWorkflowAtom,
  inputValueAtom,
  viewModeAtom,
  chatPanelOpenAtom,
  workflowDirtyAtom,
  mainViewAtom,
  workflowCreatePendingMessageAtom,
  workflowEntryStateAtom,
  chatPanelWidthAtom,
  workflowReviewModeAtom,
} from "@/lib/store"
import {
  activeNodeIdAtom,
  finalContentAtom,
  nodeStatesAtom,
  reportPathAtom,
  runStartedAtAtom,
  runStatusAtom,
  runtimeMetaAtom,
  runtimeNodesAtom,
  selectedPastRunAtom,
  workflowHistoryRunsAtom,
} from "@/features/execution"
import { resolveWorkflowInput } from "@/lib/input-type"
import { InputPanel } from "./InputPanel"
import { ChainBuilder } from "./ChainBuilder"
import { CanvasView } from "./CanvasView"
import { NodeInspector } from "./canvas/NodeInspector"
import { Toolbar } from "./Toolbar"
import { OutputPanel } from "./OutputPanel"
import { BatchPanel } from "./BatchPanel"
import { ApprovalDialog } from "./ApprovalDialog"
import { ChatPanel } from "./chat/ChatPanel"
import { WorkflowSettingsPanel } from "./WorkflowSettingsPanel"
import { workflowHasMeaningfulContent } from "@/lib/workflow-content"
import { useWorkflowReset } from "@/hooks/useWorkflowReset"
import { useWorkflowValidation } from "@/hooks/useWorkflowValidation"
import { useUndoRedo } from "@/hooks/useUndoRedo"
import { useChainExecution } from "@/hooks/useChainExecution"
import { useSelectedRunReview } from "@/hooks/useSelectedRunReview"
import {
  List,
  LayoutGrid,
  SlidersHorizontal,
  FolderOpen,
  FileStack,
  LayoutTemplate,
  PencilLine,
  Loader2,
  Sparkles,
  MessageSquare,
  Play,
  FileText,
  Activity,
  type LucideIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { SectionErrorBoundary } from "@/components/ui/error-boundary"
import type { WorkflowEntryState } from "@/lib/workflow-entry"
import { buildRunProgressSummary, formatElapsedTime, type RunProgressSummary } from "@/lib/run-progress"

function EmptyState({ icon: Icon, title, description, children }: { icon: LucideIcon; title: string; description: string; children?: React.ReactNode }) {
  return (
    <div className="flex-1 flex items-center justify-center text-muted-foreground pt-[var(--titlebar-height)]">
      <div className="ui-empty-state rounded-lg surface-soft px-8">
        <div className="mx-auto mb-3 h-control-lg w-control-lg rounded-md border border-hairline bg-surface-2/90 flex items-center justify-center ui-elevation-inset">
          <Icon size={20} className="opacity-70" aria-hidden="true" />
        </div>
        <p className="mb-1 text-title-md text-foreground">{title}</p>
        <p className="text-body-md">{description}</p>
        {children && <div className="mt-4 flex items-center justify-center gap-2">{children}</div>}
      </div>
    </div>
  )
}

function WorkflowDraftSkeleton() {
  return (
    <div className="rounded-lg surface-panel p-5 ui-fade-slide-in">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-foreground shadow-inset-highlight">
          <Sparkles size={18} aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-title-sm text-foreground">
            <Loader2 size={14} className="animate-spin text-status-info" />
            Building the first workflow draft
          </div>
          <p className="mt-2 text-body-sm text-muted-foreground">
            The agent is turning your prompt into a runnable flow. This view will populate as soon as the draft is ready.
          </p>
        </div>
      </div>
      <div className="mt-5 space-y-3" aria-hidden="true">
        {Array.from({ length: 3 }).map((_, index) => (
          <div
            key={`workflow-draft-skeleton-${index}`}
            className="animate-pulse rounded-xl border border-hairline bg-surface-2/70 px-4 py-4"
          >
            <div className="h-4 w-40 rounded bg-surface-3" />
            <div className="mt-3 h-3 w-full rounded bg-surface-3" />
            <div className="mt-2 h-3 w-5/6 rounded bg-surface-3" />
          </div>
        ))}
      </div>
    </div>
  )
}

function WorkflowEntryLanding({
  entry,
  displayTitle,
  readyToRun,
  onRefine,
  onToggleEditor,
  showEditor,
  canRefine,
  onDismiss,
}: {
  entry: WorkflowEntryState
  displayTitle: string
  readyToRun: boolean
  onRefine: () => void
  onToggleEditor: () => void
  showEditor: boolean
  canRefine: boolean
  onDismiss: () => void
}) {
  return (
    <section className="rounded-xl surface-panel p-5 ui-fade-slide-in">
      <div className="flex flex-wrap items-start gap-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-hairline bg-surface-2 text-foreground ui-elevation-inset">
          <Sparkles size={18} aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={readyToRun ? "success" : "secondary"} className="ui-meta-text px-2 py-1">
              {readyToRun ? "Ready to run" : "Add input to run"}
            </Badge>
            <span className="ui-meta-text text-muted-foreground">{entry.readinessText}</span>
          </div>
          <div>
            <h2 className="text-title-md text-foreground">{displayTitle}</h2>
            <p className="mt-1 text-body-md text-muted-foreground">{entry.summary}</p>
          </div>
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          {canRefine && (
            <Button variant="outline" size="sm" onClick={onRefine}>
              <MessageSquare size={14} />
              Refine with agent
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={onToggleEditor}>
            <PencilLine size={14} />
            {showEditor ? "Hide editor" : "Edit flow"}
          </Button>
          <Button variant="ghost" size="sm" onClick={onDismiss}>
            Dismiss
          </Button>
        </div>
      </div>

      <div className="mt-5 grid gap-3 lg:grid-cols-3">
        <div className="rounded-lg border border-hairline bg-surface-2/70 px-4 py-3">
          <p className="ui-meta-label text-muted-foreground">{entry.contractLabel}</p>
          <p className="mt-2 text-body-sm text-foreground">{entry.contractText}</p>
        </div>
        <div className="rounded-lg border border-hairline bg-surface-2/70 px-4 py-3">
          <p className="ui-meta-label text-muted-foreground">You provide</p>
          <p className="mt-2 text-body-sm text-foreground">{entry.inputText}</p>
        </div>
        <div className="rounded-lg border border-hairline bg-surface-2/70 px-4 py-3">
          <p className="ui-meta-label text-muted-foreground">You get</p>
          <p className="mt-2 text-body-sm text-foreground">{entry.outputText}</p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-hairline bg-surface-2/40 px-4 py-3">
        <Play size={14} className="text-muted-foreground" />
        <p className="text-body-sm text-muted-foreground">
          {readyToRun
            ? "This flow is ready. You can press Run in the toolbar now, or refine it first."
            : "Add the input below, then press Run in the toolbar when you are ready."}
        </p>
      </div>
    </section>
  )
}

function RunStrip({
  summary,
  elapsed,
  hasResult,
  onOpenActivity,
  onOpenResult,
}: {
  summary: RunProgressSummary
  elapsed: string
  hasResult: boolean
  onOpenActivity: () => void
  onOpenResult: () => void
}) {
  const toneClass = summary.tone === "success"
    ? "border-status-success/25 text-status-success"
    : summary.tone === "warning"
      ? "border-status-warning/30 text-status-warning"
      : summary.tone === "danger"
        ? "border-status-danger/25 text-status-danger"
        : "border-status-info/25 text-status-info"

  const progressLabel = summary.totalSteps > 0
    ? `${Math.min(summary.completedSteps, summary.totalSteps)}/${summary.totalSteps} complete`
    : null
  const resultButtonLabel = hasResult
    ? summary.phaseLabel === "Completed"
      ? "View result"
      : "Open result"
    : "Open details"

  return (
    <div className="border-b border-hairline bg-surface-1/90">
      <div className="flex w-full flex-wrap items-center gap-2 px-[var(--content-gutter)] py-2">
        <div className="min-w-0 flex flex-1 flex-wrap items-center gap-x-2 gap-y-1.5">
          <Badge variant="outline" className={cn("px-1.5 py-0 ui-meta-text", toneClass)}>
            {summary.phaseLabel}
          </Badge>
          {summary.activeStepLabel && (
            <span className="min-w-0 truncate text-body-sm text-foreground">
              {summary.activeStepLabel}
            </span>
          )}
          {progressLabel && (
            <span className="ui-meta-text tabular-nums text-muted-foreground">{progressLabel}</span>
          )}
          {summary.branchLabel && (
            <span className="ui-meta-text text-muted-foreground">{summary.branchLabel}</span>
          )}
          {elapsed && (
            <span className="ui-meta-text tabular-nums text-muted-foreground">{elapsed}</span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" size="sm" className="h-8 px-2.5" onClick={hasResult ? onOpenResult : onOpenActivity}>
            {hasResult ? <FileText size={14} /> : <Activity size={14} />}
            {resultButtonLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}

export function WorkflowPanel() {
  const [selectedProject] = useAtom(selectedProjectAtom)
  const [selectedWorkflowPath] = useAtom(selectedWorkflowPathAtom)
  const [workflow, setWorkflow] = useAtom(currentWorkflowAtom)
  const [inputValue] = useAtom(inputValueAtom)
  const [viewMode, setViewMode] = useAtom(viewModeAtom)
  const [chatOpen, setChatOpen] = useAtom(chatPanelOpenAtom)
  const [chatPanelWidth] = useAtom(chatPanelWidthAtom)
  const [chatStatus] = useAtom(chatStatusAtom)
  const [workflowDirty] = useAtom(workflowDirtyAtom)
  const [activeNodeId] = useAtom(activeNodeIdAtom)
  const [finalContent] = useAtom(finalContentAtom)
  const [nodeStates] = useAtom(nodeStatesAtom)
  const [reportPath] = useAtom(reportPathAtom)
  const [runStartedAt] = useAtom(runStartedAtAtom)
  const [runStatus] = useAtom(runStatusAtom)
  const [runtimeMeta] = useAtom(runtimeMetaAtom)
  const [runtimeNodes] = useAtom(runtimeNodesAtom)
  const [pendingCreateMessage] = useAtom(workflowCreatePendingMessageAtom)
  const [workflowEntryState, setWorkflowEntryState] = useAtom(workflowEntryStateAtom)
  const [, setWorkflowReviewMode] = useAtom(workflowReviewModeAtom)
  const [, setMainView] = useAtom(mainViewAtom)
  const [selectedPastRun, setSelectedPastRun] = useAtom(selectedPastRunAtom)
  const [workflowPastRuns] = useAtom(workflowHistoryRunsAtom)
  const { run, cancel, rerunFrom, continueRun } = useChainExecution()
  const listScrollRegionRef = useRef<HTMLDivElement | null>(null)
  const outputPanelRef = useRef<HTMLDivElement | null>(null)
  const chatPanelShellRef = useRef<HTMLDivElement | null>(null)
  const chatPanelToggleRef = useRef<HTMLButtonElement | null>(null)
  const [showEntryEditor, setShowEntryEditor] = useState(false)
  const [prepareNewRun, setPrepareNewRun] = useState(false)
  const [elapsed, setElapsed] = useState("")
  const [outputTabRequest, setOutputTabRequest] = useState<{ tab: "nodes" | "log" | "result" | "history"; nodeId?: string; nonce: number } | null>(null)
  const [flowSurfaceMode, setFlowSurfaceMode] = useState<"outline" | "edit">("outline")
  const previousRunStatusRef = useRef(runStatus)
  const pendingListAutoScrollRef = useRef(false)

  useWorkflowReset()
  useWorkflowValidation()
  useUndoRedo()

  useEffect(() => {
    const previousRunStatus = previousRunStatusRef.current
    if (previousRunStatus === "idle" && runStatus !== "idle" && viewMode !== "list") {
      setViewMode("list")
    }
    if (runStatus === "running" && previousRunStatus !== "running") {
      pendingListAutoScrollRef.current = true
    }
    if (runStatus !== "running") {
      pendingListAutoScrollRef.current = false
    }
    previousRunStatusRef.current = runStatus
  }, [runStatus, setViewMode, viewMode])

  useEffect(() => {
    if (!runStartedAt || (runStatus !== "running" && runStatus !== "starting" && runStatus !== "cancelling" && runStatus !== "paused")) {
      setElapsed("")
      return
    }

    const tick = () => setElapsed(formatElapsedTime(runStartedAt))
    tick()
    const timerId = window.setInterval(tick, 1000)
    return () => window.clearInterval(timerId)
  }, [runStartedAt, runStatus])

  useEffect(() => {
    if (viewMode === "list" && runStatus === "running" && pendingListAutoScrollRef.current) {
      const listScrollRegion = listScrollRegionRef.current
      const outputPanel = outputPanelRef.current
      if (listScrollRegion && outputPanel) {
        const padding = 16
        const regionRect = listScrollRegion.getBoundingClientRect()
        const panelRect = outputPanel.getBoundingClientRect()
        const panelAboveViewport = panelRect.top < regionRect.top + padding
        const panelBelowViewport = panelRect.bottom > regionRect.bottom - padding

        if (panelAboveViewport || panelBelowViewport) {
          const targetTop = listScrollRegion.scrollTop + panelRect.top - regionRect.top - padding
          listScrollRegion.scrollTo({ top: Math.max(0, targetTop), behavior: "smooth" })
        }
      }
      pendingListAutoScrollRef.current = false
    }
  }, [runStatus, viewMode])

  useEffect(() => {
    if (chatOpen) return
    const activeElement = document.activeElement as HTMLElement | null
    if (activeElement && chatPanelShellRef.current?.contains(activeElement)) {
      window.requestAnimationFrame(() => {
        chatPanelToggleRef.current?.focus()
      })
    }
  }, [chatOpen])

  useEffect(() => {
    setShowEntryEditor(false)
    setFlowSurfaceMode("outline")
    setPrepareNewRun(false)
  }, [selectedWorkflowPath, workflow.name])

  useEffect(() => {
    if (runStatus !== "idle" && workflowEntryState) {
      setWorkflowEntryState(null)
    }
  }, [runStatus, setWorkflowEntryState, workflowEntryState])

  const hasMeaningfulContent = workflowHasMeaningfulContent(workflow)
  const workflowHasGeneratedSteps = workflow.nodes.some(
    (node) => node.type !== "input" && node.type !== "output",
  )
  const activeEntryState = useMemo(() => {
    if (!workflowEntryState) return null
    if (workflowEntryState.workflowPath) {
      return workflowEntryState.workflowPath === selectedWorkflowPath
        ? workflowEntryState
        : null
    }
    return workflowEntryState.workflowName === workflow.name
      ? workflowEntryState
      : null
  }, [selectedWorkflowPath, workflow.name, workflowEntryState])
  const inputNode = workflow.nodes.find((node) => node.type === "input")
  const inputValidation = resolveWorkflowInput(inputValue, {
    inputType: inputNode?.type === "input" ? inputNode.config.inputType : undefined,
    required: inputNode?.type === "input" ? inputNode.config.required : undefined,
    defaultValue: inputNode?.type === "input" ? inputNode.config.defaultValue : undefined,
  })
  const readyToRun = inputValidation.valid && workflow.nodes.some((node) => node.type === "skill")
  const showCreateDraftSkeleton = (
    viewMode === "list"
    && selectedWorkflowPath != null
    && (
      Boolean(selectedWorkflowPath && pendingCreateMessage[selectedWorkflowPath])
      || (
        (chatStatus === "thinking" || chatStatus === "streaming")
        && !workflowHasGeneratedSteps
      )
    )
  )
  const showEntryLanding = (
    viewMode === "list"
    && runStatus === "idle"
    && activeEntryState !== null
    && !showCreateDraftSkeleton
  )
  const showIdleReviewMode = (
    viewMode === "list"
    && runStatus === "idle"
    && activeEntryState === null
    && !showCreateDraftSkeleton
    && workflowPastRuns.length > 0
    && !prepareNewRun
  )
  const showIdleInputPanel = (
    viewMode === "list"
    && runStatus === "idle"
    && Boolean(inputNode)
    && !showCreateDraftSkeleton
    && !showEntryLanding
    && !showIdleReviewMode
  )
  const {
    reviewedRun,
    reviewedRunDetails,
    reviewedRunLoading,
    reviewedRunError,
  } = useSelectedRunReview(showIdleReviewMode)
  const canShowAgentPanel = Boolean(selectedWorkflowPath)
  const hasResult = finalContent.trim().length > 0
    || reportPath !== null
    || Object.values(nodeStates).some((state) => typeof state.output?.content === "string")
  const showRunStrip = runStatus !== "idle"
  const showGraphAccess = runStatus === "idle" || viewMode === "canvas"
  const runSummary = useMemo(() => buildRunProgressSummary({
    workflow,
    runtimeNodes,
    runtimeMeta,
    nodeStates,
    runStatus,
    activeNodeId,
  }), [activeNodeId, nodeStates, runStatus, runtimeMeta, runtimeNodes, workflow])
  const isRuntimeFlowView = viewMode === "list" && runStatus !== "idle"
  const listShellClass = isRuntimeFlowView
    ? "w-full px-[var(--content-gutter)] py-4 space-y-3"
    : "ui-content-shell py-3 space-y-3"

  const requestOutputTab = (tab: "nodes" | "log" | "result" | "history", nodeId?: string) => {
    setViewMode("list")
    setOutputTabRequest({ tab, nodeId, nonce: Date.now() })
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        const listScrollRegion = listScrollRegionRef.current
        const outputPanel = outputPanelRef.current
        if (listScrollRegion && outputPanel) {
          const regionRect = listScrollRegion.getBoundingClientRect()
          const panelRect = outputPanel.getBoundingClientRect()
          const padding = 12
          const panelAboveViewport = panelRect.top < regionRect.top + padding
          const panelBelowViewport = panelRect.bottom > regionRect.bottom - padding

          if (panelAboveViewport || panelBelowViewport) {
            const nextTop = listScrollRegion.scrollTop + panelRect.top - regionRect.top - padding
            listScrollRegion.scrollTo({ top: Math.max(0, nextTop), behavior: "smooth" })
          }
          return
        }
        outputPanel?.scrollIntoView({ behavior: "smooth", block: "start" })
      })
    })
  }

  const openActivity = () => {
    requestOutputTab("nodes")
  }

  const openResult = () => {
    requestOutputTab(hasResult ? "result" : "nodes")
  }

  useEffect(() => {
    if (runStatus !== "idle") return
    if (workflowPastRuns.length === 0) {
      if (selectedPastRun) {
        setSelectedPastRun(null)
      }
      return
    }
    if (prepareNewRun) return
    if (selectedPastRun && workflowPastRuns.some((run) => run.runId === selectedPastRun.runId)) return
    setSelectedPastRun(workflowPastRuns[0])
  }, [prepareNewRun, runStatus, selectedPastRun, setSelectedPastRun, workflowPastRuns])

  useEffect(() => {
    if (showIdleReviewMode) {
      setWorkflowReviewMode(true)
      setOutputTabRequest((previous) => {
        if (previous?.tab === "result") return previous
        return { tab: "result", nonce: Date.now() }
      })
      return
    }
    setWorkflowReviewMode(false)
  }, [setWorkflowReviewMode, showIdleReviewMode])

  useEffect(() => {
    if (runStatus !== "idle" && prepareNewRun) {
      setPrepareNewRun(false)
    }
  }, [prepareNewRun, runStatus])

  const focusStageDetails = ({ nodeId, preferredTab }: { nodeId: string; preferredTab: "nodes" | "log" | "result" }) => {
    if (runStatus === "idle") return
    requestOutputTab(preferredTab, nodeId)
  }

  const isFlowEditing = showEntryLanding ? showEntryEditor : flowSurfaceMode === "edit"

  if (!selectedProject && !hasMeaningfulContent) {
    return (
      <EmptyState
        icon={FolderOpen}
        title="Open a project"
        description="Choose a project folder in the sidebar to begin"
      >
        <Button
          variant="outline"
          size="sm"
          onClick={() => void window.api.addProject()}
        >
          <FolderOpen size={14} />
          Open project folder
        </Button>
      </EmptyState>
    )
  }

  if (!selectedWorkflowPath && !hasMeaningfulContent) {
    return (
      <EmptyState
        icon={FileStack}
        title="Pick a workflow"
        description="Choose an existing workflow or create a new one from the sidebar"
      >
        <Button variant="outline" size="sm" onClick={() => setMainView("templates")}>
          <LayoutTemplate size={14} />
          Start from template
        </Button>
      </EmptyState>
    )
  }

  return (
    <div className="flex-1 min-h-0 flex overflow-hidden">
      {/* Main workflow editor area */}
      <div role="region" aria-label="Workflow editor" className="flex-1 min-h-0 flex flex-col overflow-hidden min-w-0">
        <Toolbar onRun={run} onCancel={cancel} agentToggleRef={chatPanelToggleRef} />

        <Tabs
          value={viewMode}
          onValueChange={(next) => setViewMode(next as "list" | "canvas" | "settings")}
          className="flex-1 min-h-0 flex flex-col overflow-hidden"
        >
          <div className="border-b border-hairline bg-surface-1">
            <div className={cn("ui-content-gutter flex flex-wrap items-center gap-3", runStatus === "idle" ? "py-2.5" : "py-2")}>
              <div className="flex min-w-[280px] flex-1 items-center gap-2">
                <span
                  className="inline-flex h-control-sm w-control-sm shrink-0 items-center justify-center rounded-md border border-hairline bg-surface-2/80 text-muted-foreground ui-elevation-inset"
                  aria-hidden="true"
                >
                  <PencilLine size={13} />
                </span>
                {runStatus === "idle" ? (
                  <>
                    <Label htmlFor="workflow-name" className="sr-only">Workflow name</Label>
                    <Input
                      id="workflow-name"
                      type="text"
                      value={workflow.name || ""}
                      onChange={(e) =>
                        setWorkflow((prev) => ({ ...prev, name: e.target.value }))
                      }
                      placeholder="Workflow name"
                      className="h-auto min-w-0 flex-1 border-none bg-transparent px-0 py-0 text-title-md font-semibold shadow-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/20"
                    />
                  </>
                ) : (
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-title-md font-semibold text-foreground">
                      {workflow.name || "Untitled flow"}
                    </div>
                  </div>
                )}
                {workflowDirty && (
                  <Badge variant="warning" className="ui-meta-text shrink-0 px-2 py-1">
                    Unsaved
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2">
              <TabsList className="h-control-md shrink-0" aria-label="View mode">
                <TabsTrigger value="list" className="px-3 py-1">
                  <List size={13} aria-hidden="true" className="mr-1.5" />
                  Flow
                </TabsTrigger>
                <TabsTrigger value="settings" className="px-3 py-1">
                  <SlidersHorizontal size={13} aria-hidden="true" className="mr-1.5" />
                  Defaults
                </TabsTrigger>
              </TabsList>
                {viewMode === "list" && runStatus === "idle" && !showEntryLanding && (
                  <Button
                    variant={flowSurfaceMode === "edit" ? "secondary" : "ghost"}
                    size="sm"
                    className="h-control-md shrink-0"
                    onClick={() => setFlowSurfaceMode((prev) => (prev === "edit" ? "outline" : "edit"))}
                  >
                    <PencilLine size={13} />
                    {flowSurfaceMode === "edit" ? "Flow map" : "Edit flow"}
                  </Button>
                )}
                {showGraphAccess && (
                  <Button
                    variant={viewMode === "canvas" ? "secondary" : "ghost"}
                    size="sm"
                    className="h-control-md shrink-0"
                    onClick={() => setViewMode(viewMode === "canvas" ? "list" : "canvas")}
                  >
                    <LayoutGrid size={13} />
                    {viewMode === "canvas" ? "Back to flow" : "Advanced graph"}
                  </Button>
                )}
              </div>
            </div>
          </div>

          {showRunStrip && (
            <RunStrip
              summary={runSummary}
              elapsed={elapsed}
              hasResult={hasResult}
              onOpenActivity={openActivity}
              onOpenResult={openResult}
            />
          )}

          {/* Content */}
          <TabsContent value="canvas" className="mt-0 flex-1 min-h-0 flex flex-col overflow-hidden ui-fade-slide-in">
            <div className="flex-1 min-h-0 flex overflow-hidden">
              <div className="flex-1 min-h-0 min-w-0 overflow-hidden">
                <SectionErrorBoundary sectionName="canvas view">
                  <CanvasView />
                </SectionErrorBoundary>
              </div>
              <NodeInspector />
            </div>
            <div className="ui-scroll-region border-t border-hairline overflow-y-auto h-[clamp(120px,30vh,320px)]">
              <div className="ui-content-shell py-6 space-y-6">
                <InputPanel />
                <SectionErrorBoundary sectionName="output panel">
                  <OutputPanel
                    onRerunFrom={rerunFrom}
                    onContinueRun={continueRun}
                    requestedTab={outputTabRequest}
                    reviewedRun={reviewedRun}
                    reviewedRunDetails={reviewedRunDetails}
                    reviewedRunLoading={reviewedRunLoading}
                    reviewedRunError={reviewedRunError}
                  />
                </SectionErrorBoundary>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="settings" className="mt-0 ui-scroll-region flex-1 min-h-0 overflow-y-auto ui-fade-slide-in">
            <div className="ui-content-shell py-6 space-y-6">
              <WorkflowSettingsPanel />
            </div>
          </TabsContent>

          <TabsContent
            value="list"
            ref={listScrollRegionRef}
            className="mt-0 ui-scroll-region flex-1 min-h-0 overflow-y-auto ui-fade-slide-in"
          >
            <div className={listShellClass}>
              {showCreateDraftSkeleton ? (
                <WorkflowDraftSkeleton />
              ) : (
                <>
                  {showEntryLanding && activeEntryState && (
                    <>
                      <WorkflowEntryLanding
                        entry={activeEntryState}
                        displayTitle={workflow.name || activeEntryState.title}
                        readyToRun={readyToRun}
                        onRefine={() => setChatOpen(true)}
                        onToggleEditor={() => setShowEntryEditor((prev) => !prev)}
                        showEditor={showEntryEditor}
                        canRefine={canShowAgentPanel}
                        onDismiss={() => setWorkflowEntryState(null)}
                      />
                      <InputPanel label="What to provide" />
                    </>
                  )}
                  {showIdleInputPanel && (
                    <InputPanel label="Input to run" compact />
                  )}
                  {showIdleReviewMode && (
                    <div
                      ref={outputPanelRef}
                      id="run-output-panel"
                      className="scroll-mt-4 space-y-3"
                    >
                      <SectionErrorBoundary sectionName="output panel">
                        <OutputPanel
                          onRerunFrom={rerunFrom}
                          onContinueRun={continueRun}
                          requestedTab={outputTabRequest}
                          reviewingPastRun
                          reviewedRun={reviewedRun}
                          reviewedRunDetails={reviewedRunDetails}
                          reviewedRunLoading={reviewedRunLoading}
                          reviewedRunError={reviewedRunError}
                          onStartNewRun={() => setPrepareNewRun(true)}
                        />
                      </SectionErrorBoundary>
                    </div>
                  )}
                  {(!showEntryLanding || showEntryEditor) && (
                    <SectionErrorBoundary sectionName="chain builder">
                      <ChainBuilder
                        compact
                        mode={runStatus === "idle" ? (isFlowEditing ? "edit" : "outline") : "monitor"}
                        onStageSelect={focusStageDetails}
                        reviewSnapshot={showIdleReviewMode ? reviewedRunDetails?.snapshot ?? null : null}
                      />
                    </SectionErrorBoundary>
                  )}
                  {(!showEntryLanding || runStatus !== "idle") && !showIdleReviewMode && (
                    <div
                      ref={outputPanelRef}
                      id="run-output-panel"
                      className="scroll-mt-4"
                    >
                      <SectionErrorBoundary sectionName="output panel">
                        <OutputPanel
                          onRerunFrom={rerunFrom}
                          onContinueRun={continueRun}
                          requestedTab={outputTabRequest}
                          reviewedRun={reviewedRun}
                          reviewedRunDetails={reviewedRunDetails}
                          reviewedRunLoading={reviewedRunLoading}
                          reviewedRunError={reviewedRunError}
                        />
                      </SectionErrorBoundary>
                    </div>
                  )}
                </>
              )}
            </div>
          </TabsContent>
        </Tabs>

        <BatchPanel />
        <ApprovalDialog />
      </div>

      {/* Agent panel — right side */}
      {canShowAgentPanel && (
        <SectionErrorBoundary sectionName="Agent panel">
          <div
            ref={chatPanelShellRef}
            aria-hidden={!chatOpen}
            className={cn(
              "relative shrink-0 min-h-0 overflow-hidden ui-motion-standard transition-[width,opacity]",
              chatOpen ? "opacity-100" : "opacity-0",
            )}
            style={{ width: chatOpen ? chatPanelWidth : 0 }}
            inert={!chatOpen}
          >
            <ChatPanel collapsed={!chatOpen} onClose={() => setChatOpen(false)} />
          </div>
        </SectionErrorBoundary>
      )}
    </div>
  )
}
