import { useAtomValue, useSetAtom } from "jotai"
import { useRef, useEffect, useState, useCallback, useMemo } from "react"
import { Tabs, TabsContent } from "@/components/ui/tabs"
import {
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import { CursorMenu } from "@/components/ui/cursor-menu"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { desktopRuntimeAtom, outputSurfaceCommandStateAtom } from "@/lib/store"
import { useOutputPanel } from "@/hooks/useOutputPanel"
import { HistoryTab } from "@/components/output/HistoryTab"
import { ActivityTab } from "@/components/output/ActivityTab"
import { OutputPanelHeader } from "@/components/output/OutputPanelHeader"
import { ResultTab } from "@/components/output/ResultTab"
import { LogTab } from "@/components/output/OutputSections"
import { SelectedStepSummaryPanel } from "@/components/output/SelectedStepSummaryPanel"
import type { ArtifactRecord, LoadedRunResult, RunResult, WorkflowTemplate } from "@shared/types"
import { toastError, toastErrorFromCatch } from "@/lib/toast-error"
import {
  consumeShortcut,
  isEditableKeyboardTarget,
  isShortcutConsumed,
  matchesPrimaryShortcut,
} from "@/lib/keyboard-shortcuts"
import { ExecutionSurfaceNoticeBanner } from "@/components/ui/execution-surface-notice"
import { useOutputPanelDerivedState } from "@/components/output/useOutputPanelDerivedState"
import { cn } from "@/lib/cn"
import { createDefaultOutputSurfaceCommandState } from "@/lib/output-surface-commands"
import { subscribeOutputSurfaceCommands } from "@/lib/output-surface-command-bus"
import { subscribeDesktopCommands } from "@/lib/desktop-command-bus"

type OutputTabValue = "nodes" | "log" | "result" | "history"

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
  onEditFlow,
  nextStageTemplate = null,
  nextStageArtifacts = [],
  onRunNextStage,
  nextStagePending = false,
  fillHeight = false,
  onUseInNewFlow = null,
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
  onEditFlow?: () => void
  nextStageTemplate?: WorkflowTemplate | null
  nextStageArtifacts?: ArtifactRecord[]
  onRunNextStage?: (() => Promise<void> | void) | null
  nextStagePending?: boolean
  fillHeight?: boolean
  onUseInNewFlow?: (() => Promise<void> | void) | null
}) {
  const desktopRuntime = useAtomValue(desktopRuntimeAtom)
  const setOutputSurfaceCommandState = useSetAtom(outputSurfaceCommandStateAtom)
  const {
    runStatus,
    runOutcome,
    runStartedAt,
    completedAt,
    executionWorkflowName,
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
    runId,
    evalOverrideNodeIds,
  } = useOutputPanel()
  const [activeTab, setActiveTab] = useState<OutputTabValue>("nodes")
  const [resultReadyPulse, setResultReadyPulse] = useState(false)
  const [outputContextMenu, setOutputContextMenu] = useState<
    | { x: number, y: number, scope: "result" }
    | { x: number, y: number, scope: "artifact", artifact: ArtifactRecord }
    | null
  >(null)
  const resultPulseTimerRef = useRef<number | null>(null)
  const resultSignalShownRef = useRef(false)
  const previousRunStatusRef = useRef(runStatus)
  const surfaceIdentityRef = useRef<string | null>(null)
  const cancelResultReadyPulse = useCallback(() => {
    if (resultPulseTimerRef.current) {
      window.clearTimeout(resultPulseTimerRef.current)
      resultPulseTimerRef.current = null
    }
  }, [])
  const clearResultReadyPulse = useCallback(() => {
    cancelResultReadyPulse()
    setResultReadyPulse(false)
  }, [cancelResultReadyPulse])
  const queueResultReadyPulse = useCallback(() => {
    cancelResultReadyPulse()
    setResultReadyPulse(true)
    resultPulseTimerRef.current = window.setTimeout(() => {
      setResultReadyPulse(false)
      resultPulseTimerRef.current = null
    }, 2800)
  }, [cancelResultReadyPulse])
  const {
    selectedReviewRun,
    rerunWorkspace,
    reviewingRunHistory,
    reviewSnapshot,
    displayNodeStates,
    displayEvalResults,
    allDisplayNodes,
    selectedNodeId,
    displayActiveNodeId,
    templateById,
    resultNodeOptions,
    budgetWarning,
    budgetWarningClassName,
    hasResult,
    displayedResultContent,
    resultCopyTextWithHeader,
    isDisplayedResultEmpty,
    canCopyResult,
    hasMultipleResultOptions,
    showIdleState,
    selectedResultNodeId,
    selectedResultPresentation,
    selectedResultBranchLabel,
    selectedStageId,
    selectedStageIndex,
    selectedStagePresentation,
    selectedStageBranchLabel,
    selectedStageBranchDetail,
    selectedStageStatusLabel,
    workflowStepCount,
    completedStageCount,
    failedStageCount,
    selectedStageContextLabel,
    selectedStageContextToneClass,
    selectedStageContextLabelClass,
    activitySummaryItems,
    selectedRunLabel,
    canInspectSavedRun,
    canStartFreshRun,
    canRerunStages,
    canRerunSelectedStage,
    showResultSurface,
    showArtifactContinuation,
    failedNodeErrors,
    artifactContinuationToneClass,
    nextStageRequiresApproval,
    nextStageAutoRuns,
    nextStageLabel,
    nextStageDescription,
    visibleArtifactContinuation,
    hiddenArtifactContinuationCount,
    visibleNextStageArtifacts,
    hiddenNextStageArtifactCount,
    executionLoopSummary,
    approvalLoopSummary,
    showLoopStateIndicator,
    effectiveRunOutcome,
  } = useOutputPanelDerivedState({
    runStatus,
    runOutcome,
    runStartedAt,
    completedAt,
    executionWorkflowName,
    nodeStates,
    activeNodeId,
    inspectedNodeId,
    finalContent,
    workflow,
    evalResults,
    runtimeMeta,
    pastRuns,
    reviewedRun: reviewedRun || selectedPastRun || null,
    reviewedRunDetails,
    reviewingPastRun,
    artifactRecords,
    artifactPersistenceStatus,
    artifactPersistenceError,
    workspace,
    onStartNewRun,
    onContinueRun,
    onRerunFrom,
    nextStageTemplate,
    nextStageArtifacts,
    nextStagePending,
  })

  const selectedWorkflowNode = useMemo(() => {
    if (!selectedStageId) return null
    return workflow.nodes.find((n) => n.id === selectedStageId) ?? null
  }, [selectedStageId, workflow.nodes])

  const handleRerunFrom = useCallback((nodeId: string) => {
    if (!onRerunFrom || !rerunWorkspace) return
    void onRerunFrom(nodeId, { workspace: rerunWorkspace })
  }, [onRerunFrom, rerunWorkspace])

  const savedRunLoadingNotice = reviewingRunHistory && reviewedRunLoading ? (
    <div className="flex items-center gap-2 px-1 py-2 ui-meta-text text-muted-foreground">
      <Loader2 size={14} className="animate-spin shrink-0" />
      Loading saved run details…
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
        description: "This saved run still has its final result, but the full step snapshot is unavailable.",
        actionLabel: "",
        actionTarget: "result",
      }}
    />
  ) : null
  const runAttentionBanner = !reviewingRunHistory && (runStatus === "error" || runOutcome === "failed" || runOutcome === "interrupted") ? (
    <ExecutionSurfaceNoticeBanner
      notice={{
        level: "error",
        title: "Run needs attention",
        description: failedNodeErrors.length === 0
          ? "Inspect the activity log for the failing step or the last interrupted step."
          : "One or more steps failed during the latest run.",
        actionLabel: "",
        actionTarget: "activity",
      }}
      children={failedNodeErrors.length > 0 ? (
        <div className="space-y-1 text-body-sm text-status-danger">
          {failedNodeErrors.map(([id, s]) => {
            const node = allDisplayNodes.find((n) => n.id === id)
            const errorText = s.error || "Unknown error"
            const isLong = errorText.length > 140
            return isLong ? (
              <details key={id} className="text-status-danger/80">
                <summary className="cursor-pointer list-none">
                  <span className="font-medium">{node?.label || id}:</span>{" "}
                  {errorText.slice(0, 140)}…
                </summary>
                <pre className="mt-1 whitespace-pre-wrap text-status-danger/70 pl-4 text-body-sm">{errorText}</pre>
              </details>
            ) : (
              <div key={id} className="text-status-danger/80">
                <span className="font-medium">{node?.label || id}:</span>{" "}
                {errorText}
              </div>
            )
          })}
        </div>
      ) : null}
    />
  ) : null
  const errorFigureOwnsSurface = !reviewingRunHistory
    && showResultSurface
    && (runStatus === "error" || effectiveRunOutcome === "failed" || effectiveRunOutcome === "interrupted")
  const openNodeDetails = useCallback((nodeId: string) => {
    setInspectedNodeId(nodeId)
    setActiveTab("nodes")
  }, [setInspectedNodeId])
  const canInspectActivity = !showIdleState && (!reviewingRunHistory || canInspectSavedRun)
  const canInspectLog = !showIdleState && Boolean(selectedStageId) && (!reviewingRunHistory || canInspectSavedRun)
  const canInspectHistory = pastRuns.length > 0
  const tabOptions = useMemo(() => {
    const options: Array<{ value: OutputTabValue, label: string }> = []
    if (showResultSurface) {
      options.push({ value: "result", label: "Result" })
    }
    if (canInspectActivity) {
      options.push({ value: "nodes", label: "Activity" })
    }
    if (canInspectLog) {
      options.push({ value: "log", label: "Step log" })
    }
    if (canInspectHistory) {
      options.push({ value: "history", label: "History" })
    }
    return options
  }, [canInspectActivity, canInspectHistory, canInspectLog, showResultSurface])

  const handleCopyResult = useCallback(async () => {
    if (!canCopyResult) return
    try {
      await navigator.clipboard.writeText(resultCopyTextWithHeader)
    } catch (error) {
      console.error("[OutputPanel] copy result failed:", error)
      toastErrorFromCatch("Could not copy result", error)
    }
  }, [canCopyResult, resultCopyTextWithHeader])

  const handleOpenReport = useCallback(async (path: string) => {
    try {
      await Promise.resolve(onOpenReport(path))
    } catch (error) {
      console.error("[OutputPanel] open report failed:", error)
      toastErrorFromCatch("Could not open report file", error)
    }
  }, [onOpenReport])

  const handleOpenArtifact = useCallback(async (artifact: ArtifactRecord) => {
    const openError = await window.api.openPath(artifact.contentPath)
    if (!openError) return
    toastError("Could not open file", {
      description: openError,
    })
  }, [])

  const handleCopyArtifactPath = useCallback(async (artifact: ArtifactRecord) => {
    try {
      await navigator.clipboard.writeText(artifact.contentPath)
    } catch (error) {
      console.error("[OutputPanel] copy artifact path failed:", error)
      toastErrorFromCatch("Could not copy file path", error)
    }
  }, [])

  const focusStageSurface = useCallback((tab: "nodes" | "log") => {
    const fallbackNodeId = selectedStageId
      || selectedResultNodeId
      || allDisplayNodes[allDisplayNodes.length - 1]?.id
      || allDisplayNodes[0]?.id
      || null

    if (fallbackNodeId) {
      setInspectedNodeId(fallbackNodeId)
    }
    setActiveTab(tab)
  }, [allDisplayNodes, selectedResultNodeId, selectedStageId, setInspectedNodeId])

  const activateResultSurface = useCallback(() => {
    setResultReadyPulse(false)
    if (selectedResultNodeId) {
      setInspectedNodeId(selectedResultNodeId)
    }
    setActiveTab("result")
  }, [selectedResultNodeId, setInspectedNodeId])

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.defaultPrevented || isShortcutConsumed(event)) return

      if (isEditableKeyboardTarget(event.target as HTMLElement | null)) return
      if (!matchesPrimaryShortcut(event, { key: "Enter", primaryModifierKey: desktopRuntime.primaryModifierKey })) return

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
      }
    }

    window.addEventListener("keydown", handler, true)
    return () => {
      window.removeEventListener("keydown", handler, true)
    }
  }, [
    activeTab,
    artifactPersistenceStatus,
    desktopRuntime.primaryModifierKey,
    nextStagePending,
    nextStageTemplate,
    onRunNextStage,
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
    if (!showResultSurface && activeTab === "result") {
      setActiveTab("nodes")
    }
  }, [activeTab, showResultSurface])

  useEffect(() => {
    if (activeTab === "history" && pastRuns.length === 0) {
      setActiveTab("nodes")
    }
  }, [activeTab, pastRuns.length])

  useEffect(() => {
    if (activeTab !== "log") return
    if (canInspectLog) return
    setActiveTab(canInspectActivity ? "nodes" : showResultSurface ? "result" : "nodes")
  }, [activeTab, canInspectActivity, canInspectLog, showResultSurface])

  const preferredTopLevelTab = (
    showResultSurface
    && (
      reviewingRunHistory
      || runStatus === "error"
      || (runStatus === "done" && effectiveRunOutcome !== "blocked")
    )
  )
    ? "result"
    : "nodes"
  const surfaceIdentityKey = reviewingRunHistory
    ? `review:${selectedReviewRun?.runId || "latest"}`
    : `live:${runId || "none"}:${runStatus}:${effectiveRunOutcome || "none"}`

  useEffect(() => {
    if (requestedTab) return
    if (surfaceIdentityRef.current === surfaceIdentityKey) return
    surfaceIdentityRef.current = surfaceIdentityKey

    if (preferredTopLevelTab === "result" && showResultSurface) {
      setActiveTab("result")
      return
    }

    setActiveTab("nodes")
  }, [preferredTopLevelTab, requestedTab, showResultSurface, surfaceIdentityKey])

  const activityOwnsSurface = !showIdleState
    && activeTab === "nodes"
    && !reviewingRunHistory
    && !errorFigureOwnsSurface

  useEffect(() => {
    if (!requestedTab) return
    if (requestedTab.tab === "result" && !showResultSurface) return
    if (requestedTab.tab === "history" && pastRuns.length === 0) return
    if (requestedTab.nodeId) {
      setInspectedNodeId(requestedTab.nodeId)
    }
    setActiveTab(requestedTab.tab)
  }, [pastRuns.length, requestedTab, setInspectedNodeId, showResultSurface])

  useEffect(() => {
    const previousStatus = previousRunStatusRef.current
    const reachedTerminal = runStatus === "done" || runStatus === "error"
    const wasTerminal = previousStatus === "done" || previousStatus === "error"
    const justEnteredTerminal = reachedTerminal && !wasTerminal

    if (
      !showResultSurface
      || !reachedTerminal
      || effectiveRunOutcome === "blocked"
    ) {
      resultSignalShownRef.current = false
      clearResultReadyPulse()
      previousRunStatusRef.current = runStatus
      return
    }

    previousRunStatusRef.current = runStatus

    if (justEnteredTerminal) {
      resultSignalShownRef.current = true

      clearResultReadyPulse()

      if (activeTab !== "result" && activeTab !== "history") {
        setActiveTab("result")
        return
      }

      if (activeTab === "history") {
        queueResultReadyPulse()
      }

      return
    }

    if (activeTab === "result" || resultSignalShownRef.current) return

    resultSignalShownRef.current = true
    queueResultReadyPulse()
  }, [activeTab, clearResultReadyPulse, effectiveRunOutcome, queueResultReadyPulse, runStatus, showResultSurface])

  useEffect(() => {
    return () => {
      cancelResultReadyPulse()
    }
  }, [cancelResultReadyPulse])

  useEffect(() => {
    setOutputSurfaceCommandState({
      result: showResultSurface,
      activity: canInspectActivity,
      log: canInspectLog,
      history: canInspectHistory,
      rerunFromStep: Boolean(selectedStageId && canRerunSelectedStage),
      useInNewFlow: Boolean(onUseInNewFlow && showResultSurface && !reviewingRunHistory),
    })

    return () => {
      setOutputSurfaceCommandState(createDefaultOutputSurfaceCommandState())
    }
  }, [
    canInspectSavedRun,
    canInspectActivity,
    canInspectHistory,
    canInspectLog,
    canRerunSelectedStage,
    onUseInNewFlow,
    reviewingRunHistory,
    selectedStageId,
    setOutputSurfaceCommandState,
    showResultSurface,
  ])

  useEffect(() => {
    return subscribeOutputSurfaceCommands((commandId) => {
      if (commandId === "output.view_result" && showResultSurface) {
        activateResultSurface()
        return
      }
      if (commandId === "output.view_activity" && canInspectActivity) {
        focusStageSurface("nodes")
        return
      }
      if (commandId === "output.view_log" && canInspectLog) {
        focusStageSurface("log")
        return
      }
      if (commandId === "output.view_history" && canInspectHistory) {
        setActiveTab("history")
        return
      }
      if (commandId === "output.rerun_from_step" && selectedStageId && canRerunSelectedStage) {
        handleRerunFrom(selectedStageId)
        return
      }
      if (commandId === "output.use_in_new_flow" && onUseInNewFlow) {
        void Promise.resolve(onUseInNewFlow())
      }
    })
  }, [
    activateResultSurface,
    canInspectActivity,
    canInspectHistory,
    canInspectLog,
    canRerunSelectedStage,
    focusStageSurface,
    handleRerunFrom,
    onUseInNewFlow,
    selectedStageId,
    showResultSurface,
  ])

  useEffect(() => {
    return subscribeDesktopCommands((commandId) => {
      if (commandId === "flow.rerun_from_step" && selectedStageId && canRerunSelectedStage) {
        handleRerunFrom(selectedStageId)
      }
    })
  }, [canRerunSelectedStage, handleRerunFrom, selectedStageId])

  return (
    <>
      <Tabs
        value={activeTab}
        onValueChange={(next) => setActiveTab(next as OutputTabValue)}
        className={cn(
          "ui-fade-slide-in",
          fillHeight
            ? "flex min-h-0 flex-1 flex-col gap-2.5"
            : "space-y-2.5",
        )}
      >
        <OutputPanelHeader
          activeTab={activeTab}
          hasResult={hasResult}
          resultReadyPulse={resultReadyPulse}
          reviewingRunHistory={reviewingRunHistory}
          selectedRunLabel={selectedRunLabel}
          selectedReviewStatus={selectedReviewRun?.status || null}
          tabOptions={tabOptions}
        />
        {!reviewingRunHistory && !errorFigureOwnsSurface && surfaceNotice && !(showResultSurface && activeTab === "result") && (
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

        <TabsContent
          value="nodes"
          className={cn("mt-0 ui-fade-slide-in", fillHeight && "min-h-0 flex-1 overflow-y-auto")}
        >
          {savedRunLoadingNotice}
          {savedRunErrorNotice}
          {savedRunSnapshotNotice}
          {(!reviewingRunHistory || canInspectSavedRun) && (
            <div className={cn(activityOwnsSurface && "rounded-lg border border-hairline bg-surface-1 px-4 py-4")}>
              <ActivityTab
                showIdleState={showIdleState}
                selectedStagePresentation={selectedStagePresentation}
                selectedStageContextToneClass={selectedStageContextToneClass}
                selectedStageContextLabelClass={selectedStageContextLabelClass}
                selectedStageContextLabel={selectedStageContextLabel}
                selectedStageBranchLabel={selectedStageBranchLabel}
                selectedStageBranchDetail={selectedStageBranchDetail}
                selectedStageStatusLabel={selectedStageStatusLabel}
                onRerunFrom={handleRerunFrom}
                activitySummaryItems={activitySummaryItems}
                budgetWarning={budgetWarning}
                budgetWarningClassName={budgetWarningClassName}
                nodes={allDisplayNodes}
                nodeStates={displayNodeStates}
                activeNodeId={displayActiveNodeId}
                evalResults={displayEvalResults}
                canRerun={canRerunStages}
                onSelectNode={openNodeDetails}
                onViewStepLog={canInspectLog ? () => focusStageSurface("log") : null}
                runAttentionNotice={errorFigureOwnsSurface ? null : runAttentionBanner}
              />
            </div>
          )}
        </TabsContent>

        <TabsContent
          value="log"
          className={cn("mt-2 ui-fade-slide-in", fillHeight && "min-h-0 flex-1 overflow-y-auto")}
        >
          {showIdleState ? (
            <div className="px-1 py-2 text-body-sm text-muted-foreground">
              No log yet. Run this flow to see detailed execution logs here.
            </div>
          ) : (
            <div className="space-y-2">
              {canInspectActivity ? (
                <div className="border-b border-hairline px-1 pb-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-auto px-0 py-0 text-body-sm text-muted-foreground hover:text-foreground"
                    onClick={() => focusStageSurface("nodes")}
                  >
                    Back to activity
                  </Button>
                </div>
              ) : null}
              {savedRunLoadingNotice}
              {savedRunErrorNotice}
              {savedRunSnapshotNotice}
              {(!reviewingRunHistory || canInspectSavedRun) && (
                <>
              <SelectedStepSummaryPanel
                selectedStagePresentation={selectedStagePresentation}
                selectedStageContextLabelClass={selectedStageContextLabelClass}
                selectedStageContextLabel={selectedStageContextLabel}
                selectedStageBranchLabel={selectedStageBranchLabel}
                selectedStageBranchDetail={selectedStageBranchDetail}
                selectedStageStatusLabel={selectedStageStatusLabel}
              />
              <LogTab
                selectedNodeId={selectedStageId}
                nodeStates={displayNodeStates}
                evalResults={displayEvalResults}
                workflowNode={selectedWorkflowNode}
                runId={runId}
                evalOverrideNodeIds={evalOverrideNodeIds}
              />
                </>
              )}
            </div>
          )}
        </TabsContent>

        <TabsContent
          value="result"
          className={cn("mt-2 ui-fade-slide-in", fillHeight && "min-h-0 flex-1 overflow-y-auto")}
        >
          {showResultSurface ? (
            <ResultTab
              nodeStates={displayNodeStates}
              evalResults={displayEvalResults}
              runStatus={runStatus}
              runOutcome={effectiveRunOutcome}
              reviewingRunHistory={reviewingRunHistory}
              selectedReviewRun={selectedReviewRun}
              selectedResultPresentation={selectedResultPresentation}
              selectedResultBranchLabel={selectedResultBranchLabel}
              selectedStagePresentation={selectedStagePresentation}
              selectedStageIndex={selectedStageIndex}
              workflowStepCount={workflowStepCount}
              completedStageCount={completedStageCount}
              failedStageCount={failedStageCount}
              isDisplayedResultEmpty={isDisplayedResultEmpty}
              executionLoopSummary={executionLoopSummary}
              savedRunLoadingNotice={savedRunLoadingNotice}
              savedRunErrorNotice={savedRunErrorNotice}
              hasMultipleResultOptions={hasMultipleResultOptions}
              resultNodeOptions={resultNodeOptions}
              selectedResultNodeId={selectedResultNodeId}
              onSelectResultNode={setInspectedNodeId}
              showArtifactContinuation={showArtifactContinuation}
              artifactContinuationToneClass={artifactContinuationToneClass}
              artifactPersistenceStatus={artifactPersistenceStatus}
              artifactPersistenceError={artifactPersistenceError}
              artifactRecords={artifactRecords}
              nextStageRequiresApproval={nextStageRequiresApproval}
              nextStageAutoRuns={nextStageAutoRuns}
              nextStageLabel={nextStageLabel}
              nextStageDescription={nextStageDescription}
              nextStageOutput={nextStageTemplate?.output}
              nextStagePending={nextStagePending}
              onRunNextStage={onRunNextStage}
              visibleArtifactContinuation={visibleArtifactContinuation}
              hiddenArtifactContinuationCount={hiddenArtifactContinuationCount}
              visibleNextStageArtifacts={visibleNextStageArtifacts}
              hiddenNextStageArtifactCount={hiddenNextStageArtifactCount}
              primaryModifierLabel={desktopRuntime.primaryModifierLabel}
              displayedResultContent={displayedResultContent}
              canStartFreshRun={canStartFreshRun}
              onStartNewRun={onStartNewRun}
              canRerunSelectedStage={canRerunSelectedStage}
              onRerunSelectedStage={selectedStageId && canRerunSelectedStage ? () => handleRerunFrom(selectedStageId) : null}
              onViewActivity={canInspectActivity ? () => focusStageSurface("nodes") : null}
              onEditFlow={onEditFlow}
              failedNodeErrors={failedNodeErrors}
              canUseInNewFlow={Boolean(onUseInNewFlow) && !reviewingRunHistory}
              onUseInNewFlow={onUseInNewFlow}
              onOpenArtifact={handleOpenArtifact}
              onArtifactContextMenu={(event, artifact) => {
                setOutputContextMenu({
                  x: event.clientX,
                  y: event.clientY,
                  scope: "artifact",
                  artifact,
                })
              }}
              onContextMenu={(event) => {
                event.preventDefault()
                setOutputContextMenu({
                  x: event.clientX,
                  y: event.clientY,
                  scope: "result",
                })
              }}
            />
          ) : (
            <div className="px-1 py-2 text-body-sm text-muted-foreground">
              Step results will appear here as nodes complete.
            </div>
      )}
        </TabsContent>

        <TabsContent
          value="history"
          className={cn("mt-2 ui-fade-slide-in", fillHeight && "min-h-0 flex-1 overflow-y-auto")}
        >
          <div className="space-y-2">
            {showResultSurface ? (
              <div className="border-b border-hairline px-1 pb-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-auto px-0 py-0 text-body-sm text-muted-foreground hover:text-foreground"
                  onClick={activateResultSurface}
                >
                  Back to result
                </Button>
              </div>
            ) : canInspectActivity ? (
              <div className="border-b border-hairline px-1 pb-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-auto px-0 py-0 text-body-sm text-muted-foreground hover:text-foreground"
                  onClick={() => focusStageSurface("nodes")}
                >
                  Back to activity
                </Button>
              </div>
            ) : null}
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
          </div>
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
              disabled={!onUseInNewFlow}
              onSelect={() => {
                if (!onUseInNewFlow) return
                void Promise.resolve(onUseInNewFlow())
                setOutputContextMenu(null)
              }}
            >
              Continue with Agent
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={!canCopyResult}
              onSelect={() => {
                void handleCopyResult()
                setOutputContextMenu(null)
              }}
            >
              Copy as report
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
            {onOpenArtifacts && artifactRecords.length > 0 ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={() => {
                    onOpenArtifacts()
                    setOutputContextMenu(null)
                  }}
                >
                  Open in artifacts
                </DropdownMenuItem>
              </>
            ) : null}
          </>
        )}
        {outputContextMenu?.scope === "artifact" && (
          <>
            <DropdownMenuLabel>{outputContextMenu.artifact.title}</DropdownMenuLabel>
            <DropdownMenuItem
              onSelect={() => {
                void handleOpenArtifact(outputContextMenu.artifact)
                setOutputContextMenu(null)
              }}
            >
              Open file
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => {
                void handleCopyArtifactPath(outputContextMenu.artifact)
                setOutputContextMenu(null)
              }}
            >
              Copy path
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={!onOpenArtifacts}
              onSelect={() => {
                if (!onOpenArtifacts) return
                onOpenArtifacts()
                setOutputContextMenu(null)
              }}
            >
              Open in artifacts
            </DropdownMenuItem>
          </>
        )}
      </CursorMenu>
    </>
  )
}
