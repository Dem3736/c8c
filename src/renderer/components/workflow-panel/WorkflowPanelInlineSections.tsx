import { useEffect, type ReactNode, type RefObject } from "react"
import { useAtomValue } from "jotai"
import {
  ArrowRight,
  FileStack,
  FolderOpen,
  LayoutTemplate,
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
import { ProjectResultsPanel } from "@/components/workflow/ProjectResultsPanel"
import { consumeShortcut, isShortcutConsumed, matchesPrimaryShortcut } from "@/lib/keyboard-shortcuts"
import { hasCompletedFirstFlowAtom } from "@/lib/store"
import type { WorkflowBlockedResumeSummary } from "@/lib/workflow-blocked-resume"
import type { WorkflowEntryState } from "@/lib/workflow-entry"
import {
  deriveTemplateContinuationLabel,
  deriveTemplateDisplayLabel,
  deriveTemplateJobLabel,
} from "@/lib/workflow-entry"
import type { FlowRulePreview } from "@/lib/flow-rules"
import type { WorkflowResumeEntrySummary } from "@/lib/workflow-resume-entry"
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

export interface EmptyProjectQuickStart {
  label: string
  prompt: string
}

const DEFAULT_QUICK_STARTS: EmptyProjectQuickStart[] = [
  { label: "Map this codebase", prompt: "Map this codebase and summarize its architecture" },
  { label: "Review code for issues", prompt: "Review this codebase for bugs, security issues, and code quality problems" },
  { label: "Investigate a bug", prompt: "Investigate and fix a bug" },
  { label: "Plan a new feature", prompt: "Plan and build a new feature" },
]

export function EmptyProjectState({
  onOpenTemplates,
  onQuickStart,
  quickStarts = DEFAULT_QUICK_STARTS,
}: {
  onOpenTemplates: () => void
  onQuickStart?: (prompt: string) => void
  quickStarts?: EmptyProjectQuickStart[]
}) {
  const hasCompletedFirstFlow = useAtomValue(hasCompletedFirstFlowAtom)

  return (
    <EmptyState
      icon={Sparkles}
      title="What do you want to do?"
      description="Describe your goal or pick a starting point."
    >
      <div className="flex flex-col items-center gap-4">
        {onQuickStart && quickStarts.length > 0 && (
          <div className="flex flex-col items-stretch gap-1.5 w-full max-w-xs">
            {quickStarts.map((qs) => (
              <button
                key={qs.label}
                type="button"
                onClick={() => onQuickStart(qs.prompt)}
                className="flex items-center gap-2 rounded-md px-3 py-2 text-body-sm text-foreground hover:bg-surface-2 ui-transition-colors text-left"
              >
                <ArrowRight size={12} className="shrink-0 opacity-50" aria-hidden="true" />
                {qs.label}
              </button>
            ))}
          </div>
        )}
        <Button variant="outline" size="sm" onClick={onOpenTemplates}>
          <LayoutTemplate size={14} />
          Browse library
        </Button>
        {!hasCompletedFirstFlow && (
          <p className="text-body-sm text-muted-foreground/70">
            First time? Describe what you need — c8c will handle the rest.
          </p>
        )}
      </div>
    </EmptyState>
  )
}

const CAPABILITY_EXAMPLES = [
  "Review code for security issues",
  "Investigate and fix a bug",
  "Plan and build a new feature",
]

export function EmptyWorkspaceState({ onOpenProject }: { onOpenProject: () => void }) {
  const hasCompletedFirstFlow = useAtomValue(hasCompletedFirstFlowAtom)

  return (
    <EmptyState
      icon={FolderOpen}
      title="Start by opening a project"
      description="Choose a project folder — c8c will inspect it and suggest the best way to help."
    >
      <div className="flex flex-col items-center gap-4">
        <Button variant="outline" size="sm" onClick={onOpenProject}>
          <FolderOpen size={14} />
          Open project folder
        </Button>
        <ul className="space-y-1.5 text-body-sm text-muted-foreground">
          {CAPABILITY_EXAMPLES.map((example) => (
            <li key={example} className="flex items-center gap-2">
              <ArrowRight size={12} className="shrink-0 opacity-50" aria-hidden="true" />
              {example}
            </li>
          ))}
        </ul>
        {!hasCompletedFirstFlow && (
          <p className="text-body-sm text-muted-foreground/70">
            First time? Open a project and describe what you need — c8c will handle the rest.
          </p>
        )}
      </div>
    </EmptyState>
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
  const firstLine = (value || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean)

  const normalized = (firstLine || "").replace(/\s+/g, " ").trim()
  if (!normalized) return fallback

  const sentenceMatch = normalized.match(/^.+?[.!?](?=\s|$)/)
  return sentenceMatch?.[0]?.trim() || normalized
}

export function WorkflowResumeHeader({
  entry,
  displayTitle,
  readyToRun,
  startApprovalRequired,
  stageLabel,
  resumeSummary,
  blockedResumeSummary,
  flowRules,
  nextStepLabel,
  inputLabels,
  onPrimaryAction,
  primaryActionLabel,
  onOpenResumeArtifact,
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
  resumeSummary?: WorkflowResumeEntrySummary | null
  blockedResumeSummary?: WorkflowBlockedResumeSummary | null
  flowRules: FlowRulePreview[]
  nextStepLabel: string
  inputLabels: string[]
  onPrimaryAction: () => void
  primaryActionLabel: string
  onOpenResumeArtifact?: (() => void) | null
  onRefine: () => void
  onToggleEditor: () => void
  onAttachCapability: () => void
  showEditor: boolean
  canRefine: boolean
  onDismiss: () => void
}) {
  const compactItems = blockedResumeSummary
    ? [
      {
        label: "Status",
        value: blockedResumeSummary.statusText,
      },
      {
        label: "Why paused",
        value: blockedResumeSummary.reasonText,
      },
      {
        label: "Results to attach",
        value: blockedResumeSummary.attachText,
      },
    ]
    : resumeSummary
    ? [
      {
        label: "Ready because",
        value: resumeSummary.readyBecauseText,
      },
      {
        label: "Checks",
        value: resumeSummary.checksText,
      },
      {
        label: "Results to attach",
        value: resumeSummary.attachText,
      },
    ]
    : [
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
    <section data-workflow-resume-header="true" className="space-y-2.5 ui-fade-slide-in">
      <ScopeBanner
        tone="muted"
        eyebrow={(
          <div className="flex flex-wrap items-center gap-1.5">
            {resumeSummary && (
              <Badge variant="outline" className="ui-meta-text px-2 py-0">
                Saved work
              </Badge>
            )}
            {stageLabel && (
              <Badge variant="outline" className="ui-meta-text px-2 py-0">
                {stageLabel}
              </Badge>
            )}
            {blockedResumeSummary ? (
              <Badge variant="warning" className="ui-meta-text px-2 py-0">
                Blocked
              </Badge>
            ) : (
              <Badge variant={readyToRun ? "success" : "secondary"} className="ui-meta-text px-2 py-0">
                {readyToRun ? "Ready" : "Needs input"}
              </Badge>
            )}
            {startApprovalRequired && !blockedResumeSummary && (
              <Badge variant="warning" className="ui-meta-text px-2 py-0">
                Approval before continue
              </Badge>
            )}
          </div>
        )}
        title={displayTitle}
        description={blockedResumeSummary?.latestResultText || resumeSummary?.latestResultText || undefined}
        actions={(
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={onPrimaryAction}>
              <Play size={14} />
              {primaryActionLabel}
            </Button>
            {(blockedResumeSummary?.primaryArtifact || resumeSummary?.primaryArtifact) && onOpenResumeArtifact ? (
              <Button variant="outline" size="sm" onClick={onOpenResumeArtifact}>
                <FileStack size={14} />
                Open result
              </Button>
            ) : null}
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
        <ProjectResultsPanel
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
