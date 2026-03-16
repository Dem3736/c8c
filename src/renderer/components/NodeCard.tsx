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
} from "@shared/types"
import type { ErrorKind, NodeOnErrorPolicy, NodeRetryBackoff, NodeRuntimeConfig } from "@shared/types"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { NODE_ICONS, NODE_LABELS, NODE_ICON_TONES } from "@/lib/node-ui-config"
import { SkillRefInput } from "@/components/ui/skill-ref-input"
import { McpToolPicker } from "@/components/ui/mcp-tool-picker"
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
} from "@/components/NodeCardEditors"

interface NodeCardProps {
  node: WorkflowNode
  index: number
  total: number
  state?: NodeState
  isActive: boolean
  compact?: boolean
  onRemove: () => void
  onMoveUp?: () => void
  onMoveDown?: () => void
  onConfigChange: (config: InputNodeConfig | OutputNodeConfig | SkillNodeConfig | EvaluatorNodeConfig | SplitterNodeConfig | MergerNodeConfig | ApprovalNodeConfig) => void
  onSelect: () => void
  resolveNodeLabel?: (nodeId: string) => string
}

export function NodeCard({
  node,
  index,
  total,
  state,
  isActive,
  compact = false,
  onRemove,
  onMoveUp,
  onMoveDown,
  onConfigChange,
  onSelect,
  resolveNodeLabel,
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
  const isExpandable = isInput || isOutput || isSkill || isEvaluator || isSplitter || isMerger || isApproval
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

  const title = isSkill
    ? skillConfig?.skillRef || "Unnamed Skill"
    : isOutput && outputConfig?.title
      ? outputConfig.title
    : NODE_LABELS[node.type] || node.type
  const retryLabel = evalConfig?.retryFrom ? resolveNodeLabel?.(evalConfig.retryFrom) || evalConfig.retryFrom : null

  const STATUS_CLASSES: Record<string, string> = {
    completed: "border-status-success/60",
    failed: "border-status-danger/60",
    running: "border-foreground/40",
    waiting_approval: "border-status-warning/60 ring-1 ring-status-warning/40",
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
    pending: "pending",
    idle: "idle",
  }
  const statusLabel = state?.status ? STATUS_LABELS[state.status] || state.status : null
  const statusClass = state?.status ? (STATUS_CLASSES[state.status] ?? "") : ""
  const previewTextClass = cn(
    "text-muted-foreground truncate",
    "ui-meta-text",
  )
  const showStatusBadge = statusLabel
    && statusLabel !== "pending"
    && (!compact || state?.status === "running" || state?.status === "failed" || state?.status === "waiting_approval")
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
  const showInlineInput = compact && isInput && Boolean(inputConfig)
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
    || (isApproval && approvalConfig),
  )

  useEffect(() => {
    setInputTouched(false)
  }, [selectedWorkflowPath, node.id])

  const updateWorkflowDefaults = (patch: Record<string, unknown>) => {
    setWorkflow((prev) => ({
      ...prev,
      defaults: {
        ...(prev.defaults || {}),
        ...patch,
      },
    }))
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

          <div className={cn("flex-1 min-w-0", compact ? "space-y-0.5 pt-0" : "space-y-1 pt-0.5")}>
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
        </Button>

        {/* Move/remove buttons — only for non-terminal nodes */}
        {!isTerminal && (
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
        {isExpandable && (
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
        data-open={nodeValidationErrors.length > 0 ? "true" : "false"}
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
        data-open={expanded && hasExpandedPanel ? "true" : "false"}
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
        </div>
      </div>
    </div>
  )
}
