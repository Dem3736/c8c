import { useEffect, useState } from "react"
import { useAtom, useAtomValue } from "jotai"
import {
  currentWorkflowAtom,
  defaultProviderAtom,
  inputValueAtom,
  inputAttachmentsAtom,
  providerSettingsAtom,
  selectedWorkflowPathAtom,
  validationErrorsAtom,
} from "@/lib/store"
import { cn } from "@/lib/cn"
import { resolveWorkflowInput } from "@/lib/input-type"
import type {
  WorkflowNode,
  NodeState,
  InputNodeConfig,
  OutputNodeConfig,
  SkillNodeConfig,
  EvaluatorNodeConfig,
  SplitterNodeConfig,
  MergerNodeConfig,
  ApprovalNodeConfig,
  HumanNodeConfig,
  NodeStatus,
} from "@shared/types"
import { getDefaultModelForProvider, modelLooksCompatible } from "@shared/provider-metadata"
import {
  ChevronDown,
  ArrowUp,
  ArrowDown,
  X,
  Plus,
  Zap,
  Eye,
  Pencil,
  File,
  History,
  Type,
} from "lucide-react"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { NODE_ICONS, NODE_LABELS, NODE_ICON_TONES } from "@/lib/node-ui-config"
import {
  getRuntimeBranchDetail,
  getRuntimeBranchLabel,
  getRuntimeRoleMonogram,
  getRuntimeStagePresentation,
} from "@/lib/runtime-flow-labels"
import { FilePicker } from "@/components/input/FilePicker"
import { RunPicker } from "@/components/input/RunPicker"
import { TextAttachmentEditor } from "@/components/input/TextAttachmentEditor"
import { ProviderModelSelect, ProviderSelect } from "@/components/provider-controls"
import {
  InputNodeEditor,
  OutputNodeEditor,
  SkillNodeEditor,
  EvaluatorNodeEditor,
  SplitterNodeEditor,
  MergerNodeEditor,
  ApprovalNodeEditor,
  HumanNodeEditor,
} from "@/components/NodeCardEditors"

export interface RuntimeBranchSummaryPreview {
  id: string
  label: string
  detail?: string | null
  status: NodeStatus
}

export interface RuntimeBranchSummary {
  total: number
  running: number
  completed: number
  failed: number
  waitingApproval: number
  pending: number
  previews: RuntimeBranchSummaryPreview[]
}

function compactRuntimeText(value: string | undefined | null, maxLength = 140) {
  if (!value) return null
  const normalized = value.replace(/\s+/g, " ").trim()
  if (!normalized) return null
  if (normalized.length <= maxLength) return normalized
  return `${normalized.slice(0, maxLength).trimEnd()}...`
}

function formatRuntimeMetrics(state?: NodeState) {
  if (!state?.metrics) return null
  const parts: string[] = []
  const totalTokens = (state.metrics.tokens_in || 0) + (state.metrics.tokens_out || 0)
  if (totalTokens > 0) {
    parts.push(totalTokens >= 1000 ? `${(totalTokens / 1000).toFixed(1)}k tok` : `${totalTokens} tok`)
  }
  if (state.metrics.cost_usd > 0) {
    parts.push(state.metrics.cost_usd < 0.01 ? "<$0.01" : `$${state.metrics.cost_usd.toFixed(2)}`)
  }
  if (parts.length < 2 && state.metrics.latency_ms > 0) {
    const latencySeconds = Math.round(state.metrics.latency_ms / 1000)
    if (latencySeconds >= 3600) {
      parts.push(`${(latencySeconds / 3600).toFixed(1)}h`)
    } else if (latencySeconds >= 60) {
      parts.push(`${Math.round(latencySeconds / 60)}m`)
    } else {
      parts.push(`${latencySeconds}s`)
    }
  }
  return parts.length > 0 ? parts.slice(0, 2).join(" · ") : null
}

function getLatestLogSnippet(state?: NodeState) {
  if (!state?.log?.length) return null
  for (let index = state.log.length - 1; index >= 0; index -= 1) {
    const entry = state.log[index]
    if (entry.type === "thinking" || entry.type === "text" || entry.type === "error") {
      const snippet = compactRuntimeText(entry.content, 150)
      if (snippet) return snippet
    }
    if (entry.type === "tool_use") {
      return `Using ${entry.tool}`
    }
    if (entry.type === "tool_result") {
      return entry.status === "success"
        ? `${entry.tool} returned data`
        : `${entry.tool} returned an error`
    }
  }
  return null
}

function formatBranchSummary(summary: RuntimeBranchSummary) {
  const parts: string[] = []
  if (summary.running > 0) {
    parts.push(`${summary.running}/${summary.total} active`)
  } else if (summary.completed > 0) {
    parts.push(`${summary.completed}/${summary.total} done`)
  } else {
    parts.push(`${summary.total} branches`)
  }
  if (summary.waitingApproval > 0) {
    parts.push(`${summary.waitingApproval} need review`)
  }
  if (summary.failed > 0) {
    parts.push(`${summary.failed} issue${summary.failed === 1 ? "" : "s"}`)
  }
  return parts.join(" · ")
}

function buildRuntimeCardCopy({
  node,
  state,
  retryLabel,
  runtimeBranchSummary,
}: {
  node: WorkflowNode
  state?: NodeState
  retryLabel: string | null
  runtimeBranchSummary: RuntimeBranchSummary | null
}) {
  const status = state?.status ?? "pending"
  const outputSnippet = compactRuntimeText(state?.output?.content, 160)
  const latestLogSnippet = getLatestLogSnippet(state)
  const metricsLabel = formatRuntimeMetrics(state)
  const branchLabel = runtimeBranchSummary ? formatBranchSummary(runtimeBranchSummary) : null

  if (node.type === "input") {
    if (status === "completed") {
      return {
        summary: "Input ready",
        detail: outputSnippet || latestLogSnippet || "The run has the input it needs.",
        metricsLabel,
        branchLabel,
      }
    }
    if (status === "running") {
      return {
        summary: "Preparing input",
        detail: latestLogSnippet || "Resolving the input for the rest of the flow.",
        metricsLabel,
        branchLabel,
      }
    }
    if (status === "failed") {
      return {
        summary: "Input needs attention",
        detail: compactRuntimeText(state?.error, 160) || latestLogSnippet || "The run could not prepare the input.",
        metricsLabel,
        branchLabel,
      }
    }
    return {
      summary: "Waiting for input",
      detail: "This flow will start once the required input is ready.",
      metricsLabel,
      branchLabel,
    }
  }

  if (node.type === "skill") {
    const config = node.config as SkillNodeConfig
    if (status === "running") {
      return {
        summary: runtimeBranchSummary ? "Working across branches" : "Working on this stage",
        detail: latestLogSnippet || outputSnippet || compactRuntimeText(config.prompt, 160) || "The agent is producing output for this step.",
        metricsLabel,
        branchLabel,
      }
    }
    if (status === "completed") {
      return {
        summary: runtimeBranchSummary ? "Branches finished this stage" : "Stage complete",
        detail: outputSnippet || latestLogSnippet || "Output from this stage is ready.",
        metricsLabel,
        branchLabel,
      }
    }
    if (status === "failed") {
      return {
        summary: runtimeBranchSummary ? "Some branches need attention" : "Stage needs attention",
        detail: compactRuntimeText(state?.error, 160) || latestLogSnippet || "This stage stopped with an error.",
        metricsLabel,
        branchLabel,
      }
    }
    return {
      summary: runtimeBranchSummary ? "Ready to fan out through this stage" : "Ready when the flow reaches this stage",
      detail: compactRuntimeText(config.prompt, 160) || "This stage will run when upstream work finishes.",
      metricsLabel,
      branchLabel,
    }
  }

  if (node.type === "evaluator") {
    const config = node.config as EvaluatorNodeConfig
    const score = typeof state?.output?.metadata?.score === "number" ? state.output.metadata.score : null
    if (status === "running") {
      return {
        summary: `Checking quality against ${config.threshold}/10`,
        detail: latestLogSnippet || `Will retry up to ${config.maxRetries} time${config.maxRetries === 1 ? "" : "s"}${retryLabel ? ` from ${retryLabel}` : ""}.`,
        metricsLabel,
        branchLabel,
      }
    }
    if (status === "completed") {
      return {
        summary: score != null ? `Quality check finished at ${score}/10` : "Quality check complete",
        detail: compactRuntimeText(state?.output?.metadata?.reason, 160) || outputSnippet || latestLogSnippet || "The flow can continue past this quality gate.",
        metricsLabel,
        branchLabel,
      }
    }
    if (status === "failed") {
      return {
        summary: "Quality gate needs attention",
        detail: compactRuntimeText(state?.error, 160) || latestLogSnippet || "The flow could not finish this quality check.",
        metricsLabel,
        branchLabel,
      }
    }
    return {
      summary: "Will check quality before moving on",
      detail: `Threshold ${config.threshold}/10${retryLabel ? ` · Retry from ${retryLabel}` : ""}`,
      metricsLabel,
      branchLabel,
    }
  }

  if (node.type === "splitter") {
    const config = node.config as SplitterNodeConfig
    if (status === "running") {
      return {
        summary: "Creating parallel work",
        detail: latestLogSnippet || branchLabel || `This stage can open up to ${config.maxBranches || 8} branches.`,
        metricsLabel,
        branchLabel,
      }
    }
    if (status === "completed") {
      return {
        summary: "Parallel work is ready",
        detail: branchLabel || latestLogSnippet || "Branch work has been created for downstream stages.",
        metricsLabel,
        branchLabel,
      }
    }
    if (status === "failed") {
      return {
        summary: "Could not create branch work",
        detail: compactRuntimeText(state?.error, 160) || latestLogSnippet || "This stage could not prepare parallel work.",
        metricsLabel,
        branchLabel,
      }
    }
    return {
      summary: "Will split work into parallel stages",
      detail: branchLabel || `Up to ${config.maxBranches || 8} branches can run from here.`,
      metricsLabel,
      branchLabel,
    }
  }

  if (node.type === "merger") {
    const config = node.config as MergerNodeConfig
    if (status === "running") {
      return {
        summary: "Combining branch outputs",
        detail: latestLogSnippet || `Using the ${config.strategy} merge strategy.`,
        metricsLabel,
        branchLabel,
      }
    }
    if (status === "completed") {
      return {
        summary: "Branch results combined",
        detail: outputSnippet || latestLogSnippet || "This stage produced a merged result.",
        metricsLabel,
        branchLabel,
      }
    }
    if (status === "failed") {
      return {
        summary: "Merge needs attention",
        detail: compactRuntimeText(state?.error, 160) || latestLogSnippet || "This stage could not combine the branch outputs.",
        metricsLabel,
        branchLabel,
      }
    }
    return {
      summary: "Will combine branch outputs",
      detail: `Using the ${config.strategy} merge strategy.`,
      metricsLabel,
      branchLabel,
    }
  }

  if (node.type === "approval") {
    const config = node.config as ApprovalNodeConfig
    if (status === "waiting_approval" || status === "running") {
      return {
        summary: "Waiting for your approval",
        detail: compactRuntimeText(config.message, 160) || "This flow is paused until you review and continue.",
        metricsLabel,
        branchLabel,
      }
    }
    if (status === "completed") {
      return {
        summary: "Approval completed",
        detail: compactRuntimeText(config.message, 160) || "The flow continued past this review gate.",
        metricsLabel,
        branchLabel,
      }
    }
    if (status === "failed") {
      return {
        summary: "Approval gate needs attention",
        detail: compactRuntimeText(state?.error, 160) || compactRuntimeText(config.message, 160) || "This review gate could not continue.",
        metricsLabel,
        branchLabel,
      }
    }
    return {
      summary: "May pause here for review",
      detail: compactRuntimeText(config.message, 160) || "This gate can stop the flow for a human decision.",
      metricsLabel,
      branchLabel,
    }
  }

  if (node.type === "human") {
    const config = node.config as HumanNodeConfig
    const taskTitle = config.staticRequest?.title || "Human input"
    if (status === "waiting_human" || status === "running") {
      return {
        summary: "Waiting for human input",
        detail: compactRuntimeText(config.staticRequest?.instructions, 160)
          || latestLogSnippet
          || "This flow is blocked until the required answers are submitted.",
        metricsLabel,
        branchLabel,
      }
    }
    if (status === "completed") {
      return {
        summary: "Human input received",
        detail: outputSnippet || latestLogSnippet || `${taskTitle} is ready for downstream stages.`,
        metricsLabel,
        branchLabel,
      }
    }
    if (status === "failed") {
      return {
        summary: "Human gate needs attention",
        detail: compactRuntimeText(state?.error, 160) || latestLogSnippet || "This stage could not resolve the required human input.",
        metricsLabel,
        branchLabel,
      }
    }
    return {
      summary: "Will pause for human input",
      detail: compactRuntimeText(config.staticRequest?.instructions, 160) || "This stage will block until someone answers the request.",
      metricsLabel,
      branchLabel,
    }
  }

  const config = node.config as OutputNodeConfig
  if (status === "running") {
    return {
      summary: "Preparing the result",
      detail: latestLogSnippet || "The flow is assembling the final output.",
      metricsLabel,
      branchLabel,
    }
  }
  if (status === "completed") {
    return {
      summary: "Result ready",
      detail: outputSnippet || latestLogSnippet || "The final output is ready to review.",
      metricsLabel,
      branchLabel,
    }
  }
  if (status === "failed") {
    return {
      summary: "Could not prepare the result",
      detail: compactRuntimeText(state?.error, 160) || latestLogSnippet || "The flow could not finish the final output.",
      metricsLabel,
      branchLabel,
    }
  }
  return {
    summary: "Will assemble the final result",
    detail: `Output format: ${config.format || "markdown"}`,
    metricsLabel,
    branchLabel,
  }
}

function getPreviewStatusLabel(status: NodeStatus) {
  if (status === "running") return "Active"
  if (status === "waiting_approval") return "Review"
  if (status === "waiting_human") return "Input"
  if (status === "failed") return "Issue"
  if (status === "completed") return "Done"
  return "Queued"
}

interface NodeCardProps {
  node: WorkflowNode
  index: number
  total: number
  state?: NodeState
  isActive: boolean
  isSelected?: boolean
  compact?: boolean
  onRemove: () => void
  onMoveUp?: () => void
  onMoveDown?: () => void
  onConfigChange: (config: InputNodeConfig | OutputNodeConfig | SkillNodeConfig | EvaluatorNodeConfig | SplitterNodeConfig | MergerNodeConfig | ApprovalNodeConfig | HumanNodeConfig) => void
  onSelect: () => void
  resolveNodeLabel?: (nodeId: string) => string
  runtimeMode?: boolean
  runtimeBranchSummary?: RuntimeBranchSummary | null
}

export function NodeCard({
  node,
  index,
  total,
  state,
  isActive,
  isSelected = false,
  compact = false,
  onRemove,
  onMoveUp,
  onMoveDown,
  onConfigChange,
  onSelect,
  resolveNodeLabel,
  runtimeMode = false,
  runtimeBranchSummary = null,
}: NodeCardProps) {
  const [expanded, setExpanded] = useState(false)
  const [workflow, setWorkflow] = useAtom(currentWorkflowAtom)
  const [inputValue, setInputValue] = useAtom(inputValueAtom)
  const [attachments, setAttachments] = useAtom(inputAttachmentsAtom)
  const defaultProvider = useAtomValue(defaultProviderAtom)
  const providerSettings = useAtomValue(providerSettingsAtom)
  const [selectedWorkflowPath] = useAtom(selectedWorkflowPathAtom)
  const [inputTouched, setInputTouched] = useState(false)
  const [filePickerOpen, setFilePickerOpen] = useState(false)
  const [runPickerOpen, setRunPickerOpen] = useState(false)
  const [textEditorOpen, setTextEditorOpen] = useState(false)
  const [editingTextIndex, setEditingTextIndex] = useState<number | undefined>(undefined)
  const [allValidationErrors] = useAtom(validationErrorsAtom)
  const nodeValidationErrors = allValidationErrors[node.id] || []
  const hasValidationErrors = nodeValidationErrors.some((e) => e.severity === "error")
  const Icon = NODE_ICONS[node.type] || Zap
  const isInput = node.type === "input"
  const isOutput = node.type === "output"
  const isSkill = node.type === "skill"
  const isEvaluator = node.type === "evaluator"
  const isSplitter = node.type === "splitter"
  const isMerger = node.type === "merger"
  const isApproval = node.type === "approval"
  const isHuman = node.type === "human"
  const isExpandable = isInput || isOutput || isSkill || isEvaluator || isSplitter || isMerger || isApproval || isHuman
  const isTerminal = isInput || isOutput
  const inputConfig = isInput ? (node.config as InputNodeConfig) : null
  const workflowProvider = workflow.defaults?.provider || defaultProvider
  const workflowModel = workflow.defaults?.model || getDefaultModelForProvider(workflowProvider)
  const outputConfig = isOutput ? (node.config as OutputNodeConfig) : null
  const skillConfig = isSkill ? (node.config as SkillNodeConfig) : null
  const evalConfig = isEvaluator ? (node.config as EvaluatorNodeConfig) : null
  const splitterConfig = isSplitter ? (node.config as SplitterNodeConfig) : null
  const mergerConfig = isMerger ? (node.config as MergerNodeConfig) : null
  const approvalConfig = isApproval ? (node.config as ApprovalNodeConfig) : null
  const humanConfig = isHuman ? (node.config as HumanNodeConfig) : null

  const title = isSkill
    ? skillConfig?.skillRef || "Unnamed Skill"
    : isOutput && outputConfig?.title
      ? outputConfig.title
      : isHuman && humanConfig?.staticRequest?.title
        ? humanConfig.staticRequest.title
        : NODE_LABELS[node.type] || node.type
  const retryLabel = evalConfig?.retryFrom ? resolveNodeLabel?.(evalConfig.retryFrom) || evalConfig.retryFrom : null

  const STATUS_CLASSES: Record<string, string> = {
    completed: "border-status-success/60",
    failed: "border-status-danger/60",
    running: "border-foreground/40",
    waiting_approval: "border-status-warning/60 ring-1 ring-status-warning/40",
    waiting_human: "border-status-warning/60 ring-1 ring-status-warning/40",
    skipped: "border-status-warning/50",
    queued: "border-foreground/20",
    pending: "",
    idle: "",
  }
  const STATUS_LABELS: Record<string, string> = {
    running: "running",
    completed: "completed",
    failed: "failed",
    queued: "waiting",
    skipped: "skipped",
    waiting_approval: "waiting for approval",
    waiting_human: "waiting for input",
    pending: "pending",
    idle: "idle",
  }
  const statusLabel = state?.status ? STATUS_LABELS[state.status] || state.status : null
  const statusClass = state?.status ? (STATUS_CLASSES[state.status] ?? "") : ""
  const previewTextClass = "text-muted-foreground truncate ui-meta-text"
  const showStatusBadge = statusLabel
    && statusLabel !== "pending"
    && (!compact || state?.status === "running" || state?.status === "failed" || state?.status === "waiting_approval" || state?.status === "waiting_human")
  const resolvedInput = resolveWorkflowInput(inputValue, {
    inputType: inputConfig?.inputType,
    required: inputConfig?.required,
    defaultValue: inputConfig?.defaultValue,
  })
  const inputTypeLabel =
    !resolvedInput.value.trim()
      ? "—"
      : resolvedInput.type === "url"
        ? "URL"
        : resolvedInput.type === "directory"
          ? "Directory"
          : "Text"
  const showInlineInput = !runtimeMode && compact && isInput && Boolean(inputConfig)
  const showInlineInputError = showInlineInput && inputTouched && !resolvedInput.valid
  const inlineInputPlaceholder =
    inputConfig?.placeholder
    || "Enter your input text, paste a URL, or describe what to process..."
  const hasExpandedPanel = Boolean(
    (isInput && inputConfig)
    || (isOutput && outputConfig)
    || (isSkill && skillConfig)
    || (isEvaluator && evalConfig)
    || (isSplitter && splitterConfig)
    || (isMerger && mergerConfig)
    || (isApproval && approvalConfig)
    || (isHuman && humanConfig)
  )
  const runtimeCardCopy = runtimeMode
    ? buildRuntimeCardCopy({
      node,
      state,
      retryLabel,
      runtimeBranchSummary,
    })
    : null
  const runtimePresentation = getRuntimeStagePresentation(node, {
    fallbackId: node.id,
    output: state?.output,
  })
  const runtimeDetailText = compactRuntimeText(runtimeCardCopy?.detail, 160)
  const runtimeHeading = {
    stepLabel: `Step ${index + 1}`,
    displayTitle: runtimePresentation.title,
  }

  useEffect(() => {
    setInputTouched(false)
  }, [selectedWorkflowPath, node.id])

  useEffect(() => {
    if (runtimeMode) {
      setExpanded(false)
    }
  }, [runtimeMode])

  const updateWorkflowDefaults = (patch: Record<string, unknown>) => {
    setWorkflow((prev) => ({
      ...prev,
      defaults: {
        ...(prev.defaults || {}),
        ...patch,
      },
    }))
  }

  if (runtimeMode) {
    const runtimeSurfaceClass = state?.status === "running"
      ? "border-status-info/35 bg-status-info/5"
      : state?.status === "waiting_approval" || state?.status === "waiting_human"
        ? "border-status-warning/35 bg-status-warning/8"
        : state?.status === "failed"
          ? "border-status-danger/35 bg-status-danger/6"
      : state?.status === "completed"
            ? "border-status-success/30 bg-surface-1"
            : "border-border bg-surface-1"

    return (
      <div
        className={cn(
          "h-[224px] overflow-hidden rounded-xl border ui-elevation-base transition-[border-color,box-shadow,background-color] ui-motion-fast",
          runtimeSurfaceClass,
          isSelected && "ring-2 ring-primary/20 shadow-[0_10px_30px_rgba(15,23,42,0.06)]",
          isActive && "border-primary/35 shadow-[0_14px_36px_rgba(15,23,42,0.08)]",
        )}
      >
        <button
          type="button"
          onClick={onSelect}
          className="group grid h-full w-full grid-rows-[auto_auto_minmax(0,1fr)_auto] gap-2.5 px-3.5 py-3.5 text-left"
          aria-label={`Focus stage ${title}`}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <div className="truncate ui-meta-label text-muted-foreground">
                {runtimeHeading.stepLabel}
              </div>
              <div className="ui-meta-text text-muted-foreground">
                {runtimePresentation.kind}
              </div>
            </div>
            {showStatusBadge && (
              <Badge
                variant="outline"
                className={cn(
                  "shrink-0 px-1.5 py-0 ui-meta-text",
                  state?.status === "running" && "border-status-info/30 text-status-info",
                  (state?.status === "waiting_approval" || state?.status === "waiting_human") && "border-status-warning/30 text-status-warning",
                  state?.status === "failed" && "border-status-danger/30 text-status-danger",
                  state?.status === "completed" && "border-status-success/30 text-status-success",
                  (!state?.status || state.status === "queued") && "text-muted-foreground",
                )}
              >
                {statusLabel}
              </Badge>
            )}
          </div>

          <div className="flex min-h-[3.25rem] items-start gap-3">
            <div
              className={cn(
                "mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ui-elevation-inset",
                NODE_ICON_TONES[node.type] || "border-hairline bg-surface-1 text-muted-foreground",
              )}
            >
              {isSkill ? (
                <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-foreground">
                  {getRuntimeRoleMonogram(runtimeHeading.displayTitle)}
                </span>
              ) : (
                <Icon size={17} className="flex-shrink-0" />
              )}
            </div>

            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="line-clamp-2 text-title-sm font-medium leading-6 text-foreground">
                {runtimeHeading.displayTitle}
              </div>
              <div className="line-clamp-1 ui-meta-text text-muted-foreground">
                {runtimePresentation.artifactLabel}
              </div>
            </div>
          </div>

          <div className="min-h-0 overflow-hidden space-y-2">
            {runtimeCardCopy?.summary && (
              <p className="line-clamp-2 text-body-sm font-medium leading-5 text-foreground">
                {runtimeCardCopy.summary}
              </p>
            )}
            {!runtimeBranchSummary?.previews?.length && runtimeDetailText && (
              <p className="line-clamp-2 text-body-sm leading-5 text-muted-foreground">
                {runtimeDetailText}
              </p>
            )}
            {runtimeBranchSummary?.previews && runtimeBranchSummary.previews.length > 0 && (
              <div className="space-y-1.5">
                <div className="ui-meta-label text-muted-foreground">
                  {isSplitter ? "Branches" : "Branch focus"}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {runtimeBranchSummary.previews.slice(0, 2).map((preview) => (
                    <Badge
                      key={preview.id}
                      variant="outline"
                      className={cn(
                        "max-w-full px-1.5 py-0 ui-meta-text",
                        preview.status === "running" && "border-status-info/30 text-status-info",
                        (preview.status === "waiting_approval" || preview.status === "waiting_human") && "border-status-warning/30 text-status-warning",
                        preview.status === "failed" && "border-status-danger/30 text-status-danger",
                        preview.status === "completed" && "border-status-success/30 text-status-success",
                        (preview.status === "pending" || preview.status === "queued") && "text-muted-foreground",
                      )}
                    >
                      <span className="truncate">{preview.label}</span>
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="flex shrink-0 items-center justify-between gap-2 border-t border-hairline/80 pt-2.5">
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            {runtimeCardCopy?.metricsLabel && (
              <Badge variant="outline" className="px-1.5 py-0 ui-meta-text text-muted-foreground">
                {runtimeCardCopy.metricsLabel}
              </Badge>
            )}
            {runtimeCardCopy?.branchLabel && (
              <Badge variant="outline" className="px-1.5 py-0 ui-meta-text text-muted-foreground">
                {runtimeCardCopy.branchLabel}
              </Badge>
            )}
            {!runtimeCardCopy?.metricsLabel && !runtimeCardCopy?.branchLabel && (
              <span className="ui-meta-text text-muted-foreground">
                {state?.status === "pending" ? "Waiting for upstream work" : "No run metrics yet"}
              </span>
            )}
            </div>
            <span className="shrink-0 ui-meta-text text-muted-foreground transition-colors group-hover:text-foreground">
              Inspect
            </span>
          </div>
        </button>
      </div>
    )
  }

  return (
    <div
      className={cn(
        "border border-border bg-surface-1 overflow-hidden transition-[border-color,box-shadow] ui-motion-fast ui-elevation-base",
        compact ? "rounded-md" : "rounded-lg",
        isActive && "ring-2 ring-primary/20",
        hasValidationErrors && !isActive && "ring-2 ring-status-danger/40",
        statusClass,
      )}
    >
      {/* Header */}
      <div
        className={cn(
          "group flex items-start bg-gradient-to-b from-surface-1 to-surface-2/60",
          compact ? "gap-2 px-2.5 py-1.5" : "gap-3 px-3 py-2.5",
        )}
      >
        <Button
          type="button"
          onClick={() => {
            onSelect()
            if (isExpandable) setExpanded((prev) => !prev)
          }}
          variant="ghost"
          size="auto"
          className={cn(
            "!h-auto min-w-0 flex-1 justify-start items-start rounded-md border-transparent p-0 text-left whitespace-normal hover:bg-transparent hover:border-transparent focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring/70",
            compact ? "gap-1.5" : "gap-2",
          )}
          aria-label={`Select node ${title}`}
        >
          <div
            className={cn(
              "shrink-0 rounded-md border flex items-center justify-center ui-elevation-inset",
              compact ? "h-6 w-6 mt-0" : "h-control-sm w-control-sm mt-0.5",
              NODE_ICON_TONES[node.type] || "border-hairline bg-surface-1 text-muted-foreground",
            )}
          >
            <Icon
              size={compact ? 13 : 14}
              className="flex-shrink-0"
            />
          </div>

          <div className="flex-1 min-w-0">
            <div className={cn("min-w-0", compact ? "space-y-0.5 pt-0" : "space-y-1 pt-0.5")}>
              <span className={cn("block font-medium truncate", compact ? "text-body-sm leading-5" : "text-body-md")}>{title}</span>
              {isSkill && !expanded && skillConfig?.prompt && (
                <p className={previewTextClass}>
                  {skillConfig.prompt.slice(0, 80)}
                  {skillConfig.prompt.length > 80 ? "..." : ""}
                </p>
              )}
              {isEvaluator && !expanded && evalConfig && (
                <p className={previewTextClass}>
                  Threshold: {evalConfig.threshold}/10 · Max {evalConfig.maxRetries} retries
                  {retryLabel ? ` · Retry: ${retryLabel}` : ""}
                </p>
              )}
              {isSplitter && !expanded && splitterConfig && (
                <p className={previewTextClass}>
                  Max {splitterConfig.maxBranches || 8} branches
                </p>
              )}
              {isMerger && !expanded && mergerConfig && (
                <p className={previewTextClass}>
                  Strategy: {mergerConfig.strategy}
                </p>
              )}
              {isInput && !expanded && inputConfig && !compact && (
                <p className={previewTextClass}>
                  {inputConfig.required === false ? "Optional" : "Required"} · {inputConfig.inputType || "auto"} input
                </p>
              )}
              {isOutput && !expanded && outputConfig && (
                <p className={previewTextClass}>
                  Format: {outputConfig.format || "markdown"}
                </p>
              )}
              {isApproval && !expanded && approvalConfig && (
                <p className={previewTextClass}>
                  {approvalConfig.message || "Manual approval gate"}
                </p>
              )}
              {isHuman && !expanded && humanConfig && (
                <p className={previewTextClass}>
                  {humanConfig.staticRequest?.title || "Human input gate"}
                </p>
              )}
              {isSkill && skillConfig?.permissionMode && (
                <div className={cn("ui-badge-row", compact ? "pt-0" : "pt-0.5")}>
                  <Badge
                    variant="outline"
                    className={cn(
                      "px-1.5 py-0 ui-meta-text gap-1",
                      skillConfig.permissionMode === "plan"
                        ? "text-muted-foreground"
                        : "text-status-warning border-status-warning/30",
                    )}
                  >
                    {skillConfig.permissionMode === "plan" ? <Eye size={10} /> : <Pencil size={10} />}
                    {skillConfig.permissionMode === "plan" ? "Plan" : "Edit"}
                  </Badge>
                </div>
              )}
              {showStatusBadge && (
                <div className={cn("ui-badge-row", compact ? "pt-0" : "pt-0.5")}>
                  <Badge variant="outline" className="px-1.5 py-0 ui-meta-text text-muted-foreground">
                    {statusLabel}
                  </Badge>
                </div>
              )}
            </div>
          </div>
        </Button>

        {/* Move/remove buttons — only for non-terminal nodes */}
        {!runtimeMode && !isTerminal && (
          <div
            className={cn(
              "ui-reveal-trailing-soft flex items-center gap-1",
              compact ? "pt-0" : "pt-0.5",
            )}
          >
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  aria-label="Move node up"
                  onClick={(e) => {
                    e.stopPropagation()
                    onMoveUp?.()
                  }}
                  disabled={!onMoveUp || index <= 1}
                  variant="ghost"
                  size="icon"
                  className={cn(
                    "ui-pressable rounded-md text-muted-foreground hover:bg-surface-3 disabled:text-muted-foreground/70",
                    compact ? "h-6 w-6" : "h-control-sm w-control-sm",
                  )}
                >
                  <ArrowUp size={12} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{onMoveUp ? "Move up" : "Reorder unavailable for branching workflows"}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  aria-label="Move node down"
                  onClick={(e) => {
                    e.stopPropagation()
                    onMoveDown?.()
                  }}
                  disabled={!onMoveDown || index >= total - 2}
                  variant="ghost"
                  size="icon"
                  className={cn(
                    "ui-pressable rounded-md text-muted-foreground hover:bg-surface-3 disabled:text-muted-foreground/70",
                    compact ? "h-6 w-6" : "h-control-sm w-control-sm",
                  )}
                >
                  <ArrowDown size={12} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{onMoveDown ? "Move down" : "Reorder unavailable for branching workflows"}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  aria-label="Remove node"
                  onClick={(e) => {
                    e.stopPropagation()
                    onRemove()
                  }}
                  variant="ghost"
                  size="icon"
                  className={cn(
                    "ui-pressable rounded-md text-muted-foreground hover:bg-status-danger/20 hover:text-status-danger",
                    compact ? "h-6 w-6" : "h-control-sm w-control-sm",
                  )}
                >
                  <X size={12} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Remove</TooltipContent>
            </Tooltip>
          </div>
        )}

        {/* Expand/collapse — for skill and evaluator nodes */}
        {!runtimeMode && isExpandable && (
          <Button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              setExpanded(!expanded)
            }}
            variant="ghost"
            size="icon"
            className={cn(
              "ui-pressable rounded-md text-muted-foreground hover:bg-surface-3",
              compact ? "h-6 w-6 mt-0" : "h-control-sm w-control-sm mt-0.5",
            )}
            aria-label={expanded ? "Collapse node settings" : "Expand node settings"}
            aria-expanded={expanded}
          >
            <ChevronDown
              size={14}
              className={cn(
                "transition-transform ui-motion-fast",
                expanded && "rotate-180",
              )}
            />
          </Button>
        )}
      </div>

      {showInlineInput && (
        <div className="border-t border-hairline bg-surface-1/80 px-2.5 py-2 space-y-1.5">
          <Textarea
            id={`run-input-${node.id}`}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onBlur={() => setInputTouched(true)}
            rows={2}
            placeholder={inlineInputPlaceholder}
            aria-invalid={showInlineInputError || undefined}
            aria-describedby={showInlineInputError ? `run-input-error-${node.id}` : undefined}
            className="min-h-[3rem] max-h-[10rem] resize-y bg-surface-2/90 text-body-sm"
          />
          {/* Attachment chips */}
          <div className="flex flex-wrap items-center gap-1">
            {attachments.map((att, i) => (
              <Badge
                key={`${att.kind}-${i}`}
                variant="outline"
                className="gap-1 pl-1.5 pr-1 py-0.5 max-w-[180px] cursor-default text-label-xs"
              >
                {att.kind === "file" && <File size={10} className="flex-shrink-0 text-muted-foreground" aria-hidden="true" />}
                {att.kind === "run" && <History size={10} className="flex-shrink-0 text-muted-foreground" aria-hidden="true" />}
                {att.kind === "text" && <Type size={10} className="flex-shrink-0 text-muted-foreground" aria-hidden="true" />}
                <span
                  className="truncate"
                  title={att.kind === "file" ? att.path : att.kind === "run" ? `${att.workflowName} (${att.runId.slice(0, 8)})` : att.label}
                  onClick={att.kind === "text" ? () => { setEditingTextIndex(i); setTextEditorOpen(true) } : undefined}
                  role={att.kind === "text" ? "button" : undefined}
                  tabIndex={att.kind === "text" ? 0 : undefined}
                  onKeyDown={att.kind === "text" ? (e) => { if (e.key === "Enter" || e.key === " ") { setEditingTextIndex(i); setTextEditorOpen(true) } } : undefined}
                >
                  {att.kind === "file" && att.name}
                  {att.kind === "run" && att.workflowName}
                  {att.kind === "text" && att.label}
                </span>
                <button
                  type="button"
                  onClick={() => setAttachments((prev) => prev.filter((_, idx) => idx !== i))}
                  className="ml-0.5 rounded-sm p-0.5 text-muted-foreground hover:text-foreground hover:bg-surface-3 ui-transition-colors ui-motion-fast"
                  aria-label={`Remove ${att.kind === "file" ? att.name : att.kind === "run" ? att.workflowName : att.label}`}
                >
                  <X size={8} aria-hidden="true" />
                </button>
              </Badge>
            ))}
          </div>
          <div className="control-cluster control-cluster-compact flex flex-wrap items-center gap-1">
            <div className="flex flex-wrap items-center gap-1">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-xs"
                    className="control-pill-compact w-control-xs border-hairline bg-surface-1/85 text-muted-foreground shadow-inset-highlight-subtle hover:bg-surface-1 hover:text-foreground"
                    aria-label="Attach context"
                  >
                    <Plus size={12} aria-hidden="true" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuItem onSelect={() => setFilePickerOpen(true)}>
                    <File size={13} className="mr-2" />
                    Attach file
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setRunPickerOpen(true)}>
                    <History size={13} className="mr-2" />
                    Attach run output
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => { setEditingTextIndex(undefined); setTextEditorOpen(true) }}>
                    <Type size={13} className="mr-2" />
                    Add text snippet
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <ProviderSelect
                value={workflowProvider}
                onValueChange={(provider) => updateWorkflowDefaults({
                  provider,
                  model: modelLooksCompatible(provider, workflow.defaults?.model)
                    ? workflow.defaults?.model
                    : getDefaultModelForProvider(provider),
                })}
                codexEnabled={providerSettings.features.codexProvider}
                labelMode="short"
                className="control-pill-compact w-[96px] border-hairline bg-surface-1/85 shadow-inset-highlight-subtle"
                ariaLabel="Workflow provider"
              />
              <ProviderModelSelect
                provider={workflowProvider}
                value={workflowModel}
                onValueChange={(model) => updateWorkflowDefaults({ model })}
                className="control-pill-compact w-[118px] border-hairline bg-surface-1/85 tabular-nums shadow-inset-highlight-subtle"
                ariaLabel="Workflow model"
              />
            </div>
            <div className="ml-auto flex flex-wrap items-center gap-1">
              <Badge variant="outline" size="compact" className="control-badge control-badge-compact rounded-full border-hairline bg-surface-1/80">
                Type: {inputTypeLabel}
              </Badge>
              {showInlineInputError && (
                <span id={`run-input-error-${node.id}`} className="text-label-xs font-normal text-status-danger">
                  {resolvedInput.message}
                </span>
              )}
            </div>
          </div>
          <FilePicker open={filePickerOpen} onOpenChange={setFilePickerOpen} />
          <RunPicker open={runPickerOpen} onOpenChange={setRunPickerOpen} />
          <TextAttachmentEditor open={textEditorOpen} onOpenChange={setTextEditorOpen} editIndex={editingTextIndex} />
        </div>
      )}

      {/* Screen reader status announcement */}
      {(state?.status === "completed" || state?.status === "failed") && (
        <span className="sr-only" aria-live="polite">
          {title} {state.status === "completed" ? "completed" : "failed"}
        </span>
      )}

      {/* Validation errors */}
      <div
        data-open={!runtimeMode && nodeValidationErrors.length > 0 ? "true" : "false"}
        className="ui-collapsible"
      >
        <div className="ui-collapsible-inner">
          <div className="px-3 pb-2 pt-1 border-t border-status-danger/20 bg-status-danger/10 space-y-1">
            {nodeValidationErrors.map((err) => (
              <p key={`${err.field}-${err.severity}`} className="ui-meta-text text-status-danger">
                {err.message}
              </p>
            ))}
          </div>
        </div>
      </div>

      {/* Expanded node-type editors */}
      <div
        data-open={!runtimeMode && expanded && hasExpandedPanel ? "true" : "false"}
        className="ui-collapsible"
      >
        <div className="ui-collapsible-inner">
          {isInput && inputConfig && (
            <InputNodeEditor nodeId={node.id} config={inputConfig} onConfigChange={onConfigChange} />
          )}
          {isOutput && outputConfig && (
            <OutputNodeEditor nodeId={node.id} config={outputConfig} onConfigChange={onConfigChange} />
          )}
          {isSkill && skillConfig && (
            <SkillNodeEditor nodeId={node.id} config={skillConfig} onConfigChange={onConfigChange} />
          )}
          {isEvaluator && evalConfig && (
            <EvaluatorNodeEditor nodeId={node.id} config={evalConfig} onConfigChange={onConfigChange} />
          )}
          {isSplitter && splitterConfig && (
            <SplitterNodeEditor nodeId={node.id} config={splitterConfig} onConfigChange={onConfigChange} />
          )}
          {isMerger && mergerConfig && (
            <MergerNodeEditor nodeId={node.id} config={mergerConfig} onConfigChange={onConfigChange} />
          )}
          {isApproval && approvalConfig && (
            <ApprovalNodeEditor nodeId={node.id} config={approvalConfig} onConfigChange={onConfigChange} />
          )}
          {isHuman && humanConfig && (
            <HumanNodeEditor nodeId={node.id} config={humanConfig} onConfigChange={onConfigChange} />
          )}
        </div>
      </div>
    </div>
  )
}
