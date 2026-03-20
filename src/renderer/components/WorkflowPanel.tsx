import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useAtom } from "jotai"
import { useWorkflowWithUndo } from "@/hooks/useWorkflowWithUndo"
import {
  chatStatusAtom,
  selectedProjectAtom,
  selectedInboxTaskKeyAtom,
  selectedWorkflowPathAtom,
  inputAttachmentsAtom,
  inputValueAtom,
  viewModeAtom,
  flowSurfaceModeAtom,
  chatPanelOpenAtom,
  workflowDirtyAtom,
  mainViewAtom,
  selectedWorkflowTemplateContextAtom,
  setWorkflowTemplateContextForKeyAtom,
  workflowCreatePendingMessageAtom,
  workflowEntryStateAtom,
  workflowSavedSnapshotAtom,
  chatPanelWidthAtom,
  workflowReviewModeAtom,
  workflowOpenStateAtom,
  webSearchBackendAtom,
  workflowsAtom,
  desktopRuntimeAtom,
  skillPickerOpenAtom,
  selectedNodeIdAtom,
} from "@/lib/store"
import {
  activeNodeIdAtom,
  artifactPersistenceStatusAtom,
  artifactRecordsAtom,
  finalContentAtom,
  nodeStatesAtom,
  reportPathAtom,
  runIdAtom,
  runStartedAtAtom,
  runOutcomeAtom,
  runStatusAtom,
  runtimeMetaAtom,
  runtimeNodesAtom,
  selectedPastRunAtom,
  surfaceNoticeAtom,
  workflowHistoryRunsAtom,
} from "@/features/execution"
import { Toolbar } from "./Toolbar"
import { RunStrip } from "./workflow/RunStrip"
import { BatchPanel } from "./BatchPanel"
import {
  EmptyProjectState,
  EmptyWorkspaceState,
} from "./workflow-panel/WorkflowPanelInlineSections"
import {
  WorkflowCanvasTab,
  WorkflowListTab,
  WorkflowSettingsTab,
} from "./workflow-panel/WorkflowPanelTabContents"
import {
  WorkflowOpenErrorBanner,
  WorkflowOpenLoadingState,
  WorkflowPanelHeader,
} from "./workflow-panel/WorkflowPanelChrome"
import { workflowHasMeaningfulContent } from "@/lib/workflow-content"
import { useWorkflowReset } from "@/hooks/useWorkflowReset"
import { useExecutionReset } from "@/hooks/useExecutionReset"
import { useWorkflowValidation } from "@/hooks/useWorkflowValidation"
import { useUndoRedo } from "@/hooks/useUndoRedo"
import { useChainExecution } from "@/hooks/useChainExecution"
import { useSelectedRunReview } from "@/hooks/useSelectedRunReview"
import { useWorkflowCreateNavigation } from "@/hooks/useWorkflowCreateNavigation"
import { prepareTemplateStageLaunch } from "@/lib/factory-launch"
import { toast } from "sonner"
import { toastError, toastErrorFromCatch } from "@/lib/toast-error"
import { Tabs } from "@/components/ui/tabs"
import {
  contextAutoRunsOnContinue,
  contextRequiresStartApproval,
} from "@/lib/stage-run-policy"
import { toWorkflowExecutionKey } from "@/lib/workflow-execution"
import type {
  ArtifactRecord,
  HumanTaskField,
  HumanTaskSnapshot,
  PermissionMode,
  Workflow,
} from "@shared/types"
import { buildRunProgressSummary, formatElapsedTime } from "@/lib/run-progress"
import { ProcessSpine } from "@/components/ui/process-spine"
import { addSkillNodeToWorkflow } from "@/lib/workflow-mutations"
import type { DiscoveredSkill } from "@shared/types"
import { CancelFlowConfirmDialog } from "./workflow-panel/CancelFlowConfirmDialog"
import { useWorkflowPanelResources } from "./workflow-panel/useWorkflowPanelResources"
import { useWorkflowPanelEntryState } from "./workflow-panel/useWorkflowPanelEntryState"
import { WorkflowPanelOverlays } from "./workflow-panel/WorkflowPanelOverlays"
import { WorkflowChatPanelShell } from "./workflow-panel/WorkflowChatPanelShell"
import { deriveWorkflowBlockedResumeSummary } from "@/lib/workflow-blocked-resume"
import { getRuntimeStagePresentation } from "@/lib/runtime-flow-labels"
import { SelectedTaskPanel } from "@/components/notifications/SelectedTaskPanel"
import {
  buildInitialHumanTaskAnswers,
  hasMissingRequiredTaskAnswers,
  taskStageKey,
  toContinuationRun,
  type TaskStageMeta,
} from "@/components/notifications/task-ui"

export function WorkflowPanel() {
  const [selectedProject] = useAtom(selectedProjectAtom)
  const [selectedInboxTaskKey, setSelectedInboxTaskKey] = useAtom(selectedInboxTaskKeyAtom)
  const [selectedWorkflowPath, setSelectedWorkflowPath] = useAtom(selectedWorkflowPathAtom)
  const { workflow, setWorkflow, setWorkflowDirect } = useWorkflowWithUndo()
  const [inputValue, setInputValue] = useAtom(inputValueAtom)
  const [inputAttachments, setInputAttachments] = useAtom(inputAttachmentsAtom)
  const [viewMode, setViewMode] = useAtom(viewModeAtom)
  const [chatOpen, setChatOpen] = useAtom(chatPanelOpenAtom)
  const [chatPanelWidth] = useAtom(chatPanelWidthAtom)
  const [chatStatus] = useAtom(chatStatusAtom)
  const [workflowDirty] = useAtom(workflowDirtyAtom)
  const [, setWorkflows] = useAtom(workflowsAtom)
  const [, setWorkflowSavedSnapshot] = useAtom(workflowSavedSnapshotAtom)
  const [webSearchBackend] = useAtom(webSearchBackendAtom)
  const [selectedWorkflowTemplateContext] = useAtom(selectedWorkflowTemplateContextAtom)
  const [, setWorkflowTemplateContextForKey] = useAtom(setWorkflowTemplateContextForKeyAtom)
  const [activeNodeId] = useAtom(activeNodeIdAtom)
  const [artifactPersistenceStatus] = useAtom(artifactPersistenceStatusAtom)
  const [artifactRecords] = useAtom(artifactRecordsAtom)
  const [finalContent] = useAtom(finalContentAtom)
  const [nodeStates] = useAtom(nodeStatesAtom)
  const [reportPath] = useAtom(reportPathAtom)
  const [runId] = useAtom(runIdAtom)
  const [runStartedAt] = useAtom(runStartedAtAtom)
  const [runOutcome] = useAtom(runOutcomeAtom)
  const [runStatus] = useAtom(runStatusAtom)
  const [runtimeMeta] = useAtom(runtimeMetaAtom)
  const [runtimeNodes] = useAtom(runtimeNodesAtom)
  const [surfaceNotice, setSurfaceNotice] = useAtom(surfaceNoticeAtom)
  const [pendingCreateMessage] = useAtom(workflowCreatePendingMessageAtom)
  const [workflowEntryState, setWorkflowEntryState] = useAtom(workflowEntryStateAtom)
  const [, setWorkflowReviewMode] = useAtom(workflowReviewModeAtom)
  const [workflowOpenState, setWorkflowOpenState] = useAtom(workflowOpenStateAtom)
  const [, setMainView] = useAtom(mainViewAtom)
  const [selectedPastRun, setSelectedPastRun] = useAtom(selectedPastRunAtom)
  const [workflowPastRuns] = useAtom(workflowHistoryRunsAtom)
  const { run, cancel, rerunFrom, continueRun, continueWithWorkflow } = useChainExecution()
  const { openWorkflowCreate } = useWorkflowCreateNavigation()
  const listScrollRegionRef = useRef<HTMLDivElement | null>(null)
  const outputPanelRef = useRef<HTMLDivElement | null>(null)
  const chatPanelShellRef = useRef<HTMLDivElement | null>(null)
  const chatPanelToggleRef = useRef<HTMLButtonElement | null>(null)
  const inputPanelRef = useRef<HTMLDivElement | null>(null)
  const blockedTaskPanelRef = useRef<HTMLDivElement | null>(null)
  const selectedResumeTaskRequestIdRef = useRef(0)
  const [showEntryEditor, setShowEntryEditor] = useState(false)
  const [prepareNewRun, setPrepareNewRun] = useState(false)
  const [launchingNextStage, setLaunchingNextStage] = useState(false)
  const [elapsed, setElapsed] = useState("")
  const [outputTabRequest, setOutputTabRequest] = useState<{ tab: "nodes" | "log" | "result" | "history"; nodeId?: string; nonce: number } | null>(null)
  const [selectedResumeTask, setSelectedResumeTask] = useState<HumanTaskSnapshot | null>(null)
  const [resumeTaskAnswers, setResumeTaskAnswers] = useState<Record<string, unknown>>({})
  const [resumeTaskSubmitting, setResumeTaskSubmitting] = useState(false)
  const [flowSurfaceMode, setFlowSurfaceMode] = useAtom(flowSurfaceModeAtom)
  const [desktopRuntime] = useAtom(desktopRuntimeAtom)
  const [, setSkillPickerOpen] = useAtom(skillPickerOpenAtom)
  const [, setSelectedNodeId] = useAtom(selectedNodeIdAtom)
  const previousRunStatusRef = useRef(runStatus)
  const lastRunInputRef = useRef(inputValue)
  const completionSurfaceRef = useRef<string | null>(null)
  const pendingListAutoScrollRef = useRef(false)
  const idleReviewAutoScrollKeyRef = useRef<string | null>(null)
  const resetExecution = useExecutionReset({ preserveCompletedWork: true })
  const [stageStartGateOpen, setStageStartGateOpen] = useState(false)
  const [pendingRunMode, setPendingRunMode] = useState<PermissionMode>("edit")
  const [pendingAutoRunPath, setPendingAutoRunPath] = useState<string | null>(null)
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false)

  const LONG_RUNNING_THRESHOLD_MS = 2 * 60 * 1000

  const handleCancelRequest = useCallback(() => {
    if (runStartedAt && Date.now() - runStartedAt >= LONG_RUNNING_THRESHOLD_MS) {
      setCancelConfirmOpen(true)
      return
    }
    void cancel()
  }, [cancel, runStartedAt])

  const handleConfirmCancel = useCallback(() => {
    setCancelConfirmOpen(false)
    void cancel()
  }, [cancel])

  useWorkflowReset()
  useWorkflowValidation()
  useUndoRedo()
  const {
    projectArtifacts,
    projectCaseStates,
    projectArtifactsLoading,
    projectArtifactsError,
    factoryBlueprint,
    packTemplates,
  } = useWorkflowPanelResources({
    selectedProject,
    selectedWorkflowTemplateContext,
    artifactRecords,
  })
  const {
    activeEntryState,
    readyToRun,
    combinedArtifactRecords,
    nextStageTemplate,
    nextStageArtifacts,
    entryStageLabel,
    resumeEntrySummary,
    entryFlowRules,
    startApprovalRequired,
    entryNextStepLabel,
    stageStartInputLabels,
    stageStartPolicyNotes,
    stageStartFlowName,
    stageStartDescription,
    showCreateDraftSkeleton,
    showResumeHeader: showEntryResumeHeader,
    showIdleReviewMode,
    processSpineStages,
    showIdleInputPanel,
    showProjectArtifactsPanel,
  } = useWorkflowPanelEntryState({
    workflow,
    selectedWorkflowPath,
    workflowEntryState,
    inputValue,
    inputAttachments,
    artifactRecords,
    projectArtifacts,
    projectCaseStates,
    selectedWorkflowTemplateContext,
    packTemplates,
    factoryBlueprint,
    runStatus,
    runOutcome,
    viewMode,
    pendingCreateMessage,
    chatStatus,
    workflowPastRunsCount: workflowPastRuns.length,
    prepareNewRun,
    projectArtifactsLoading,
    projectArtifactsError,
    selectedProject,
  })

  useEffect(() => {
    if (!selectedInboxTaskKey || !selectedWorkflowPath) {
      selectedResumeTaskRequestIdRef.current += 1
      setSelectedResumeTask(null)
      setResumeTaskAnswers({})
      return
    }

    const separatorIndex = selectedInboxTaskKey.lastIndexOf("::")
    if (separatorIndex <= 0) {
      selectedResumeTaskRequestIdRef.current += 1
      setSelectedResumeTask(null)
      setResumeTaskAnswers({})
      return
    }

    const workspace = selectedInboxTaskKey.slice(0, separatorIndex)
    const taskId = selectedInboxTaskKey.slice(separatorIndex + 2)
    const requestId = selectedResumeTaskRequestIdRef.current + 1
    selectedResumeTaskRequestIdRef.current = requestId
    let cancelled = false

    setSelectedResumeTask(null)
    setResumeTaskAnswers({})
    void window.api.loadHumanTask(taskId, workspace).then((task) => {
      if (cancelled || selectedResumeTaskRequestIdRef.current !== requestId) return
      if (!task || task.status !== "open") {
        setSelectedResumeTask(null)
        setResumeTaskAnswers({})
        return
      }
      if (task.workflowPath && task.workflowPath !== selectedWorkflowPath) {
        setSelectedResumeTask(null)
        setResumeTaskAnswers({})
        return
      }
      setSelectedResumeTask(task)
      setResumeTaskAnswers(buildInitialHumanTaskAnswers(task))
    }).catch(() => {
      if (cancelled || selectedResumeTaskRequestIdRef.current !== requestId) return
      setSelectedResumeTask(null)
      setResumeTaskAnswers({})
    })

    return () => {
      cancelled = true
    }
  }, [selectedInboxTaskKey, selectedWorkflowPath])

  const blockedResumeArtifacts = useMemo(() => {
    if (!selectedResumeTask) return [] as ArtifactRecord[]

    return combinedArtifactRecords
      .filter((artifact) =>
        (selectedResumeTask.workflowPath && artifact.workflowPath === selectedResumeTask.workflowPath)
        || artifact.runId === selectedResumeTask.sourceRunId,
      )
      .sort((left, right) => right.updatedAt - left.updatedAt)
  }, [combinedArtifactRecords, selectedResumeTask])

  const blockedResumeSummary = useMemo(
    () => selectedResumeTask
      ? deriveWorkflowBlockedResumeSummary({
        workflow,
        task: selectedResumeTask,
        sourceArtifacts: blockedResumeArtifacts,
      })
      : null,
    [blockedResumeArtifacts, selectedResumeTask, workflow],
  )
  const selectedResumeTaskStageMeta = useMemo<TaskStageMeta | null>(() => {
    if (!selectedResumeTask) return null
    const stageKey = taskStageKey(selectedResumeTask)
    if (!stageKey) return null
    const node = workflow.nodes.find((candidate) => candidate.id === selectedResumeTask.nodeId)
    if (!node) return null
    const presentation = getRuntimeStagePresentation(node, { fallbackId: node.id })
    return {
      title: presentation.title,
      group: presentation.group,
    }
  }, [selectedResumeTask, workflow.nodes])

  const blockedEntryState = useMemo(
    () => blockedResumeSummary
      ? {
        workflowPath: selectedWorkflowPath,
        workflowName: workflow.name || selectedResumeTask?.workflowName || "Untitled flow",
        source: "generated" as const,
        title: blockedResumeSummary.workLabel,
        summary: blockedResumeSummary.reasonText,
        contractLabel: "",
        contractText: "",
        inputText: "",
        outputText: "",
        readinessText: blockedResumeSummary.statusText,
      }
      : null,
    [blockedResumeSummary, selectedResumeTask?.workflowName, selectedWorkflowPath, workflow.name],
  )

  const showBlockedResumeHeader = (
    viewMode === "list"
    && runStatus === "idle"
    && activeEntryState === null
    && !showCreateDraftSkeleton
    && blockedResumeSummary !== null
  )
  const effectiveEntryState = activeEntryState || blockedEntryState
  const effectiveResumeHeader = showEntryResumeHeader || showBlockedResumeHeader
  const effectiveEntryStageLabel = blockedResumeSummary?.currentStepLabel || entryStageLabel
  const showResumeReviewMode = showBlockedResumeHeader && selectedPastRun?.status === "blocked"

  useEffect(() => {
    const previousRunStatus = previousRunStatusRef.current
    if (runStatus === "running" && previousRunStatus !== "running") {
      pendingListAutoScrollRef.current = true
    }
    if (runStatus !== "running") {
      pendingListAutoScrollRef.current = false
    }
    // Snapshot the input when a run begins so "New run" can restore it
    if (previousRunStatus === "idle" && runStatus !== "idle") {
      lastRunInputRef.current = inputValue
    }
    previousRunStatusRef.current = runStatus
  }, [inputValue, runStatus])

  const clearWorkflowOpenState = useCallback(() => {
    setWorkflowOpenState({
      status: "idle",
      targetPath: null,
      message: null,
    })
  }, [setWorkflowOpenState])

  const workflowTitleFromPath = useCallback((path: string | null) => {
    if (!path) return "flow"
    return path.split(/[\\/]/).pop()?.replace(/\.(chain|yaml|yml)$/i, "") || "flow"
  }, [])

  const scrollOutputPanelIntoListViewport = useCallback((padding = 12) => {
    const listScrollRegion = listScrollRegionRef.current
    const outputPanel = outputPanelRef.current
    if (!listScrollRegion || !outputPanel) return false

    const regionRect = listScrollRegion.getBoundingClientRect()
    const panelRect = outputPanel.getBoundingClientRect()
    const panelAboveViewport = panelRect.top < regionRect.top + padding
    const panelBelowViewport = panelRect.bottom > regionRect.bottom - padding

    if (!panelAboveViewport && !panelBelowViewport) {
      return true
    }

    const nextTop = panelAboveViewport
      ? listScrollRegion.scrollTop + panelRect.top - regionRect.top - padding
      : listScrollRegion.scrollTop + panelRect.bottom - regionRect.bottom + padding

    listScrollRegion.scrollTo({ top: Math.max(0, nextTop), behavior: "smooth" })
    return true
  }, [])

  const scrollOutputPanelToListViewportStart = useCallback((padding = 12) => {
    const listScrollRegion = listScrollRegionRef.current
    const outputPanel = outputPanelRef.current
    if (!listScrollRegion || !outputPanel) return false

    const nextTop = outputPanel.offsetTop - listScrollRegion.offsetTop - padding

    listScrollRegion.scrollTo({ top: Math.max(0, nextTop), behavior: "auto" })
    return true
  }, [])

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
      scrollOutputPanelIntoListViewport(16)
      pendingListAutoScrollRef.current = false
    }
  }, [runStatus, scrollOutputPanelIntoListViewport, viewMode])

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
    setPrepareNewRun(false)
    setOutputTabRequest(null)
    pendingListAutoScrollRef.current = false
    idleReviewAutoScrollKeyRef.current = null
    listScrollRegionRef.current?.scrollTo({ top: 0, behavior: "auto" })
  }, [selectedWorkflowPath])

  useEffect(() => {
    if (runStatus !== "idle" && workflowEntryState) {
      setWorkflowEntryState(null)
    }
  }, [runStatus, setWorkflowEntryState, workflowEntryState])

  const hasMeaningfulContent = workflowHasMeaningfulContent(workflow)
  const {
    reviewedRun,
    reviewedRunDetails,
    reviewedRunLoading,
    reviewedRunError,
  } = useSelectedRunReview(showIdleReviewMode || showResumeReviewMode)
  const canShowAgentPanel = Boolean(selectedWorkflowPath)
  const hasResult = finalContent.trim().length > 0
    || reportPath !== null
    || Object.values(nodeStates).some((state) => typeof state.output?.content === "string")
  const showRunStrip = runStatus !== "idle"
  const runSummary = useMemo(() => buildRunProgressSummary({
    workflow,
    runtimeNodes,
    runtimeMeta,
    nodeStates,
    runStatus,
    runOutcome,
    activeNodeId,
  }), [activeNodeId, nodeStates, runOutcome, runStatus, runtimeMeta, runtimeNodes, workflow])
  const isRuntimeFlowView = viewMode === "list" && runStatus !== "idle"
  const listShellClass = isRuntimeFlowView
    ? "flex min-h-full w-full flex-col px-[var(--content-gutter)] py-4 space-y-3"
    : "ui-content-shell py-3 space-y-3"
  const reviewFlowHasSnapshot = (showIdleReviewMode || showResumeReviewMode) && !!reviewedRunDetails?.snapshot
  const requestOutputTab = useCallback((tab: "nodes" | "log" | "result" | "history", nodeId?: string) => {
    setViewMode("list")
    setOutputTabRequest({ tab, nodeId, nonce: Date.now() })
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        if (scrollOutputPanelIntoListViewport()) {
          return
        }
        outputPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" })
      })
    })
  }, [scrollOutputPanelIntoListViewport, setViewMode])

  const openActivity = useCallback(() => {
    requestOutputTab("nodes")
  }, [requestOutputTab])

  const openResult = useCallback(() => {
    requestOutputTab(hasResult ? "result" : "nodes")
  }, [hasResult, requestOutputTab])

  const handleSurfaceNoticeAction = useCallback(() => {
    if (!surfaceNotice) return
    if (surfaceNotice.actionTarget === "result") {
      openResult()
      setSurfaceNotice(null)
      return
    }
    if (surfaceNotice.actionTarget === "activity") {
      openActivity()
      setSurfaceNotice(null)
      return
    }
    if (surfaceNotice.actionTarget === "inbox") {
      setMainView("inbox")
      setSurfaceNotice(null)
    }
  }, [openActivity, openResult, setMainView, setSurfaceNotice, surfaceNotice])

  const focusInputPanel = useCallback(() => {
    const inputPanel = inputPanelRef.current
    if (!inputPanel) return
    inputPanel.scrollIntoView({ behavior: "smooth", block: "start" })
    window.requestAnimationFrame(() => {
      const focusTarget = inputPanel.querySelector<HTMLElement>("textarea, input, [contenteditable='true']")
      focusTarget?.focus()
    })
  }, [])

  const focusBlockedTaskPanel = useCallback(() => {
    const panel = blockedTaskPanelRef.current
    if (!panel) return
    panel.scrollIntoView({ behavior: "smooth", block: "start" })
    window.requestAnimationFrame(() => {
      const focusTarget = panel.querySelector<HTMLElement>("button, textarea, input, select, [contenteditable='true']")
      focusTarget?.focus()
    })
  }, [])

  const handleOpenArtifact = async (artifact: ArtifactRecord) => {
    const openError = await window.api.openPath(artifact.contentPath)
    if (!openError) return
    toastError("Could not open result", {
      description: openError,
    })
  }

  const handleResumeTaskFieldChange = useCallback((field: HumanTaskField, value: unknown) => {
    setResumeTaskAnswers((previous) => ({
      ...previous,
      [field.id]: value,
    }))
  }, [])

  const submitResumeTask = useCallback(async () => {
    if (!selectedResumeTask) return false
    if (hasMissingRequiredTaskAnswers(selectedResumeTask, resumeTaskAnswers)) return false
    return window.api.submitHumanTask(selectedResumeTask.taskId, selectedResumeTask.workspace, {
      answers: resumeTaskAnswers,
    })
  }, [resumeTaskAnswers, selectedResumeTask])

  const handleSubmitResumeTask = useCallback(async () => {
    if (!selectedResumeTask) return
    setResumeTaskSubmitting(true)
    try {
      const ok = await submitResumeTask()
      if (!ok) return
      setSelectedInboxTaskKey(null)
      setSelectedResumeTask(null)
      setResumeTaskAnswers({})
    } finally {
      setResumeTaskSubmitting(false)
    }
  }, [selectedResumeTask, setSelectedInboxTaskKey, submitResumeTask])

  const handleSubmitResumeTaskAndContinue = useCallback(async () => {
    if (!selectedResumeTask || !selectedWorkflowPath) return
    setResumeTaskSubmitting(true)
    try {
      const ok = await submitResumeTask()
      if (!ok) return
      setSelectedPastRun(toContinuationRun(selectedResumeTask))
      setSelectedInboxTaskKey(null)
      setSelectedResumeTask(null)
      setResumeTaskAnswers({})
      await continueWithWorkflow(
        toContinuationRun(selectedResumeTask),
        workflow,
        selectedWorkflowPath,
      )
    } finally {
      setResumeTaskSubmitting(false)
    }
  }, [
    continueWithWorkflow,
    selectedResumeTask,
    selectedWorkflowPath,
    setSelectedInboxTaskKey,
    setSelectedPastRun,
    submitResumeTask,
    workflow,
  ])

  const handleRejectResumeTask = useCallback(async () => {
    if (!selectedResumeTask) return
    setResumeTaskSubmitting(true)
    try {
      const ok = await window.api.rejectHumanTask(selectedResumeTask.taskId, selectedResumeTask.workspace)
      if (!ok) return
      setSelectedInboxTaskKey(null)
      setSelectedResumeTask(null)
      setResumeTaskAnswers({})
    } finally {
      setResumeTaskSubmitting(false)
    }
  }, [selectedResumeTask, setSelectedInboxTaskKey])

  const handleRunRequest = useCallback(async (mode: PermissionMode = "edit") => {
    if (startApprovalRequired) {
      setPendingRunMode(mode)
      setStageStartGateOpen(true)
      return
    }
    await run(mode)
  }, [run, startApprovalRequired])

  const handleApproveStageStart = useCallback(async () => {
    const mode = pendingRunMode
    setStageStartGateOpen(false)
    await run(mode)
  }, [pendingRunMode, run])

  const handleCancelStageStart = useCallback(() => {
    setStageStartGateOpen(false)
    setPendingRunMode("edit")
  }, [])

  const handleRunNextStage = useCallback(async () => {
    if (!selectedProject || !nextStageTemplate || launchingNextStage) return

    setLaunchingNextStage(true)
    try {
      const launch = await prepareTemplateStageLaunch({
        projectPath: selectedProject,
        template: nextStageTemplate,
        webSearchBackend,
        artifacts: nextStageArtifacts,
      })

      setWorkflows(launch.refreshedWorkflows)
      setSelectedWorkflowPath(launch.filePath)
      setWorkflowDirect(launch.loadedWorkflow)
      setWorkflowSavedSnapshot(launch.savedSnapshot)
      setInputValue(launch.inputSeed)
      setWorkflowEntryState(launch.entryState)
      setWorkflowTemplateContextForKey({
        key: toWorkflowExecutionKey(launch.filePath),
        context: launch.templateContext,
      })
      setPrepareNewRun(false)
      setWorkflowReviewMode(false)
      setMainView("thread")
      setViewMode("list")
      setOutputTabRequest(null)
      setInputAttachments(launch.artifactAttachments)
      const nextStageNeedsApproval = contextRequiresStartApproval(launch.templateContext)
      setPendingAutoRunPath(nextStageNeedsApproval ? null : launch.filePath)

      toast.success(
        nextStageNeedsApproval
          ? `Opened step awaiting approval: ${deriveTemplateContinuationLabel(nextStageTemplate) || deriveTemplateJobLabel(nextStageTemplate) || deriveTemplateDisplayLabel(nextStageTemplate) || nextStageTemplate.name}`
          : `Continuing to ${deriveTemplateContinuationLabel(nextStageTemplate) || deriveTemplateJobLabel(nextStageTemplate) || deriveTemplateDisplayLabel(nextStageTemplate) || nextStageTemplate.name}`,
      )
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          if (nextStageNeedsApproval) {
            focusInputPanel()
          }
        })
      })
    } catch (error) {
      toastErrorFromCatch("Could not open the next step", error)
    } finally {
      setLaunchingNextStage(false)
    }
  }, [
    focusInputPanel,
    launchingNextStage,
    nextStageArtifacts,
    nextStageTemplate,
    selectedProject,
    setInputAttachments,
    setInputValue,
    setMainView,
    setOutputTabRequest,
    setPrepareNewRun,
    setSelectedWorkflowPath,
    setViewMode,
    setWorkflowDirect,
    setWorkflowEntryState,
    setWorkflowReviewMode,
    setWorkflowSavedSnapshot,
    setWorkflowTemplateContextForKey,
    setWorkflows,
    webSearchBackend,
  ])

  useEffect(() => {
    if (runStatus === "idle") return
    setStageStartGateOpen(false)
  }, [runStatus])

  useEffect(() => {
    if (!stageStartGateOpen) return
    if (startApprovalRequired) return
    setStageStartGateOpen(false)
    setPendingRunMode("edit")
  }, [stageStartGateOpen, startApprovalRequired])

  useEffect(() => {
    if (!pendingAutoRunPath) return
    if (selectedWorkflowPath !== pendingAutoRunPath) return
    if (runStatus !== "idle") return
    if (!contextAutoRunsOnContinue(selectedWorkflowTemplateContext)) return

    setPendingAutoRunPath(null)
    void handleRunRequest()
  }, [handleRunRequest, pendingAutoRunPath, runStatus, selectedWorkflowPath, selectedWorkflowTemplateContext])

  useEffect(() => {
    if (runStatus !== "done" || runOutcome !== "completed" || !hasResult || viewMode !== "list") {
      completionSurfaceRef.current = null
      return
    }
    const completionKey = `${selectedWorkflowPath ?? "__draft__"}:${runId || "completed"}`
    if (completionSurfaceRef.current === completionKey) return
    completionSurfaceRef.current = completionKey
    openResult()
  }, [hasResult, openResult, runId, runOutcome, runStatus, selectedWorkflowPath, viewMode])

  const handleStartNewRun = () => {
    // Preserve the previous input so the user can edit rather than retype
    const previousInput = inputValue || lastRunInputRef.current
    if (runStatus !== "idle") {
      resetExecution()
      setOutputTabRequest(null)
    }
    // Restore the input value in case execution reset or any other effect cleared it
    if (!inputValue && previousInput) {
      setInputValue(previousInput)
    }
    setPrepareNewRun(true)
    setViewMode("list")
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => focusInputPanel())
    })
  }

  const sharedOutputPanelProps = useMemo(() => ({
    onRerunFrom: rerunFrom,
    onContinueRun: continueRun,
    requestedTab: outputTabRequest,
    reviewedRun,
    reviewedRunDetails,
    reviewedRunLoading,
    reviewedRunError,
    onStartNewRun: handleStartNewRun,
    onOpenInbox: () => setMainView("inbox"),
    onOpenArtifacts: () => setMainView("artifacts"),
    nextStageTemplate,
    nextStageArtifacts,
    onRunNextStage: selectedProject && nextStageTemplate ? handleRunNextStage : null,
    nextStagePending: launchingNextStage,
  }), [
    continueRun,
    handleRunNextStage,
    handleStartNewRun,
    launchingNextStage,
    nextStageArtifacts,
    nextStageTemplate,
    outputTabRequest,
    rerunFrom,
    reviewedRun,
    reviewedRunDetails,
    reviewedRunError,
    reviewedRunLoading,
    selectedProject,
    setMainView,
  ])

  useEffect(() => {
    if (runStatus !== "idle") return
    if (workflowPastRuns.length === 0) {
      if (selectedPastRun) {
        setSelectedPastRun(null)
      }
      return
    }
    if (prepareNewRun) return
    const preferredBlockedRun = selectedResumeTask
      ? workflowPastRuns.find((run) => run.runId === selectedResumeTask.sourceRunId) || null
      : null
    if (preferredBlockedRun) {
      if (selectedPastRun?.runId === preferredBlockedRun.runId) return
      setSelectedPastRun(preferredBlockedRun)
      return
    }
    if (selectedPastRun && workflowPastRuns.some((run) => run.runId === selectedPastRun.runId)) return
    setSelectedPastRun(workflowPastRuns[0])
  }, [prepareNewRun, runStatus, selectedPastRun, selectedResumeTask, setSelectedPastRun, workflowPastRuns])

  useEffect(() => {
    if (showIdleReviewMode || showResumeReviewMode) {
      setWorkflowReviewMode(true)
      setOutputTabRequest((previous) => {
        if (previous?.tab === "result") return previous
        return { tab: "result", nonce: Date.now() }
      })
      return
    }
    setWorkflowReviewMode(false)
  }, [setWorkflowReviewMode, showIdleReviewMode, showResumeReviewMode])

  useEffect(() => {
    if ((!showIdleReviewMode && !showResumeReviewMode) || viewMode !== "list") return

    const reviewKey = `${selectedWorkflowPath || "no-flow"}::${selectedPastRun?.runId || "latest"}`
    if (idleReviewAutoScrollKeyRef.current === reviewKey) return

    idleReviewAutoScrollKeyRef.current = reviewKey
    const tryScroll = () => {
      if (scrollOutputPanelToListViewportStart(16)) return
      outputPanelRef.current?.scrollIntoView({ behavior: "auto", block: "start" })
    }

    window.requestAnimationFrame(() => {
      tryScroll()
      window.requestAnimationFrame(() => {
        tryScroll()
      })
    })
  }, [scrollOutputPanelToListViewportStart, selectedPastRun?.runId, selectedWorkflowPath, showIdleReviewMode, showResumeReviewMode, viewMode])

  useEffect(() => {
    if (runStatus !== "idle" && prepareNewRun) {
      setPrepareNewRun(false)
    }
  }, [prepareNewRun, runStatus])

  const handleAttachCapability = useCallback(() => {
    setSkillPickerOpen(true)
  }, [setSkillPickerOpen])

  const handleAttachCapabilitySelection = useCallback((skill: DiscoveredSkill) => {
    let nextSelectedId: string | null = null
    setWorkflow((prev) => {
      const previousNodeIds = new Set(prev.nodes.map((node) => node.id))
      const next = addSkillNodeToWorkflow(prev, skill)
      nextSelectedId = next.nodes.find((node) => !previousNodeIds.has(node.id))?.id ?? null
      return next
    })
    if (nextSelectedId) {
      setSelectedNodeId(nextSelectedId)
    }
    setShowEntryEditor(true)
    setFlowSurfaceMode("edit")
    toast.success(`Attached ${skill.name}`, {
      description: "Added to this flow. Review the new skill in Edit flow.",
    })
  }, [setFlowSurfaceMode, setSelectedNodeId, setWorkflow])

  const focusStageDetails = ({ nodeId, preferredTab }: { nodeId: string; preferredTab: "nodes" | "log" | "result" }) => {
    if (runStatus === "idle" && !showIdleReviewMode && !showResumeReviewMode) return
    requestOutputTab(preferredTab, nodeId)
  }

  const blockedTaskPanel = showBlockedResumeHeader && selectedResumeTask ? (
    <div ref={blockedTaskPanelRef} data-blocked-task-panel="true">
      <SelectedTaskPanel
        selectedTask={selectedResumeTask}
        taskLoading={false}
        taskSubmitting={resumeTaskSubmitting}
        taskAnswers={resumeTaskAnswers}
        selectedTaskStageMeta={selectedResumeTaskStageMeta}
        showOpenWorkflowButton={false}
        className="rounded-lg border border-hairline bg-surface-2/70 px-5 py-4"
        onOpenWorkflow={() => {}}
        onFieldChange={handleResumeTaskFieldChange}
        onSubmit={() => { void handleSubmitResumeTask() }}
        onSubmitAndContinue={() => { void handleSubmitResumeTaskAndContinue() }}
        onReject={() => { void handleRejectResumeTask() }}
      />
    </div>
  ) : null

  const isFlowEditing = effectiveResumeHeader ? showEntryEditor : flowSurfaceMode === "edit"
  const chainBuilderMode = runStatus !== "idle"
    ? "monitor"
    : reviewFlowHasSnapshot
      ? "monitor"
      : isFlowEditing
        ? "edit"
        : "outline"
  if (!selectedProject && !hasMeaningfulContent) {
    return (
      <EmptyWorkspaceState onOpenProject={() => { void window.api.addProject() }} />
    )
  }

  if (!selectedWorkflowPath && !hasMeaningfulContent) {
    return (
      <EmptyProjectState
        onOpenTemplates={() => setMainView("templates")}
        onQuickStart={(prompt) => openWorkflowCreate({ prompt })}
      />
    )
  }

  return (
    <div className="flex-1 min-h-0 flex overflow-hidden">
      {/* Main workflow editor area */}
      <div role="region" aria-label="Flow workspace" className="flex-1 min-h-0 flex flex-col overflow-hidden min-w-0">
        <Toolbar onRun={handleRunRequest} onCancel={handleCancelRequest} agentToggleRef={chatPanelToggleRef} />

        {workflowOpenState.status === "loading" ? (
          <WorkflowOpenLoadingState flowLabel={workflowTitleFromPath(workflowOpenState.targetPath)} />
        ) : (
          <>
            {workflowOpenState.status === "error" && (
              <WorkflowOpenErrorBanner
                flowLabel={workflowTitleFromPath(workflowOpenState.targetPath)}
                message={workflowOpenState.message}
                onDismiss={clearWorkflowOpenState}
              />
            )}

            <Tabs
              value={viewMode}
              onValueChange={(next) => setViewMode(next as "list" | "canvas" | "settings")}
              className="flex-1 min-h-0 flex flex-col overflow-hidden"
            >
          <WorkflowPanelHeader
            runStatus={runStatus}
            showResumeHeader={effectiveResumeHeader}
            showEntryEditor={showEntryEditor}
            workflowName={workflow.name || ""}
            entryTitle={effectiveEntryState?.title}
            workflowDirty={workflowDirty}
            viewMode={viewMode}
            flowSurfaceMode={flowSurfaceMode}
            onWorkflowNameChange={(next) =>
              setWorkflow((prev) => ({ ...prev, name: next }), { coalesceKey: "workflow-name" })
            }
            onToggleFlowSurfaceMode={() => setFlowSurfaceMode((prev) => (prev === "edit" ? "outline" : "edit"))}
          />

          {showRunStrip && (
            <RunStrip
              summary={runSummary}
              elapsed={elapsed}
              hasResult={hasResult}
              onOpenActivity={openActivity}
              onOpenResult={openResult}
            />
          )}

          {processSpineStages && processSpineStages.length > 1 && (
            <div className="border-b border-hairline bg-surface-1/80">
              <div className="ui-content-gutter py-2">
                <ProcessSpine stages={processSpineStages} />
              </div>
            </div>
          )}

          <WorkflowCanvasTab
            surfaceNotice={surfaceNotice}
            onSurfaceNoticeAction={handleSurfaceNoticeAction}
            onDismissSurfaceNotice={() => setSurfaceNotice(null)}
            outputPanelProps={{
              ...sharedOutputPanelProps,
              reviewingPastRun: showIdleReviewMode || showResumeReviewMode,
            }}
          />

          <WorkflowSettingsTab
            surfaceNotice={surfaceNotice}
            onSurfaceNoticeAction={handleSurfaceNoticeAction}
            onDismissSurfaceNotice={() => setSurfaceNotice(null)}
          />

          <WorkflowListTab
            listScrollRegionRef={listScrollRegionRef}
            listShellClass={listShellClass}
            showCreateDraftSkeleton={showCreateDraftSkeleton}
            showResumeHeader={effectiveResumeHeader}
            activeEntryState={effectiveEntryState}
            workflowName={workflow.name}
            readyToRun={readyToRun}
            startApprovalRequired={startApprovalRequired}
            entryStageLabel={effectiveEntryStageLabel}
            resumeEntrySummary={resumeEntrySummary}
            blockedResumeSummary={blockedResumeSummary}
            entryFlowRules={entryFlowRules}
            entryNextStepLabel={entryNextStepLabel}
            stageStartInputLabels={stageStartInputLabels}
            onPrimaryEntryAction={() => {
              if (blockedResumeSummary) {
                focusBlockedTaskPanel()
                return
              }
              if (readyToRun) {
                void handleRunRequest()
                return
              }
              focusInputPanel()
            }}
            onOpenResumeArtifact={
              resumeEntrySummary?.primaryArtifact
                ? () => { void handleOpenArtifact(resumeEntrySummary.primaryArtifact!) }
                : blockedResumeSummary?.primaryArtifact
                  ? () => { void handleOpenArtifact(blockedResumeSummary.primaryArtifact!) }
                  : null
            }
            onRefine={() => setChatOpen(true)}
            onToggleEntryEditor={() => setShowEntryEditor((prev) => !prev)}
            onAttachCapability={handleAttachCapability}
            showEntryEditor={showEntryEditor}
            canShowAgentPanel={canShowAgentPanel}
            onDismissEntry={() => {
              if (blockedResumeSummary) {
                setSelectedInboxTaskKey(null)
                return
              }
              setWorkflowEntryState(null)
            }}
            inputPanelRef={inputPanelRef}
            showProjectArtifactsPanel={showProjectArtifactsPanel}
            combinedArtifactRecords={combinedArtifactRecords}
            projectArtifactsLoading={projectArtifactsLoading}
            projectArtifactsError={projectArtifactsError}
            requiredContracts={selectedWorkflowTemplateContext?.contractIn}
            onOpenArtifact={(artifact) => { void handleOpenArtifact(artifact) }}
            showIdleInputPanel={showIdleInputPanel}
            chainBuilderMode={chainBuilderMode}
            onFocusStageDetails={focusStageDetails}
            reviewSnapshot={(showIdleReviewMode || showResumeReviewMode) ? reviewedRunDetails?.snapshot ?? null : null}
            showReviewOutputMode={showIdleReviewMode || showResumeReviewMode}
            blockedTaskPanel={blockedTaskPanel}
            runStatus={runStatus}
            outputPanelRef={outputPanelRef}
            outputPanelProps={sharedOutputPanelProps}
          />
            </Tabs>
          </>
        )}

        <BatchPanel />
        <WorkflowPanelOverlays
          showResumeHeader={effectiveResumeHeader}
          showEntryEditor={showEntryEditor}
          entryStageLabel={effectiveEntryStageLabel}
          onAttachCapabilitySelection={handleAttachCapabilitySelection}
          stageStartGateOpen={stageStartGateOpen}
          stageStartFlowName={stageStartFlowName}
          stageStartTitle={effectiveEntryState?.title || workflow.name || selectedWorkflowTemplateContext?.templateName || "This step"}
          stageLabel={effectiveEntryStageLabel}
          stageStartDescription={stageStartDescription}
          entryFlowRules={entryFlowRules}
          expectedArtifact={selectedWorkflowTemplateContext?.outputText || effectiveEntryState?.outputText || "A reviewable result"}
          inputPreview={inputValue}
          inputLabels={stageStartInputLabels}
          notes={stageStartPolicyNotes}
          shortcutLabel={`${desktopRuntime.primaryModifierLabel}↵`}
          primaryModifierKey={desktopRuntime.primaryModifierKey}
          onApproveStageStart={handleApproveStageStart}
          onCancelStageStart={handleCancelStageStart}
        />
        <CancelFlowConfirmDialog
          open={cancelConfirmOpen}
          onOpenChange={setCancelConfirmOpen}
          runStartedAt={runStartedAt}
          onConfirmCancel={handleConfirmCancel}
        />
      </div>

      {canShowAgentPanel && (
        <WorkflowChatPanelShell
          shellRef={chatPanelShellRef}
          open={chatOpen}
          width={chatPanelWidth}
          onClose={() => setChatOpen(false)}
        />
      )}
    </div>
  )
}
