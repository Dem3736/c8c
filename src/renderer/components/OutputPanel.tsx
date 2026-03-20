import { useAtomValue } from "jotai"
import { useRef, useEffect, useState, useCallback } from "react"
import { Tabs, TabsContent } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenuItem,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu"
import { CursorMenu } from "@/components/ui/cursor-menu"
import { Button } from "@/components/ui/button"
import { desktopRuntimeAtom } from "@/lib/store"
import { useOutputPanel } from "@/hooks/useOutputPanel"
import { HistoryTab } from "@/components/output/HistoryTab"
import { ActivityTab } from "@/components/output/ActivityTab"
import { OutputPanelHeader } from "@/components/output/OutputPanelHeader"
import { ResultTab } from "@/components/output/ResultTab"
import { LogTab } from "@/components/output/OutputSections"
import { SelectedStepSummaryPanel } from "@/components/output/SelectedStepSummaryPanel"
import type { ArtifactRecord, LoadedRunResult, RunResult, WorkflowTemplate } from "@shared/types"
import { toast } from "sonner"
import {
  consumeShortcut,
  isEditableKeyboardTarget,
  isShortcutConsumed,
  matchesPrimaryShortcut,
} from "@/lib/keyboard-shortcuts"
import { ExecutionSurfaceNoticeBanner } from "@/components/ui/execution-surface-notice"
import { useOutputPanelDerivedState } from "@/components/output/useOutputPanelDerivedState"

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
  const {
    selectedReviewRun,
    rerunWorkspace,
    reviewingRunHistory,
    reviewSnapshot,
    openReviewTaskCount,
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
    isDisplayedResultEmpty,
    canCopyResult,
    hasMultipleResultOptions,
    showIdleState,
    selectedResultNodeId,
    selectedResultPresentation,
    selectedResultBranchLabel,
    selectedResultMetricsLabel,
    selectedStageId,
    selectedStagePresentation,
    selectedStageBranchLabel,
    selectedStageBranchDetail,
    selectedStageStatus,
    selectedStageStatusLabel,
    selectedStageHasOutput,
    selectedStageContextLabel,
    selectedStageContextToneClass,
    selectedStageContextLabelClass,
    activitySummaryItems,
    selectedRunLabel,
    canInspectSavedRun,
    showBlockedReviewStrip,
    canContinueBlockedReview,
    canStartFreshRun,
    canRerunStages,
    canRerunSelectedStage,
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
  } = useOutputPanelDerivedState({
    runStatus,
    runOutcome,
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

  const handleRerunFrom = useCallback((nodeId: string) => {
    if (!onRerunFrom || !rerunWorkspace) return
    void onRerunFrom(nodeId, { workspace: rerunWorkspace })
  }, [onRerunFrom, rerunWorkspace])

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
        description: "This saved run still has its final result, but the full step snapshot is unavailable.",
        actionLabel: "",
        actionTarget: "result",
      }}
    />
  ) : null
  const blockedReviewBanner = showBlockedReviewStrip ? (
    <ExecutionSurfaceNoticeBanner
      notice={{
        level: "warning",
        title: openReviewTaskCount > 0 ? "Review tasks open" : "Ready to continue",
        description: openReviewTaskCount > 0
          ? `${openReviewTaskCount} ${openReviewTaskCount === 1 ? "task" : "tasks"} still need a decision.`
          : "Checkpoint answered. Continue to finish this path.",
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
              Continue flow
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
          ? "Inspect the activity log for the failing step or the last interrupted step."
          : "One or more steps failed during the latest run.",
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
    const workflowName = workflow.name || "flow"
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
        <OutputPanelHeader
          activeTab={activeTab}
          hasResult={hasResult}
          pastRuns={pastRuns}
          runStatus={runStatus}
          selectedReviewRunId={selectedReviewRun?.runId || null}
          onSelectReviewRun={(nextRunId) => {
            const nextRun = pastRuns.find((run) => run.runId === nextRunId) || null
            setSelectedPastRun(nextRun)
            if (nextRun) setActiveTab("result")
          }}
          canStartFreshRun={canStartFreshRun}
          onStartNewRun={onStartNewRun}
          resultReadyPulse={resultReadyPulse}
        />
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
          {reviewingRunHistory && (
            <div className="mb-2 rounded-lg border border-hairline bg-surface-2/60 px-3 py-3">
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
            </div>
          )}
          {savedRunLoadingNotice}
          {savedRunErrorNotice}
          {savedRunSnapshotNotice}
          {(!reviewingRunHistory || canInspectSavedRun) && (
            <ActivityTab
              showIdleState={showIdleState}
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
              onRerunFrom={handleRerunFrom}
              showLoopStateIndicator={showLoopStateIndicator}
              executionLoopSummary={executionLoopSummary}
              approvalLoopSummary={approvalLoopSummary}
              activitySummaryItems={activitySummaryItems}
              budgetWarning={budgetWarning}
              budgetWarningClassName={budgetWarningClassName}
              nodes={allDisplayNodes}
              nodeStates={displayNodeStates}
              activeNodeId={displayActiveNodeId}
              evalResults={displayEvalResults}
              canRerun={canRerunStages}
              onSelectNode={openNodeDetails}
              runAttentionNotice={runAttentionBanner}
            />
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
                onRerunFrom={handleRerunFrom}
                showLoopStateIndicator={showLoopStateIndicator}
                executionLoopSummary={executionLoopSummary}
                approvalLoopSummary={approvalLoopSummary}
              />
              <LogTab selectedNodeId={selectedStageId} nodeStates={displayNodeStates} evalResults={displayEvalResults} />
                </>
              )}
            </div>
          )}
        </TabsContent>

        <TabsContent value="result" className="mt-2 ui-fade-slide-in">
          {hasResult ? (
            <ResultTab
              reviewingRunHistory={reviewingRunHistory}
              selectedReviewRun={selectedReviewRun}
              selectedResultPresentation={selectedResultPresentation}
              selectedResultBranchLabel={selectedResultBranchLabel}
              selectedResultMetricsLabel={selectedResultMetricsLabel}
              isDisplayedResultEmpty={isDisplayedResultEmpty}
              executionLoopSummary={executionLoopSummary}
              approvalLoopSummary={approvalLoopSummary}
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
              onOpenArtifacts={onOpenArtifacts}
              visibleArtifactContinuation={visibleArtifactContinuation}
              hiddenArtifactContinuationCount={hiddenArtifactContinuationCount}
              visibleNextStageArtifacts={visibleNextStageArtifacts}
              hiddenNextStageArtifactCount={hiddenNextStageArtifactCount}
              primaryModifierLabel={desktopRuntime.primaryModifierLabel}
              reportPath={reviewingRunHistory ? selectedReviewRun?.reportPath || null : reportPath}
              onOpenReport={handleOpenReport}
              displayedResultContent={displayedResultContent}
              canCopyResult={canCopyResult}
              onCopyError={(error) => {
                console.error("[OutputPanel] copy result failed:", error)
                toast.error("Could not copy result", {
                  description: String(error),
                })
              }}
              onExportResult={() => {
                void handleExportResult()
              }}
              canStartFreshRun={canStartFreshRun}
              onStartNewRun={onStartNewRun}
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
