import { useEffect, type ReactNode, type RefObject } from "react"
import {
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
import type { WorkflowEntryState } from "@/lib/workflow-entry"
import {
  deriveTemplateContinuationLabel,
  deriveTemplateDisplayLabel,
  deriveTemplateJobLabel,
} from "@/lib/workflow-entry"
import type { FlowRulePreview } from "@/lib/flow-rules"
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

export function EmptyProjectState({ onOpenTemplates }: { onOpenTemplates: () => void }) {
  return (
    <EmptyState
      icon={FileStack}
      title="Pick a flow"
      description="Choose an existing flow or start a new one from the sidebar"
    >
      <Button variant="outline" size="sm" onClick={onOpenTemplates}>
        <LayoutTemplate size={14} />
        Open a starting point
      </Button>
    </EmptyState>
  )
}

export function EmptyWorkspaceState({ onOpenProject }: { onOpenProject: () => void }) {
  return (
    <EmptyState
      icon={FolderOpen}
      title="Open a project"
      description="Choose a project folder in the sidebar to begin"
    >
      <Button variant="outline" size="sm" onClick={onOpenProject}>
        <FolderOpen size={14} />
        Open project folder
      </Button>
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

export function WorkflowEntryLanding({
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
      value: startApprovalRequired ? "Review approval before run." : nextStepLabel,
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
                Approval before run
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
      <DialogContent className="max-w-xl" showCloseButton={false} aria-describedby="stage-start-approval-description">
        <DialogHeader>
          <DialogTitle>Approve and run</DialogTitle>
          <DialogDescription id="stage-start-approval-description">
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
