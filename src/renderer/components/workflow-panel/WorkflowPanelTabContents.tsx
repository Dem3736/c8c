import type { ComponentProps, RefObject } from "react"
import { TabsContent } from "@/components/ui/tabs"
import { SectionErrorBoundary } from "@/components/ui/error-boundary"
import { ExecutionSurfaceNoticeBanner } from "@/components/ui/execution-surface-notice"
import { CanvasView } from "@/components/CanvasView"
import { NodeInspector } from "@/components/canvas/NodeInspector"
import { InputPanel } from "@/components/InputPanel"
import { OutputPanel } from "@/components/OutputPanel"
import { WorkflowSettingsPanel } from "@/components/WorkflowSettingsPanel"
import { ChainBuilder } from "@/components/ChainBuilder"
import {
  StageInputSection,
  WorkflowDraftSkeleton,
  WorkflowEntryLanding,
} from "@/components/workflow-panel/WorkflowPanelInlineSections"
import { cn } from "@/lib/cn"
import type { FlowRulePreview } from "@/lib/flow-rules"
import type { ArtifactContract, ArtifactRecord, PersistedRunSnapshot } from "@shared/types"
import type { WorkflowEntryState } from "@/lib/workflow-entry"
import type { ExecutionRunStatus, ExecutionSurfaceNotice } from "@/lib/workflow-execution"

interface WorkflowCanvasTabProps {
  surfaceNotice: ExecutionSurfaceNotice | null
  onSurfaceNoticeAction: () => void
  onDismissSurfaceNotice: () => void
  outputPanelProps: ComponentProps<typeof OutputPanel>
}

export function WorkflowCanvasTab({
  surfaceNotice,
  onSurfaceNoticeAction,
  onDismissSurfaceNotice,
  outputPanelProps,
}: WorkflowCanvasTabProps) {
  return (
    <TabsContent value="canvas" className="mt-0 flex-1 min-h-0 flex flex-col overflow-hidden ui-fade-slide-in">
      <div className="flex-1 min-h-0 flex overflow-hidden">
        <div className="flex-1 min-h-0 min-w-0 overflow-hidden">
          <SectionErrorBoundary sectionName="canvas view">
            <CanvasView
              surfaceBanner={surfaceNotice ? (
                <ExecutionSurfaceNoticeBanner
                  notice={surfaceNotice}
                  onAction={onSurfaceNoticeAction}
                  onDismiss={onDismissSurfaceNotice}
                  className="pointer-events-auto max-w-[560px] shadow-sm backdrop-blur"
                />
              ) : null}
            />
          </SectionErrorBoundary>
        </div>
        <NodeInspector />
      </div>
      <div className="ui-scroll-region border-t border-hairline overflow-y-auto h-[clamp(120px,30vh,320px)]">
        <div className="ui-content-shell py-6 space-y-6">
          <InputPanel />
          <SectionErrorBoundary sectionName="output panel">
            <OutputPanel {...outputPanelProps} />
          </SectionErrorBoundary>
        </div>
      </div>
    </TabsContent>
  )
}

interface WorkflowSettingsTabProps {
  surfaceNotice: ExecutionSurfaceNotice | null
  onSurfaceNoticeAction: () => void
  onDismissSurfaceNotice: () => void
}

export function WorkflowSettingsTab({
  surfaceNotice,
  onSurfaceNoticeAction,
  onDismissSurfaceNotice,
}: WorkflowSettingsTabProps) {
  return (
    <TabsContent value="settings" className="mt-0 ui-scroll-region flex-1 min-h-0 overflow-y-auto ui-fade-slide-in">
      <div className="ui-content-shell py-6 space-y-6">
        {surfaceNotice && (
          <ExecutionSurfaceNoticeBanner
            notice={surfaceNotice}
            onAction={onSurfaceNoticeAction}
            onDismiss={onDismissSurfaceNotice}
          />
        )}
        <WorkflowSettingsPanel />
      </div>
    </TabsContent>
  )
}

interface WorkflowListTabProps {
  listScrollRegionRef: RefObject<HTMLDivElement | null>
  listShellClass: string
  showCreateDraftSkeleton: boolean
  showEntryLanding: boolean
  activeEntryState: WorkflowEntryState | null
  workflowName: string
  readyToRun: boolean
  startApprovalRequired: boolean
  entryStageLabel: string | null
  entryFlowRules: FlowRulePreview[]
  entryNextStepLabel: string
  stageStartInputLabels: string[]
  onPrimaryEntryAction: () => void
  onRefine: () => void
  onToggleEntryEditor: () => void
  onAttachCapability: () => void
  showEntryEditor: boolean
  canShowAgentPanel: boolean
  onDismissEntry: () => void
  inputPanelRef: RefObject<HTMLDivElement | null>
  showProjectArtifactsPanel: boolean
  combinedArtifactRecords: ArtifactRecord[]
  projectArtifactsLoading: boolean
  projectArtifactsError: string | null
  requiredContracts?: ArtifactContract[]
  onOpenArtifact: (artifact: ArtifactRecord) => void
  showIdleInputPanel: boolean
  chainBuilderMode: ComponentProps<typeof ChainBuilder>["mode"]
  onFocusStageDetails: ComponentProps<typeof ChainBuilder>["onStageSelect"]
  reviewSnapshot: PersistedRunSnapshot | null
  showIdleReviewMode: boolean
  runStatus: ExecutionRunStatus
  outputPanelRef: RefObject<HTMLDivElement | null>
  outputPanelProps: ComponentProps<typeof OutputPanel>
}

export function WorkflowListTab({
  listScrollRegionRef,
  listShellClass,
  showCreateDraftSkeleton,
  showEntryLanding,
  activeEntryState,
  workflowName,
  readyToRun,
  startApprovalRequired,
  entryStageLabel,
  entryFlowRules,
  entryNextStepLabel,
  stageStartInputLabels,
  onPrimaryEntryAction,
  onRefine,
  onToggleEntryEditor,
  onAttachCapability,
  showEntryEditor,
  canShowAgentPanel,
  onDismissEntry,
  inputPanelRef,
  showProjectArtifactsPanel,
  combinedArtifactRecords,
  projectArtifactsLoading,
  projectArtifactsError,
  requiredContracts,
  onOpenArtifact,
  showIdleInputPanel,
  chainBuilderMode,
  onFocusStageDetails,
  reviewSnapshot,
  showIdleReviewMode,
  runStatus,
  outputPanelRef,
  outputPanelProps,
}: WorkflowListTabProps) {
  return (
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
                  displayTitle={activeEntryState.title || workflowName}
                  readyToRun={readyToRun}
                  startApprovalRequired={startApprovalRequired}
                  stageLabel={entryStageLabel}
                  flowRules={entryFlowRules}
                  nextStepLabel={entryNextStepLabel}
                  inputLabels={stageStartInputLabels}
                  onPrimaryAction={onPrimaryEntryAction}
                  primaryActionLabel={readyToRun ? "Run" : "Add input"}
                  onRefine={onRefine}
                  onToggleEditor={onToggleEntryEditor}
                  onAttachCapability={onAttachCapability}
                  showEditor={showEntryEditor}
                  canRefine={canShowAgentPanel}
                  onDismiss={onDismissEntry}
                />
                <StageInputSection
                  inputPanelRef={inputPanelRef}
                  showTemplateContext={false}
                  showProjectArtifactsPanel={showProjectArtifactsPanel}
                  artifacts={combinedArtifactRecords}
                  loading={projectArtifactsLoading}
                  error={projectArtifactsError}
                  requiredContracts={requiredContracts}
                  onOpenArtifact={onOpenArtifact}
                />
              </>
            )}
            {showIdleInputPanel && (
              <StageInputSection
                inputPanelRef={inputPanelRef}
                showProjectArtifactsPanel={showProjectArtifactsPanel}
                artifacts={combinedArtifactRecords}
                loading={projectArtifactsLoading}
                error={projectArtifactsError}
                requiredContracts={requiredContracts}
                onOpenArtifact={onOpenArtifact}
              />
            )}
            {(!showEntryLanding || showEntryEditor) && (
              <SectionErrorBoundary sectionName="flow editor">
                <ChainBuilder
                  compact
                  mode={chainBuilderMode}
                  onStageSelect={onFocusStageDetails}
                  reviewSnapshot={reviewSnapshot}
                />
              </SectionErrorBoundary>
            )}
            {showIdleReviewMode && (
              <div
                ref={outputPanelRef}
                id="run-output-panel"
                className="scroll-mt-4 flex min-h-0 flex-1 flex-col space-y-3"
              >
                <SectionErrorBoundary sectionName="output panel">
                  <OutputPanel {...outputPanelProps} reviewingPastRun fillHeight />
                </SectionErrorBoundary>
              </div>
            )}
            {(!showEntryLanding || runStatus !== "idle") && !showIdleReviewMode && (
              <div
                ref={outputPanelRef}
                id="run-output-panel"
                className={cn("scroll-mt-4", "flex min-h-0 flex-1 flex-col")}
              >
                <SectionErrorBoundary sectionName="output panel">
                  <OutputPanel {...outputPanelProps} fillHeight />
                </SectionErrorBoundary>
              </div>
            )}
          </>
        )}
      </div>
    </TabsContent>
  )
}
