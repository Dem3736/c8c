import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react"
import { useAtom } from "jotai"
import { cn } from "@/lib/cn"
import { useWorkflowWithUndo } from "@/hooks/useWorkflowWithUndo"
import {
  chatStatusAtom,
  selectedProjectAtom,
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
import { useExecutionReset } from "@/hooks/useExecutionReset"
import { useWorkflowValidation } from "@/hooks/useWorkflowValidation"
import { useUndoRedo } from "@/hooks/useUndoRedo"
import { useChainExecution } from "@/hooks/useChainExecution"
import { useSelectedRunReview } from "@/hooks/useSelectedRunReview"
import { prepareTemplateStageLaunch } from "@/lib/factory-launch"
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { toast } from "sonner"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { SectionErrorBoundary } from "@/components/ui/error-boundary"
import type { WorkflowEntryState, WorkflowTemplateRunContext } from "@/lib/workflow-entry"
import {
  areTemplateContractsSatisfied,
  buildContinuationArtifactPool,
  deriveTemplateDisplayLabel,
  deriveTemplateContextJourneyStageLabel,
  formatArtifactContractLabel,
  selectArtifactsForTemplateContracts,
} from "@/lib/workflow-entry"
import {
  contextAutoRunsOnContinue,
  contextRequiresStartApproval,
} from "@/lib/stage-run-policy"
import { toWorkflowExecutionKey } from "@/lib/workflow-execution"
import type { ArtifactContract, ArtifactRecord, InputAttachment, PermissionMode, Workflow, WorkflowTemplate } from "@shared/types"
import { buildRunProgressSummary, formatElapsedTime, type RunProgressSummary } from "@/lib/run-progress"
import { ExecutionSurfaceNoticeBanner } from "@/components/ui/execution-surface-notice"
import { DisclosurePanel } from "@/components/ui/disclosure-panel"
import { consumeShortcut, isShortcutConsumed } from "@/lib/keyboard-shortcuts"

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
            Preparing the first process draft
          </div>
          <p className="mt-2 text-body-sm text-muted-foreground">
            The agent is turning your prompt into a runnable process. This view will populate as soon as the draft is ready.
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

function collapseInlineText(value: string | null | undefined) {
  return (value || "").trim().replace(/\s+/g, " ")
}

function takeLeadingSentence(value: string | null | undefined, fallback: string) {
  const clean = collapseInlineText(value)
  if (!clean) return fallback
  const match = clean.match(/^.*?[.!?](?=\s|$)/)
  return match ? match[0] : clean
}

function deriveEntryPolicySummary(workflow: Workflow, templateContext: WorkflowTemplateRunContext | null) {
  const explicitSummary = takeLeadingSentence(templateContext?.executionPolicy?.summary, "")
  if (explicitSummary) return explicitSummary

  const approvalCount = workflow.nodes.filter((node) => node.type === "approval").length
  if (approvalCount > 0) {
    return approvalCount === 1
      ? "Stops for one approval gate."
      : `Stops for ${approvalCount} approval gates.`
  }

  return "Runs to the next decision."
}

function deriveEntryNextStepLabel({
  readyToRun,
  nextStageTemplate,
}: {
  readyToRun: boolean
  nextStageTemplate: WorkflowTemplate | null
}) {
  if (!readyToRun) return "Add stage input."
  if (nextStageTemplate) return `Continue with ${deriveTemplateDisplayLabel(nextStageTemplate) || nextStageTemplate.name}.`
  return "Review the result."
}

function formatInputAttachmentLabel(attachment: InputAttachment) {
  if (attachment.kind === "file") return attachment.name
  if (attachment.kind === "run") return attachment.workflowName
  return attachment.label
}

function WorkflowEntryLanding({
  entry,
  displayTitle,
  readyToRun,
  startApprovalRequired,
  stageLabel,
  policySummary,
  nextStepLabel,
  inputLabels,
  onPrimaryAction,
  primaryActionLabel,
  onRefine,
  onToggleEditor,
  showEditor,
  canRefine,
  onDismiss,
}: {
  entry: WorkflowEntryState
  displayTitle: string
  readyToRun: boolean
  startApprovalRequired: boolean
  stageLabel?: string | null
  policySummary: string
  nextStepLabel: string
  inputLabels: string[]
  onPrimaryAction: () => void
  primaryActionLabel: string
  onRefine: () => void
  onToggleEditor: () => void
  showEditor: boolean
  canRefine: boolean
  onDismiss: () => void
}) {
  return (
    <section className="rounded-xl surface-panel p-4 ui-fade-slide-in">
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-hairline bg-surface-2 text-foreground ui-elevation-inset">
          <Sparkles size={18} aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {stageLabel && (
              <Badge variant="outline" className="ui-meta-text px-2 py-0">
                {stageLabel}
              </Badge>
            )}
            <Badge variant={readyToRun ? "success" : "secondary"} className="ui-meta-text px-2 py-0">
              {readyToRun ? "Ready" : "Needs input"}
            </Badge>
            {startApprovalRequired && (
              <Badge variant="warning" className="ui-meta-text px-2 py-0">
                Approval before run
              </Badge>
            )}
            <Badge variant="outline" className="ui-meta-text px-2 py-0">
              {policySummary}
            </Badge>
            <span className="ui-meta-text text-muted-foreground">{entry.readinessText}</span>
          </div>
          <h2 className="text-title-md text-foreground">{displayTitle}</h2>
          {entry.routing && (
            <DisclosurePanel
              summary="Why this start?"
              className="max-w-full"
              summaryClassName="px-0 py-0 text-muted-foreground"
              contentClassName="space-y-2 px-0 pb-0 pt-2 border-0"
            >
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="ui-meta-text px-2 py-0">
                  Chosen after submit
                </Badge>
                <Badge variant="outline" className="ui-meta-text px-2 py-0">
                  {entry.routing.source === "agent" ? "Agent route" : "Fallback route"}
                </Badge>
              </div>
              {entry.routing.reason ? (
                <p className="ui-meta-text text-muted-foreground">{entry.routing.reason}</p>
              ) : null}
            </DisclosurePanel>
          )}
          <div className="grid gap-1.5 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-lg border border-hairline bg-surface-2/70 px-3 py-2.5">
              <p className="ui-meta-label text-muted-foreground">{entry.contractLabel}</p>
              <p className="mt-1 line-clamp-2 text-body-sm text-foreground">{entry.contractText}</p>
            </div>
            <div className="rounded-lg border border-hairline bg-surface-2/70 px-3 py-2.5">
              <p className="ui-meta-label text-muted-foreground">Need</p>
              <p className="mt-1 line-clamp-2 text-body-sm text-foreground">{entry.inputText}</p>
              {inputLabels.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {inputLabels.slice(0, 4).map((label) => (
                    <Badge key={label} variant="outline" className="ui-meta-text px-2 py-0">
                      {label}
                    </Badge>
                  ))}
                  {inputLabels.length > 4 && (
                    <Badge variant="outline" className="ui-meta-text px-2 py-0">
                      +{inputLabels.length - 4} more
                    </Badge>
                  )}
                </div>
              )}
            </div>
            <div className="rounded-lg border border-hairline bg-surface-2/70 px-3 py-2.5">
              <p className="ui-meta-label text-muted-foreground">Result</p>
              <p className="mt-1 line-clamp-2 text-body-sm text-foreground">{entry.outputText}</p>
            </div>
            <div className="rounded-lg border border-hairline bg-surface-2/70 px-3 py-2.5">
              <p className="ui-meta-label text-muted-foreground">Next</p>
              <p className="mt-1 line-clamp-2 text-body-sm text-foreground">
                {startApprovalRequired
                  ? "Review the gate, then run this stage."
                  : nextStepLabel}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={onPrimaryAction}>
              <Play size={14} />
              {primaryActionLabel}
            </Button>
            {canRefine && (
              <Button variant="outline" size="sm" onClick={onRefine}>
                <MessageSquare size={14} />
                Refine
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={onToggleEditor}>
              <PencilLine size={14} />
              {showEditor ? "Hide editor" : "Edit"}
            </Button>
            <Button variant="ghost" size="sm" onClick={onDismiss}>
              Dismiss
            </Button>
          </div>
        </div>
      </div>
    </section>
  )
}

function StageStartApprovalDialog({
  open,
  title,
  stageLabel,
  policySummary,
  expectedArtifact,
  inputLabels,
  notes,
  shortcutLabel,
  primaryModifierKey,
  onApprove,
  onCancel,
}: {
  open: boolean
  title: string
  stageLabel?: string | null
  policySummary: string
  expectedArtifact: string
  inputLabels: string[]
  notes: string[]
  shortcutLabel: string
  primaryModifierKey: "meta" | "ctrl"
  onApprove: () => Promise<void> | void
  onCancel: () => void
}) {
  useEffect(() => {
    if (!open) return

    const handler = (event: KeyboardEvent) => {
      if (event.defaultPrevented || isShortcutConsumed(event)) return

      const usesPrimaryModifier = primaryModifierKey === "meta"
        ? event.metaKey
        : event.ctrlKey
      if (!usesPrimaryModifier || event.key !== "Enter") return
      consumeShortcut(event)
      void Promise.resolve(onApprove())
    }

    window.addEventListener("keydown", handler, true)
    return () => {
      window.removeEventListener("keydown", handler, true)
    }
  }, [onApprove, open, primaryModifierKey])

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen) onCancel() }}>
      <DialogContent className="max-w-xl" showCloseButton={false} aria-describedby="stage-start-approval-description">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            Approval before run
            <Badge variant="outline" size="compact">{shortcutLabel}</Badge>
          </DialogTitle>
          <DialogDescription id="stage-start-approval-description">
            Review this stage before execution begins.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <ExecutionSurfaceNoticeBanner
            notice={{
              level: "warning",
              title: "Human gate required",
              description: policySummary,
              actionLabel: "",
              actionTarget: "result",
            }}
            children={(
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  {stageLabel && (
                    <Badge variant="outline" className="ui-meta-text px-2 py-0">
                      {stageLabel}
                    </Badge>
                  )}
                </div>
                <p className="text-body-sm font-medium text-foreground">{title}</p>
              </div>
            )}
          />

          <div className="grid gap-2 md:grid-cols-2">
            <div className="rounded-lg border border-hairline bg-surface-2/70 px-3 py-2.5">
              <p className="ui-meta-label text-muted-foreground">Stage result</p>
              <p className="mt-1 text-body-sm text-foreground">{expectedArtifact}</p>
            </div>
            <div className="rounded-lg border border-hairline bg-surface-2/70 px-3 py-2.5">
              <p className="ui-meta-label text-muted-foreground">Stage input</p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {inputLabels.length > 0 ? inputLabels.map((label) => (
                  <Badge key={label} variant="outline" className="ui-meta-text px-2 py-0">
                    {label}
                  </Badge>
                )) : (
                  <span className="ui-meta-text text-muted-foreground">Review the current stage input.</span>
                )}
              </div>
            </div>
          </div>

          {notes.length > 0 && (
            <DisclosurePanel summary="Policy notes">
              <div className="space-y-2">
                {notes.map((note, index) => (
                  <p key={`${note}-${index}`} className="text-body-sm text-foreground">{note}</p>
                ))}
              </div>
            </DisclosurePanel>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button size="sm" onClick={() => { void Promise.resolve(onApprove()) }}>
            <Play size={14} />
            Run
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
    ? "ui-status-badge-success"
    : summary.tone === "warning"
      ? "ui-status-badge-warning"
      : summary.tone === "danger"
        ? "ui-status-badge-danger"
        : "ui-status-badge-info"

  const progressLabel = summary.totalSteps > 0
    ? `${Math.min(summary.completedSteps, summary.totalSteps)}/${summary.totalSteps} complete`
    : null
  const resultButtonLabel = hasResult
    ? summary.phaseLabel === "Completed"
      ? "View result"
      : "Open result"
    : "View activity"

  return (
    <div className="border-b border-hairline bg-surface-1/90">
      <div className="flex w-full flex-wrap items-center gap-2 px-[var(--content-gutter)] py-2">
        <div className="min-w-0 flex flex-1 flex-wrap items-center gap-x-2 gap-y-1.5">
          <span className={cn("ui-status-badge ui-meta-text", toneClass)}>
            {summary.phaseLabel}
          </span>
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

function ProjectArtifactsPanel({
  artifacts,
  loading,
  error,
  requiredContracts,
  onOpenArtifact,
}: {
  artifacts: ArtifactRecord[]
  loading: boolean
  error: string | null
  requiredContracts?: ArtifactContract[]
  onOpenArtifact: (artifact: ArtifactRecord) => void
}) {
  const latestArtifacts = artifacts.slice(0, 4)
  const availableKinds = new Set(artifacts.map((artifact) => artifact.kind))
  const requiredLabels = (requiredContracts || []).map((contract) => ({
    label: formatArtifactContractLabel(contract),
    satisfied: availableKinds.has(contract.kind),
    optional: contract.required === false,
  }))
  const shouldRender = loading || Boolean(error) || latestArtifacts.length > 0 || requiredLabels.length > 0

  if (!shouldRender) {
    return null
  }

  return (
    <section className="rounded-lg border border-hairline bg-surface-1/70 px-4 py-3 ui-fade-slide-in">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="section-kicker">Artifacts</div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="outline" className="ui-meta-text px-2 py-0">
            {artifacts.length} saved
          </Badge>
          {requiredLabels.length > 0 && (
            <Badge variant="outline" className="ui-meta-text px-2 py-0">
              {requiredLabels.length} reusable
            </Badge>
          )}
        </div>
      </div>

      {requiredLabels.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {requiredLabels.map((item) => (
            <Badge
              key={`${item.label}-${item.optional ? "optional" : "required"}`}
              variant={item.satisfied ? "success" : "outline"}
              className="ui-meta-text px-2 py-0"
            >
              {item.label}{item.optional ? " (optional)" : ""}
            </Badge>
          ))}
        </div>
      )}

      <div className="mt-3">
        {loading ? (
          <div className="ui-meta-text text-muted-foreground">Loading artifacts...</div>
        ) : error ? (
          <div role="alert" className="ui-meta-text text-status-danger">{error}</div>
        ) : latestArtifacts.length === 0 ? (
          <div className="ui-meta-text text-muted-foreground">No saved artifacts yet.</div>
        ) : (
          <div className="space-y-1.5">
            {latestArtifacts.map((artifact) => (
              <div
                key={artifact.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-hairline bg-surface-2/60 px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="text-body-sm font-medium text-foreground">{artifact.title}</div>
                  <div className="ui-meta-text text-muted-foreground">
                    {formatArtifactContractLabel(artifact.kind)}
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2"
                  onClick={() => onOpenArtifact(artifact)}
                >
                  Open
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

function StageInputSection({
  inputPanelRef,
  showTemplateContext = true,
  showProjectArtifactsPanel,
  artifacts,
  loading,
  error,
  requiredContracts,
  onOpenArtifact,
}: {
  inputPanelRef: RefObject<HTMLDivElement | null>
  showTemplateContext?: boolean
  showProjectArtifactsPanel: boolean
  artifacts: ArtifactRecord[]
  loading: boolean
  error: string | null
  requiredContracts?: ArtifactContract[]
  onOpenArtifact: (artifact: ArtifactRecord) => void
}) {
  return (
    <>
      <div ref={inputPanelRef}>
        <InputPanel label="Stage input" compact showTemplateContext={showTemplateContext} />
      </div>
      {showProjectArtifactsPanel && (
        <ProjectArtifactsPanel
          artifacts={artifacts}
          loading={loading}
          error={error}
          requiredContracts={requiredContracts}
          onOpenArtifact={onOpenArtifact}
        />
      )}
    </>
  )
}

export function WorkflowPanel() {
  const [selectedProject] = useAtom(selectedProjectAtom)
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
  const [projectArtifacts, setProjectArtifacts] = useState<ArtifactRecord[]>([])
  const [projectArtifactsLoading, setProjectArtifactsLoading] = useState(false)
  const [projectArtifactsError, setProjectArtifactsError] = useState<string | null>(null)
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
  const { run, cancel, rerunFrom, continueRun } = useChainExecution()
  const listScrollRegionRef = useRef<HTMLDivElement | null>(null)
  const outputPanelRef = useRef<HTMLDivElement | null>(null)
  const chatPanelShellRef = useRef<HTMLDivElement | null>(null)
  const chatPanelToggleRef = useRef<HTMLButtonElement | null>(null)
  const inputPanelRef = useRef<HTMLDivElement | null>(null)
  const [showEntryEditor, setShowEntryEditor] = useState(false)
  const [prepareNewRun, setPrepareNewRun] = useState(false)
  const [packTemplates, setPackTemplates] = useState<WorkflowTemplate[]>([])
  const [launchingNextStage, setLaunchingNextStage] = useState(false)
  const [elapsed, setElapsed] = useState("")
  const [outputTabRequest, setOutputTabRequest] = useState<{ tab: "nodes" | "log" | "result" | "history"; nodeId?: string; nonce: number } | null>(null)
  const [flowSurfaceMode, setFlowSurfaceMode] = useAtom(flowSurfaceModeAtom)
  const [desktopRuntime] = useAtom(desktopRuntimeAtom)
  const previousRunStatusRef = useRef(runStatus)
  const completionSurfaceRef = useRef<string | null>(null)
  const pendingListAutoScrollRef = useRef(false)
  const resetExecution = useExecutionReset({ preserveCompletedWork: true })
  const [stageStartGateOpen, setStageStartGateOpen] = useState(false)
  const [pendingRunMode, setPendingRunMode] = useState<PermissionMode>("edit")
  const [pendingAutoRunPath, setPendingAutoRunPath] = useState<string | null>(null)

  useWorkflowReset()
  useWorkflowValidation()
  useUndoRedo()

  useEffect(() => {
    const previousRunStatus = previousRunStatusRef.current
    if (runStatus === "running" && previousRunStatus !== "running") {
      pendingListAutoScrollRef.current = true
    }
    if (runStatus !== "running") {
      pendingListAutoScrollRef.current = false
    }
    previousRunStatusRef.current = runStatus
  }, [runStatus])

  const clearWorkflowOpenState = useCallback(() => {
    setWorkflowOpenState({
      status: "idle",
      targetPath: null,
      message: null,
    })
  }, [setWorkflowOpenState])

  const workflowTitleFromPath = useCallback((path: string | null) => {
    if (!path) return "process"
    return path.split(/[\\/]/).pop()?.replace(/\.(chain|yaml|yml)$/i, "") || "process"
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
    setPrepareNewRun(false)
  }, [selectedWorkflowPath])

  useEffect(() => {
    if (runStatus !== "idle" && workflowEntryState) {
      setWorkflowEntryState(null)
    }
  }, [runStatus, setWorkflowEntryState, workflowEntryState])

  useEffect(() => {
    if (!selectedProject) {
      setProjectArtifacts([])
      setProjectArtifactsLoading(false)
      setProjectArtifactsError(null)
      return
    }

    let cancelled = false
    setProjectArtifactsLoading(true)
    setProjectArtifactsError(null)

    void window.api.listProjectArtifacts(selectedProject).then((artifacts) => {
      if (cancelled) return
      setProjectArtifacts(artifacts)
    }).catch((error) => {
      if (cancelled) return
      setProjectArtifacts([])
      setProjectArtifactsError(error instanceof Error ? error.message : String(error))
    }).finally(() => {
      if (!cancelled) {
        setProjectArtifactsLoading(false)
      }
    })

    return () => {
      cancelled = true
    }
  }, [selectedProject, artifactRecords])

  useEffect(() => {
    if (!selectedWorkflowTemplateContext?.pack?.recommendedNext?.length) {
      setPackTemplates([])
      return
    }

    let cancelled = false
    void window.api.listTemplates().then((templates) => {
      if (cancelled) return
      setPackTemplates(templates)
    }).catch((error) => {
      if (cancelled) return
      console.error("[WorkflowPanel] failed to load pack templates:", error)
      setPackTemplates([])
    })

    return () => {
      cancelled = true
    }
  }, [selectedWorkflowTemplateContext])

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
  const combinedArtifactRecords = useMemo(() => {
    const byId = new Map<string, ArtifactRecord>()
    for (const artifact of projectArtifacts) {
      byId.set(artifact.id, artifact)
    }
    for (const artifact of artifactRecords) {
      byId.set(artifact.id, artifact)
    }
    return Array.from(byId.values()).sort((left, right) => right.updatedAt - left.updatedAt)
  }, [artifactRecords, projectArtifacts])
  const continuationArtifactRecords = useMemo(
    () => buildContinuationArtifactPool({
      currentArtifacts: artifactRecords,
      projectArtifacts,
      context: selectedWorkflowTemplateContext,
    }),
    [artifactRecords, projectArtifacts, selectedWorkflowTemplateContext],
  )
  const nextStageSelection = useMemo(() => {
    const recommendedNext = selectedWorkflowTemplateContext?.pack?.recommendedNext || []
    if (recommendedNext.length === 0 || packTemplates.length === 0) {
      return { template: null, artifacts: [] as ArtifactRecord[] }
    }

    const orderedCandidates = recommendedNext
      .map((templateId) => packTemplates.find((template) => template.id === templateId) || null)
      .filter((template): template is WorkflowTemplate => template !== null)

    const preferredTemplate = orderedCandidates.find((template) =>
      areTemplateContractsSatisfied(template.contractIn, continuationArtifactRecords),
    ) || null
    if (preferredTemplate) {
      return {
        template: preferredTemplate,
        artifacts: selectArtifactsForTemplateContracts(preferredTemplate.contractIn, continuationArtifactRecords),
      }
    }

    return { template: null, artifacts: [] as ArtifactRecord[] }
  }, [continuationArtifactRecords, packTemplates, selectedWorkflowTemplateContext])
  const nextStageTemplate = nextStageSelection.template
  const nextStageArtifacts = nextStageSelection.artifacts
  const entryStageLabel = useMemo(
    () => deriveTemplateContextJourneyStageLabel(selectedWorkflowTemplateContext),
    [selectedWorkflowTemplateContext],
  )
  const entryPolicySummary = useMemo(
    () => deriveEntryPolicySummary(workflow, selectedWorkflowTemplateContext),
    [selectedWorkflowTemplateContext, workflow],
  )
  const startApprovalRequired = useMemo(
    () => runStatus === "idle" && contextRequiresStartApproval(selectedWorkflowTemplateContext),
    [runStatus, selectedWorkflowTemplateContext],
  )
  const entryNextStepLabel = useMemo(
    () => deriveEntryNextStepLabel({ readyToRun, nextStageTemplate }),
    [nextStageTemplate, readyToRun],
  )
  const stageStartInputLabels = useMemo(() => {
    if (inputAttachments.length > 0) {
      return inputAttachments.map(formatInputAttachmentLabel)
    }
    return (selectedWorkflowTemplateContext?.contractIn || []).map((contract) => formatArtifactContractLabel(contract))
  }, [inputAttachments, selectedWorkflowTemplateContext])
  const stageStartPolicyNotes = useMemo(
    () => (selectedWorkflowTemplateContext?.executionPolicy?.notes || []).slice(0, 3),
    [selectedWorkflowTemplateContext],
  )
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
    runStatus === "idle"
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
  const showProjectArtifactsPanel = (
    Boolean(selectedProject)
    && (
      projectArtifactsLoading
      || Boolean(projectArtifactsError)
      || combinedArtifactRecords.length > 0
      || (selectedWorkflowTemplateContext?.contractIn?.length ?? 0) > 0
    )
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
    ? "w-full px-[var(--content-gutter)] py-4 space-y-3"
    : "ui-content-shell py-3 space-y-3"
  const reviewFlowHasSnapshot = showIdleReviewMode && !!reviewedRunDetails?.snapshot

  const requestOutputTab = useCallback((tab: "nodes" | "log" | "result" | "history", nodeId?: string) => {
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
  }, [setViewMode])

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

  const handleOpenArtifact = async (artifact: ArtifactRecord) => {
    const openError = await window.api.openPath(artifact.contentPath)
    if (!openError) return
    toast.error("Could not open artifact", {
      description: openError,
    })
  }

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
          ? `Opened gated stage: ${deriveTemplateDisplayLabel(nextStageTemplate) || nextStageTemplate.name}`
          : `Continuing with ${deriveTemplateDisplayLabel(nextStageTemplate) || nextStageTemplate.name}`,
      )
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          if (nextStageNeedsApproval) {
            focusInputPanel()
          }
        })
      })
    } catch (error) {
      toast.error("Could not open the next stage", {
        description: String(error),
      })
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
    if (runStatus !== "idle") {
      resetExecution()
      setOutputTabRequest(null)
    }
    setPrepareNewRun(true)
    setViewMode("list")
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => focusInputPanel())
    })
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
    if (runStatus === "idle" && !showIdleReviewMode) return
    requestOutputTab(preferredTab, nodeId)
  }

  const isFlowEditing = showEntryLanding ? showEntryEditor : flowSurfaceMode === "edit"
  const chainBuilderMode = runStatus !== "idle"
    ? "monitor"
    : reviewFlowHasSnapshot
      ? "monitor"
      : isFlowEditing
        ? "edit"
        : "outline"

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
        title="Pick a process"
        description="Choose an existing process or start a new one from the sidebar"
      >
        <Button variant="outline" size="sm" onClick={() => setMainView("templates")}>
          <LayoutTemplate size={14} />
          Open a starting point
        </Button>
      </EmptyState>
    )
  }

  return (
    <div className="flex-1 min-h-0 flex overflow-hidden">
      {/* Main workflow editor area */}
      <div role="region" aria-label="Process workspace" className="flex-1 min-h-0 flex flex-col overflow-hidden min-w-0">
        <Toolbar onRun={handleRunRequest} onCancel={cancel} agentToggleRef={chatPanelToggleRef} />

        {workflowOpenState.status === "loading" ? (
          <div className="flex-1 min-h-0 flex items-center justify-center px-[var(--content-gutter)]">
            <div className="w-full max-w-xl rounded-xl surface-panel p-6 ui-fade-slide-in">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-hairline bg-surface-2 text-status-info ui-elevation-inset">
                  <Loader2 size={18} className="animate-spin" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <div className="text-title-sm text-foreground">
                    Opening {workflowTitleFromPath(workflowOpenState.targetPath)}
                  </div>
                  <p className="mt-1 text-body-sm text-muted-foreground">
                    Loading the process and restoring its stage state.
                  </p>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <>
            {workflowOpenState.status === "error" && (
              <div className="surface-danger-soft px-[var(--content-gutter)] py-2.5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="ui-meta-label text-status-danger">Could not open process</div>
                    <p className="mt-1 text-body-sm text-status-danger">
                      Failed to open {workflowTitleFromPath(workflowOpenState.targetPath)}. The previous process remains open.
                    </p>
                    {workflowOpenState.message && (
                      <p className="mt-1 ui-meta-text text-status-danger/90">
                        {workflowOpenState.message}
                      </p>
                    )}
                  </div>
                  <Button variant="ghost" size="sm" onClick={clearWorkflowOpenState}>
                    Dismiss
                  </Button>
                </div>
              </div>
            )}

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
                  {showEntryLanding && !showEntryEditor ? <Sparkles size={13} /> : <PencilLine size={13} />}
                </span>
                {runStatus === "idle" && !(showEntryLanding && !showEntryEditor) ? (
                  <>
                    <Label htmlFor="workflow-name" className="sr-only">Process name</Label>
                    <Input
                      id="workflow-name"
                      type="text"
                      value={workflow.name || ""}
                      onChange={(e) =>
                        setWorkflow((prev) => ({ ...prev, name: e.target.value }), { coalesceKey: "workflow-name" })
                      }
                      placeholder="Process name"
                      className="h-auto min-w-0 flex-1 border-none bg-transparent px-0 py-0 text-title-md font-semibold shadow-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/20"
                    />
                  </>
                ) : (
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-title-md font-semibold text-foreground">
                      {workflow.name || activeEntryState?.title || "Untitled process"}
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
                {showEntryLanding && !showEntryEditor ? (
                  <Badge variant="outline" className="ui-meta-text shrink-0 px-2.5 py-1">
                    Stage shell
                  </Badge>
                ) : (
                  <TabsList className="h-control-md shrink-0" aria-label="View mode">
                    <TabsTrigger value="list" className="px-3 py-1">
                      <List size={13} aria-hidden="true" className="mr-1.5" />
                      Process
                    </TabsTrigger>
                    <TabsTrigger value="canvas" className="px-3 py-1">
                      <LayoutGrid size={13} aria-hidden="true" className="mr-1.5" />
                      Graph
                    </TabsTrigger>
                    <TabsTrigger value="settings" className="px-3 py-1">
                      <SlidersHorizontal size={13} aria-hidden="true" className="mr-1.5" />
                      Defaults
                    </TabsTrigger>
                  </TabsList>
                )}
                {viewMode === "list" && runStatus === "idle" && !showEntryLanding && (
                  <Button
                    variant={flowSurfaceMode === "edit" ? "secondary" : "ghost"}
                    size="sm"
                    className="h-control-md shrink-0"
                    onClick={() => setFlowSurfaceMode((prev) => (prev === "edit" ? "outline" : "edit"))}
                  >
                    <PencilLine size={13} />
                    {flowSurfaceMode === "edit" ? "View process" : "Edit process"}
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
                  <CanvasView
                    surfaceBanner={surfaceNotice ? (
                      <ExecutionSurfaceNoticeBanner
                        notice={surfaceNotice}
                        onAction={handleSurfaceNoticeAction}
                        onDismiss={() => setSurfaceNotice(null)}
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
                  <OutputPanel
                    onRerunFrom={rerunFrom}
                    onContinueRun={continueRun}
                    requestedTab={outputTabRequest}
                    reviewingPastRun={showIdleReviewMode}
                    reviewedRun={reviewedRun}
                    reviewedRunDetails={reviewedRunDetails}
                    reviewedRunLoading={reviewedRunLoading}
                    reviewedRunError={reviewedRunError}
                    onStartNewRun={handleStartNewRun}
                    onOpenInbox={() => setMainView("inbox")}
                    onOpenArtifacts={() => setMainView("artifacts")}
                    nextStageTemplate={nextStageTemplate}
                    nextStageArtifacts={nextStageArtifacts}
                    onRunNextStage={selectedProject && nextStageTemplate ? handleRunNextStage : null}
                    nextStagePending={launchingNextStage}
                  />
                </SectionErrorBoundary>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="settings" className="mt-0 ui-scroll-region flex-1 min-h-0 overflow-y-auto ui-fade-slide-in">
            <div className="ui-content-shell py-6 space-y-6">
              {surfaceNotice && (
                <ExecutionSurfaceNoticeBanner
                  notice={surfaceNotice}
                  onAction={handleSurfaceNoticeAction}
                  onDismiss={() => setSurfaceNotice(null)}
                />
              )}
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
                        startApprovalRequired={startApprovalRequired}
                        stageLabel={entryStageLabel}
                        policySummary={entryPolicySummary}
                        nextStepLabel={entryNextStepLabel}
                        inputLabels={stageStartInputLabels}
                        onPrimaryAction={() => {
                          if (readyToRun) {
                            void handleRunRequest()
                            return
                          }
                          focusInputPanel()
                        }}
                        primaryActionLabel={readyToRun ? "Run" : "Add input"}
                        onRefine={() => setChatOpen(true)}
                        onToggleEditor={() => setShowEntryEditor((prev) => !prev)}
                        showEditor={showEntryEditor}
                        canRefine={canShowAgentPanel}
                        onDismiss={() => setWorkflowEntryState(null)}
                      />
                      <StageInputSection
                        inputPanelRef={inputPanelRef}
                        showTemplateContext={false}
                        showProjectArtifactsPanel={showProjectArtifactsPanel}
                        artifacts={combinedArtifactRecords}
                        loading={projectArtifactsLoading}
                        error={projectArtifactsError}
                        requiredContracts={selectedWorkflowTemplateContext?.contractIn}
                        onOpenArtifact={(artifact) => { void handleOpenArtifact(artifact) }}
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
                      requiredContracts={selectedWorkflowTemplateContext?.contractIn}
                      onOpenArtifact={(artifact) => { void handleOpenArtifact(artifact) }}
                    />
                  )}
                  {(!showEntryLanding || showEntryEditor) && (
                    <SectionErrorBoundary sectionName="chain builder">
                      <ChainBuilder
                        compact
                        mode={chainBuilderMode}
                        onStageSelect={focusStageDetails}
                        reviewSnapshot={showIdleReviewMode ? reviewedRunDetails?.snapshot ?? null : null}
                      />
                    </SectionErrorBoundary>
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
                          onStartNewRun={handleStartNewRun}
                          onOpenInbox={() => setMainView("inbox")}
                          onOpenArtifacts={() => setMainView("artifacts")}
                          nextStageTemplate={nextStageTemplate}
                          nextStageArtifacts={nextStageArtifacts}
                          onRunNextStage={selectedProject && nextStageTemplate ? handleRunNextStage : null}
                          nextStagePending={launchingNextStage}
                        />
                      </SectionErrorBoundary>
                    </div>
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
                          onStartNewRun={handleStartNewRun}
                          onOpenInbox={() => setMainView("inbox")}
                          onOpenArtifacts={() => setMainView("artifacts")}
                          nextStageTemplate={nextStageTemplate}
                          nextStageArtifacts={nextStageArtifacts}
                          onRunNextStage={selectedProject && nextStageTemplate ? handleRunNextStage : null}
                          nextStagePending={launchingNextStage}
                        />
                      </SectionErrorBoundary>
                    </div>
                  )}
                </>
              )}
            </div>
          </TabsContent>
            </Tabs>
          </>
        )}

        <BatchPanel />
        <StageStartApprovalDialog
          open={stageStartGateOpen}
          title={workflow.name || activeEntryState?.title || selectedWorkflowTemplateContext?.templateName || "This stage"}
          stageLabel={entryStageLabel}
          policySummary={entryPolicySummary}
          expectedArtifact={selectedWorkflowTemplateContext?.outputText || activeEntryState?.outputText || "A reviewable result"}
          inputLabels={stageStartInputLabels}
          notes={stageStartPolicyNotes}
          shortcutLabel={`${desktopRuntime.primaryModifierLabel}↵`}
          primaryModifierKey={desktopRuntime.primaryModifierKey}
          onApprove={handleApproveStageStart}
          onCancel={handleCancelStageStart}
        />
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
