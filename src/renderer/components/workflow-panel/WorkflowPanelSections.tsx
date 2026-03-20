import { useEffect, type ReactNode, type RefObject } from "react"
import {
  Activity,
  FileText,
  Loader2,
  MessageSquare,
  MoreHorizontal,
  PencilLine,
  Play,
  Plus,
  Sparkles,
  type LucideIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ScopeBanner } from "@/components/ui/scope-banner"
import { FlowRulesPreview } from "@/components/ui/flow-rules-preview"
import { ExecutionApprovalSummary } from "@/components/ui/execution-approval-summary"
import { DisclosurePanel } from "@/components/ui/disclosure-panel"
import { InputPanel } from "@/components/InputPanel"
import { cn } from "@/lib/cn"
import {
  deriveTemplateContinuationLabel,
  deriveTemplateDisplayLabel,
  deriveTemplateJobLabel,
  formatArtifactContractLabel,
  type WorkflowEntryState,
} from "@/lib/workflow-entry"
import { consumeShortcut, isShortcutConsumed, matchesPrimaryShortcut } from "@/lib/keyboard-shortcuts"
import type { FlowRulePreview } from "@/lib/flow-rules"
import type { RunProgressSummary } from "@/lib/run-progress"
import type {
  ArtifactContract,
  ArtifactRecord,
  InputAttachment,
  WorkflowTemplate,
} from "@shared/types"

export function EmptyState({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: LucideIcon
  title: string
  description: string
  children?: ReactNode
}) {
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

export function WorkflowDraftSkeleton() {
  return (
    <div className="rounded-lg surface-panel p-5 ui-fade-slide-in">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-foreground shadow-inset-highlight">
          <Sparkles size={18} aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-title-sm text-foreground">
            <Loader2 size={14} className="animate-spin text-status-info" />
            Preparing the first flow draft
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

export function deriveEntryNextStepLabel({
  readyToRun,
  nextStageTemplate,
}: {
  readyToRun: boolean
  nextStageTemplate: WorkflowTemplate | null
}) {
  if (!readyToRun) return "Add step input."
  if (nextStageTemplate) {
    return `Continue to ${deriveTemplateContinuationLabel(nextStageTemplate) || deriveTemplateJobLabel(nextStageTemplate) || deriveTemplateDisplayLabel(nextStageTemplate) || nextStageTemplate.name}.`
  }
  return "Review the result."
}

export function formatInputAttachmentLabel(attachment: InputAttachment) {
  if (attachment.kind === "file") return attachment.name
  if (attachment.kind === "run") return attachment.workflowName
  return attachment.label
}

export function takeLeadingSentence(value: string | null | undefined, fallback: string) {
  const text = value?.trim()
  if (!text) return fallback
  const sentenceMatch = text.match(/^(.+?[.!?])(?:\s|$)/)
  if (sentenceMatch?.[1]) return sentenceMatch[1]
  return text.length > 160 ? `${text.slice(0, 157).trimEnd()}...` : text
}

export function WorkflowResumeHeader({
  entry,
  displayTitle,
  readyToRun,
  startApprovalRequired,
  stageLabel,
  flowRules,
  nextStepLabel,
  inputLabels,
  onPrimaryAction,
  primaryActionLabel,
  onRefine,
  onToggleEditor,
  onAttachCapability,
  showEditor,
  canRefine,
  onDismiss,
}: {
  entry: WorkflowEntryState
  displayTitle: string
  readyToRun: boolean
  startApprovalRequired: boolean
  stageLabel?: string | null
  flowRules: FlowRulePreview[]
  nextStepLabel: string
  inputLabels: string[]
  onPrimaryAction: () => void
  primaryActionLabel: string
  onRefine: () => void
  onToggleEditor: () => void
  onAttachCapability: () => void
  showEditor: boolean
  canRefine: boolean
  onDismiss: () => void
}) {
  const compactItems = [
    {
      label: "Expects",
      value: inputLabels.length > 0 ? inputLabels.slice(0, 3).join(" · ") : entry.inputText,
    },
    {
      label: "Produces",
      value: entry.outputText,
    },
    {
      label: "Next",
      value: startApprovalRequired ? "Approval before continue." : nextStepLabel,
    },
  ]

  return (
    <section className="space-y-2.5 ui-fade-slide-in">
      <ScopeBanner
        tone="muted"
        eyebrow={(
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
                Approval before continue
              </Badge>
            )}
          </div>
        )}
        title={displayTitle}
        actions={(
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={onPrimaryAction}>
              <Play size={14} />
              {primaryActionLabel}
            </Button>
            {canRefine ? (
              <Button variant="outline" size="sm" onClick={onRefine}>
                <MessageSquare size={14} />
                Refine
              </Button>
            ) : null}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" aria-label="More actions">
                  <MoreHorizontal size={14} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" sideOffset={8} className="w-56">
                <DropdownMenuItem onSelect={onAttachCapability}>
                  <Plus size={14} />
                  Attach skill
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={onToggleEditor}>
                  <PencilLine size={14} />
                  {showEditor ? "Hide editor" : "Edit flow"}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={onDismiss}>
                  Dismiss
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      >
        <div className="grid gap-2 sm:grid-cols-3">
          {compactItems.map((item) => (
            <div key={item.label} className="rounded-lg border border-hairline/80 bg-surface-1/70 px-3 py-2">
              <p className="ui-meta-label text-muted-foreground">{item.label}</p>
              <p className="mt-1 line-clamp-2 text-body-sm text-foreground">{item.value}</p>
            </div>
          ))}
        </div>
        {flowRules.length > 0 && (
          <FlowRulesPreview
            rules={flowRules}
            collapsible
            className="mt-2"
          />
        )}
      </ScopeBanner>
    </section>
  )
}

export function StageStartApprovalDialog({
  open,
  flowName,
  title,
  stageLabel,
  stepDescription,
  flowRules,
  expectedArtifact,
  inputPreview,
  inputLabels,
  notes,
  shortcutLabel,
  approveConsequence,
  rejectConsequence,
  primaryModifierKey,
  onApprove,
  onCancel,
}: {
  open: boolean
  flowName: string
  title: string
  stageLabel?: string | null
  stepDescription?: string | null
  flowRules: FlowRulePreview[]
  expectedArtifact: string
  inputPreview?: string
  inputLabels: string[]
  notes: string[]
  shortcutLabel: string
  approveConsequence: string
  rejectConsequence: string
  primaryModifierKey: "meta" | "ctrl"
  onApprove: () => Promise<void> | void
  onCancel: () => void
}) {
  useEffect(() => {
    if (!open) return

    const handler = (event: KeyboardEvent) => {
      if (event.defaultPrevented || isShortcutConsumed(event)) return

      if (!matchesPrimaryShortcut(event, { key: "Enter", primaryModifierKey })) return
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
      <DialogContent className="max-w-xl" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Approve and run</DialogTitle>
          <DialogDescription>
            Confirm what will run, which input it will use, and what happens next.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <ExecutionApprovalSummary
            flowName={flowName}
            stepName={title}
            stepKind={stageLabel}
            stepDescription={stepDescription}
            expectedResult={expectedArtifact}
            inputPreview={inputPreview}
            inputLabels={inputLabels}
            approveConsequence={approveConsequence}
            rejectConsequence={rejectConsequence}
            topBadges={(
              <>
                <Badge variant="warning" size="compact">Approval</Badge>
                <Badge variant="outline" size="compact">{shortcutLabel}</Badge>
              </>
            )}
          />

          <FlowRulesPreview rules={flowRules} />

          {notes.length > 0 && (
            <DisclosurePanel summary="Approval notes">
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
            Approve and run
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function RunStrip({
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

export function ProjectArtifactsPanel({
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

  if (!shouldRender) return null

  return (
    <section className="rounded-lg border border-hairline bg-surface-1/70 px-4 py-3 ui-fade-slide-in">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="section-kicker">Results</div>
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
          <div className="ui-meta-text text-muted-foreground">Loading results...</div>
        ) : error ? (
          <div role="alert" className="ui-meta-text text-status-danger">{error}</div>
        ) : latestArtifacts.length === 0 ? (
          <div className="ui-meta-text text-muted-foreground">No saved results yet.</div>
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

export function StageInputSection({
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
        <InputPanel label="Step input" compact showTemplateContext={showTemplateContext} />
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
