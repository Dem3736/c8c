import { useState } from "react"
import { cn } from "@/lib/cn"
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
import {
  ChevronDown,
  ChevronUp,
  ArrowUp,
  ArrowDown,
  X,
  Plus,
  Zap,
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
import { NODE_ICONS, NODE_LABELS } from "@/lib/node-ui-config"

const ON_ERROR_OPTIONS: NodeOnErrorPolicy[] = ["stop", "continue", "continue_error_output"]
const RETRY_ERROR_KINDS: ErrorKind[] = ["tool", "model", "timeout", "policy", "unknown"]

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function ClampedNumberInput({
  value, min, max, onChange, ...props
}: { value: number; min: number; max: number; onChange: (v: number) => void } & Omit<React.ComponentProps<typeof Input>, 'value' | 'onChange'>) {
  const [local, setLocal] = useState<string | null>(null)
  return (
    <Input
      {...props}
      type="number"
      min={min}
      max={max}
      value={local ?? value}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={() => {
        if (local !== null) {
          const parsed = parseInt(local, 10)
          onChange(isNaN(parsed) ? value : clampNumber(parsed, min, max))
          setLocal(null)
        }
      }}
    />
  )
}

type RuntimeConfigurableNodeConfig =
  | SkillNodeConfig
  | EvaluatorNodeConfig
  | SplitterNodeConfig
  | MergerNodeConfig
  | ApprovalNodeConfig

function RuntimePolicyEditor({
  nodeId,
  config,
  onConfigChange,
}: {
  nodeId: string
  config: RuntimeConfigurableNodeConfig
  onConfigChange: (next: RuntimeConfigurableNodeConfig) => void
}) {
  const runtime: NodeRuntimeConfig = config.runtime || {}
  const execution = runtime.execution || {}
  const retry = runtime.retry || {}
  const onError = execution.onError || "stop"
  const retryEnabled = Boolean(retry.enabled)

  const updateRuntime = (nextRuntime: NodeRuntimeConfig) => {
    onConfigChange({
      ...config,
      runtime: nextRuntime,
    })
  }

  const updateExecution = (patch: Partial<NodeRuntimeConfig["execution"]>) => {
    updateRuntime({
      ...runtime,
      execution: {
        ...execution,
        ...patch,
      },
    })
  }

  const updateRetry = (patch: Partial<NodeRuntimeConfig["retry"]>) => {
    updateRuntime({
      ...runtime,
      retry: {
        ...retry,
        ...patch,
      },
    })
  }

  return (
    <details className="ui-disclosure rounded-md border border-hairline bg-surface-1/80">
      <summary className="cursor-pointer list-none px-2 py-2 ui-meta-text font-medium text-muted-foreground hover:text-foreground ui-motion-fast">
        Runtime Policy (Advanced)
      </summary>
      <div className="space-y-2 border-t border-hairline px-2 py-2">
        <div className="flex items-center gap-3">
          <Label htmlFor={`runtime-on-error-${nodeId}`} className="ui-meta-text text-muted-foreground">On error</Label>
          <Select
            value={onError}
            onValueChange={(v) => updateExecution({ onError: v as NodeOnErrorPolicy })}
          >
            <SelectTrigger id={`runtime-on-error-${nodeId}`} className="w-52 h-control-md text-body-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ON_ERROR_OPTIONS.map((value) => (
                <SelectItem key={value} value={value}>
                  {value}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center justify-between rounded-md border border-hairline bg-surface-2/50 px-2 py-1.5">
          <Label htmlFor={`runtime-retry-${nodeId}`} className="ui-meta-text text-muted-foreground">Retry on fail</Label>
          <Switch
            id={`runtime-retry-${nodeId}`}
            checked={retryEnabled}
            onCheckedChange={(checked) => updateRetry({
              enabled: checked,
              maxTries: retry.maxTries || 2,
              waitMs: retry.waitMs || 0,
              backoff: (retry.backoff || "none") as NodeRetryBackoff,
            })}
            aria-label="Toggle retry on failure"
          />
        </div>

        {retryEnabled && (
          <div className="space-y-2 rounded-md border border-hairline bg-surface-2/40 px-2 py-2">
            <div className="flex items-center gap-3">
              <Label htmlFor={`runtime-max-tries-${nodeId}`} className="ui-meta-text text-muted-foreground">Max tries</Label>
              <Input
                id={`runtime-max-tries-${nodeId}`}
                type="number"
                min={1}
                max={10}
                value={retry.maxTries || 2}
                onChange={(e) => updateRetry({ maxTries: Math.max(1, Number(e.target.value) || 1) })}
                className="w-16 h-control-sm px-2 text-body-sm text-center"
              />
            </div>

            <div className="flex items-center gap-3">
              <Label htmlFor={`runtime-wait-ms-${nodeId}`} className="ui-meta-text text-muted-foreground">Wait ms</Label>
              <Input
                id={`runtime-wait-ms-${nodeId}`}
                type="number"
                min={0}
                value={retry.waitMs || 0}
                onChange={(e) => updateRetry({ waitMs: Math.max(0, Number(e.target.value) || 0) })}
                className="w-24 h-control-sm px-2 text-body-sm text-center"
              />
            </div>

            <div className="flex items-center gap-3">
              <Label htmlFor={`runtime-backoff-${nodeId}`} className="ui-meta-text text-muted-foreground">Backoff</Label>
              <Select
                value={(retry.backoff || "none") as NodeRetryBackoff}
                onValueChange={(v) => updateRetry({ backoff: v as NodeRetryBackoff })}
              >
                <SelectTrigger id={`runtime-backoff-${nodeId}`} className="w-36 h-control-md text-body-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">none</SelectItem>
                  <SelectItem value="linear">linear</SelectItem>
                  <SelectItem value="exponential">exponential</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <ToolArrayEditor
              nodeId={`runtime-retry-on-${nodeId}`}
              label="Retry on"
              values={(retry.retryOn || []) as string[]}
              onChange={(next) => {
                const parsed = (next || [])
                  .map((token) => token.toLowerCase())
                  .filter((token): token is ErrorKind => RETRY_ERROR_KINDS.includes(token as ErrorKind))
                updateRetry({ retryOn: parsed.length > 0 ? parsed : undefined })
              }}
              placeholder="tool, model, timeout"
              normalizeValue={(value) => {
                const normalized = value.toLowerCase()
                return RETRY_ERROR_KINDS.includes(normalized as ErrorKind) ? normalized : null
              }}
            />
            <p className="ui-meta-text text-muted-foreground">
              Allowed: {RETRY_ERROR_KINDS.join(", ")}
            </p>
          </div>
        )}
      </div>
    </details>
  )
}

function ToolArrayEditor({
  nodeId,
  label,
  values,
  onChange,
  placeholder,
  normalizeValue,
}: {
  nodeId: string
  label: string
  values: string[]
  onChange: (next: string[] | undefined) => void
  placeholder: string
  normalizeValue?: (value: string) => string | null
}) {
  const [draft, setDraft] = useState("")

  const normalizedValues = values.filter(Boolean)
  const commitDraft = () => {
    const trimmed = draft.trim()
    if (!trimmed) return
    const normalized = normalizeValue ? normalizeValue(trimmed) : trimmed
    if (!normalized) return
    const next = [...new Set([...normalizedValues, normalized])]
    onChange(next.length > 0 ? next : undefined)
    setDraft("")
  }

  const removeValue = (value: string) => {
    const next = normalizedValues.filter((item) => item !== value)
    onChange(next.length > 0 ? next : undefined)
  }

  return (
    <div>
      <Label htmlFor={`${nodeId}-${label.toLowerCase().replace(/\s+/g, "-")}`} className="ui-meta-text text-muted-foreground mb-1 block">
        {label}
      </Label>
      {normalizedValues.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {normalizedValues.map((tool) => (
            <Badge key={tool} variant="secondary" className="inline-flex items-center gap-1 px-2 py-0.5">
              <span className="font-mono">{tool}</span>
              <button
                type="button"
                className="rounded-sm p-0.5 hover:bg-surface-3"
                onClick={() => removeValue(tool)}
                aria-label={`Remove ${tool}`}
              >
                <X size={10} />
              </button>
            </Badge>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2">
        <Input
          id={`${nodeId}-${label.toLowerCase().replace(/\s+/g, "-")}`}
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return
            e.preventDefault()
            commitDraft()
          }}
          placeholder={placeholder}
          className="h-control-md font-mono text-body-sm"
        />
        <Button type="button" variant="outline" size="sm" onClick={commitDraft}>
          <Plus size={12} />
          Add
        </Button>
      </div>
    </div>
  )
}

interface NodeCardProps {
  node: WorkflowNode
  index: number
  total: number
  state?: NodeState
  isActive: boolean
  onRemove: () => void
  onMoveUp: () => void
  onMoveDown: () => void
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
  onRemove,
  onMoveUp,
  onMoveDown,
  onConfigChange,
  onSelect,
  resolveNodeLabel,
}: NodeCardProps) {
  const [expanded, setExpanded] = useState(false)
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
  const TYPE_ICON_CLASSES: Record<string, string> = {
    input: "border-status-info/30 bg-status-info/10 text-status-info",
    output: "border-hairline bg-surface-2/80 text-muted-foreground",
    skill: "border-foreground/20 bg-foreground/10 text-foreground/80",
    evaluator: "border-status-warning/30 bg-status-warning/10 text-status-warning",
    splitter: "border-foreground/20 bg-foreground/10 text-foreground/80",
    merger: "border-foreground/20 bg-foreground/10 text-foreground/80",
    approval: "border-status-warning/30 bg-status-warning/10 text-status-warning",
  }
  const statusLabel = state?.status ? STATUS_LABELS[state.status] || state.status : null
  const statusClass = state?.status ? (STATUS_CLASSES[state.status] ?? "") : ""

  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-surface-1 overflow-hidden transition-[border-color,box-shadow] ui-motion-fast ui-elevation-base",
        isActive && "ring-2 ring-primary/20",
        statusClass,
      )}
    >
      {/* Header */}
      <div className="group flex items-start gap-3 bg-gradient-to-b from-surface-1 to-surface-2/60 px-3 py-2.5">
        <Button
          type="button"
          onClick={onSelect}
          variant="ghost"
          size="auto"
          className="!h-auto min-w-0 flex-1 justify-start items-start gap-2 rounded-md border-transparent p-0 text-left whitespace-normal hover:bg-transparent hover:border-transparent focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring/70"
          aria-label={`Select node ${title}`}
        >
          <div
            className={cn(
              "h-control-sm w-control-sm shrink-0 rounded-md border flex items-center justify-center ui-elevation-inset mt-0.5",
              TYPE_ICON_CLASSES[node.type] || "border-hairline bg-surface-1 text-muted-foreground",
            )}
          >
            <Icon
              size={14}
              className="flex-shrink-0"
            />
          </div>

          <div className="flex-1 min-w-0 space-y-1 pt-0.5">
            <span className="block text-body-md font-medium truncate">{title}</span>
            {isSkill && !expanded && skillConfig?.prompt && (
              <p className="ui-meta-text text-muted-foreground truncate">
                {skillConfig.prompt.slice(0, 80)}
                {skillConfig.prompt.length > 80 ? "..." : ""}
              </p>
            )}
            {isEvaluator && !expanded && evalConfig && (
              <p className="ui-meta-text text-muted-foreground truncate">
                Threshold: {evalConfig.threshold}/10 · Max {evalConfig.maxRetries} retries
                {retryLabel ? ` · Retry: ${retryLabel}` : ""}
              </p>
            )}
            {isSplitter && !expanded && splitterConfig && (
              <p className="ui-meta-text text-muted-foreground truncate">
                Max {splitterConfig.maxBranches || 8} branches
              </p>
            )}
            {isMerger && !expanded && mergerConfig && (
              <p className="ui-meta-text text-muted-foreground truncate">
                Strategy: {mergerConfig.strategy}
              </p>
            )}
            {isInput && !expanded && inputConfig && (
              <p className="ui-meta-text text-muted-foreground truncate">
                {inputConfig.required === false ? "Optional" : "Required"} · {inputConfig.inputType || "auto"} input
              </p>
            )}
            {isOutput && !expanded && outputConfig && (
              <p className="ui-meta-text text-muted-foreground truncate">
                Format: {outputConfig.format || "markdown"}
              </p>
            )}
            {isApproval && !expanded && approvalConfig && (
              <p className="ui-meta-text text-muted-foreground truncate">
                {approvalConfig.message || "Manual approval gate"}
              </p>
            )}
            {statusLabel && statusLabel !== "pending" && (
              <div className="ui-badge-row pt-0.5">
                <Badge variant="outline" className="px-1.5 py-0 ui-meta-text text-muted-foreground">
                  {statusLabel}
                </Badge>
              </div>
            )}
          </div>
        </Button>

        {/* Move/remove buttons — only for non-terminal nodes */}
        {!isTerminal && (
          <div className="flex items-center gap-1 pt-0.5 opacity-60 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  aria-label="Move node up"
                  onClick={(e) => {
                    e.stopPropagation()
                    onMoveUp()
                  }}
                  disabled={index <= 1}
                  variant="ghost"
                  size="icon"
                  className="h-control-sm w-control-sm ui-pressable rounded-md text-muted-foreground hover:bg-surface-3 disabled:text-muted-foreground/70"
                >
                  <ArrowUp size={12} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Move up</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  aria-label="Move node down"
                  onClick={(e) => {
                    e.stopPropagation()
                    onMoveDown()
                  }}
                  disabled={index >= total - 2}
                  variant="ghost"
                  size="icon"
                  className="h-control-sm w-control-sm ui-pressable rounded-md text-muted-foreground hover:bg-surface-3 disabled:text-muted-foreground/70"
                >
                  <ArrowDown size={12} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Move down</TooltipContent>
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
                  className="h-control-sm w-control-sm ui-pressable rounded-md text-muted-foreground hover:bg-destructive/20 hover:text-destructive"
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
            className="h-control-sm w-control-sm mt-0.5 ui-pressable rounded-md text-muted-foreground hover:bg-surface-3"
            aria-label={expanded ? "Collapse node settings" : "Expand node settings"}
            aria-expanded={expanded}
          >
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </Button>
        )}
      </div>

      {/* Screen reader status announcement */}
      {(state?.status === "completed" || state?.status === "failed") && (
        <span className="sr-only" aria-live="polite">
          {title} {state.status === "completed" ? "completed" : "failed"}
        </span>
      )}

      {/* Expanded editor — input node */}
      {isInput && expanded && inputConfig && (
        <div className="ui-fade-slide-in px-3 pb-3 border-t border-border pt-2.5 space-y-2 bg-surface-2/50">
          <div className="flex items-center gap-3">
            <Label htmlFor={`input-type-${node.id}`} className="ui-meta-text text-muted-foreground">Input Type</Label>
            <Select
              value={inputConfig.inputType || "auto"}
              onValueChange={(value) =>
                onConfigChange({
                  ...inputConfig,
                  inputType: value as InputNodeConfig["inputType"],
                })
              }
            >
              <SelectTrigger id={`input-type-${node.id}`} className="w-36 h-control-md text-body-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Auto detect</SelectItem>
                <SelectItem value="text">Text</SelectItem>
                <SelectItem value="url">URL</SelectItem>
                <SelectItem value="directory">Directory</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between rounded-md border border-hairline bg-surface-1/80 px-2 py-2">
            <Label htmlFor={`input-required-${node.id}`} className="ui-meta-text text-muted-foreground">
              Input required
            </Label>
            <Switch
              checked={inputConfig.required ?? true}
              onCheckedChange={(checked) =>
                onConfigChange({
                  ...inputConfig,
                  required: checked,
                })
              }
              aria-label="Toggle input required"
            />
          </div>

          <div>
            <Label htmlFor={`input-placeholder-${node.id}`} className="ui-meta-text text-muted-foreground mb-1 block">
              Placeholder
            </Label>
            <Input
              id={`input-placeholder-${node.id}`}
              type="text"
              value={inputConfig.placeholder || ""}
              onChange={(e) => onConfigChange({ ...inputConfig, placeholder: e.target.value })}
              placeholder="Shown in the run input field"
              className="h-control-md text-body-sm"
            />
          </div>

          <div>
            <Label htmlFor={`input-default-${node.id}`} className="ui-meta-text text-muted-foreground mb-1 block">
              Default value
            </Label>
            <Textarea
              id={`input-default-${node.id}`}
              value={inputConfig.defaultValue || ""}
              onChange={(e) => onConfigChange({ ...inputConfig, defaultValue: e.target.value })}
              rows={3}
              className="min-h-[72px] resize-y font-mono text-body-sm"
              placeholder="Used when input is empty and the node is optional."
            />
          </div>
        </div>
      )}

      {/* Expanded editor — output node */}
      {isOutput && expanded && outputConfig && (
        <div className="ui-fade-slide-in px-3 pb-3 border-t border-border pt-2.5 space-y-2 bg-surface-2/50">
          <div>
            <Label htmlFor={`output-title-${node.id}`} className="ui-meta-text text-muted-foreground mb-1 block">
              Output title
            </Label>
            <Input
              id={`output-title-${node.id}`}
              type="text"
              value={outputConfig.title || ""}
              onChange={(e) => onConfigChange({ ...outputConfig, title: e.target.value })}
              placeholder="Optional title for the output node"
              className="h-control-md text-body-sm"
            />
          </div>
          <div className="flex items-center gap-3">
            <Label htmlFor={`output-format-${node.id}`} className="ui-meta-text text-muted-foreground">Format</Label>
            <Select
              value={outputConfig.format || "markdown"}
              onValueChange={(value) =>
                onConfigChange({
                  ...outputConfig,
                  format: value as OutputNodeConfig["format"],
                })
              }
            >
              <SelectTrigger id={`output-format-${node.id}`} className="w-40 h-control-md text-body-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="markdown">Markdown</SelectItem>
                <SelectItem value="text">Plain text</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {/* Expanded editor — skill nodes */}
      {isSkill && expanded && skillConfig && (
        <div className="ui-fade-slide-in px-3 pb-3 border-t border-border pt-2.5 space-y-2 bg-surface-2/50">
          <div>
            <Label htmlFor={`skill-ref-${node.id}`} className="ui-meta-text text-muted-foreground mb-1 block">
              Skill reference
            </Label>
            <Input
              id={`skill-ref-${node.id}`}
              type="text"
              value={skillConfig.skillRef || ""}
              onChange={(e) =>
                onConfigChange({ ...skillConfig, skillRef: e.target.value })
              }
              placeholder="category/skill-name"
              className="h-control-md font-mono text-body-sm"
            />
          </div>

          <div className="flex items-center gap-3">
            <Label htmlFor={`model-${node.id}`} className="ui-meta-text text-muted-foreground">Model</Label>
            <Select
              value={skillConfig.model || "sonnet"}
              onValueChange={(v) =>
                onConfigChange({ ...skillConfig, model: v as SkillNodeConfig["model"] })
              }
            >
              <SelectTrigger id={`model-${node.id}`} className="w-36 h-control-md text-body-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sonnet">Sonnet</SelectItem>
                <SelectItem value="opus">Opus</SelectItem>
                <SelectItem value="haiku">Haiku</SelectItem>
              </SelectContent>
            </Select>

            <Label htmlFor={`skill-output-mode-${node.id}`} className="ui-meta-text text-muted-foreground">Output</Label>
            <Select
              value={skillConfig.outputMode || "auto"}
              onValueChange={(value) =>
                onConfigChange({
                  ...skillConfig,
                  outputMode: value as SkillNodeConfig["outputMode"],
                })
              }
            >
              <SelectTrigger id={`skill-output-mode-${node.id}`} className="w-36 h-control-md text-body-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Auto</SelectItem>
                <SelectItem value="stdout">Stdout</SelectItem>
                <SelectItem value="content_file">content.md</SelectItem>
              </SelectContent>
            </Select>

            <Label htmlFor={`skill-max-turns-${node.id}`} className="ui-meta-text text-muted-foreground">Turns</Label>
            <Input
              id={`skill-max-turns-${node.id}`}
              type="number"
              min={1}
              max={200}
              value={skillConfig.maxTurns ?? ""}
              onChange={(e) => {
                const value = e.target.value.trim()
                onConfigChange({
                  ...skillConfig,
                  maxTurns: value ? Math.max(1, Number(value) || 1) : undefined,
                })
              }}
              className="w-20 h-control-sm px-2 text-body-sm text-center"
            />
          </div>

          <div>
            <Label htmlFor={`prompt-${node.id}`} className="ui-meta-text text-muted-foreground mb-1 block">
              Prompt
            </Label>
            <Textarea
              id={`prompt-${node.id}`}
              value={skillConfig.prompt || ""}
              onChange={(e) =>
                onConfigChange({ ...skillConfig, prompt: e.target.value })
              }
              rows={4}
              className="min-h-[96px] resize-y font-mono text-body-sm"
              placeholder="Enter prompt for this skill..."
            />
          </div>

          <div className="rounded-md border border-hairline bg-surface-1/80 px-2 py-2 space-y-2">
            <p className="ui-meta-text font-medium text-muted-foreground">Tool Access</p>
            <ToolArrayEditor
              nodeId={`${node.id}-allowed`}
              label="Allowed Tools"
              values={skillConfig.allowedTools || []}
              onChange={(next) => onConfigChange({ ...skillConfig, allowedTools: next })}
              placeholder="e.g. mcp__exa__web_search_exa"
            />
            <ToolArrayEditor
              nodeId={`${node.id}-blocked`}
              label="Blocked Tools"
              values={skillConfig.disallowedTools || []}
              onChange={(next) => onConfigChange({ ...skillConfig, disallowedTools: next })}
              placeholder="e.g. Edit"
            />
          </div>

          <RuntimePolicyEditor
            nodeId={node.id}
            config={skillConfig}
            onConfigChange={onConfigChange}
          />
        </div>
      )}

      {/* Expanded editor — evaluator nodes */}
      {isEvaluator && expanded && evalConfig && (
        <div className="ui-fade-slide-in px-3 pb-3 border-t border-border pt-2.5 space-y-2 bg-surface-2/50">
          <div>
            <Label htmlFor={`criteria-${node.id}`} className="ui-meta-text text-muted-foreground mb-1 block">Criteria</Label>
            <Textarea
              id={`criteria-${node.id}`}
              value={evalConfig.criteria || ""}
              onChange={(e) => onConfigChange({ ...evalConfig, criteria: e.target.value })}
              rows={3}
              className="min-h-[84px] resize-y font-mono text-body-sm"
              placeholder="Score 1-10 on clarity, engagement, CTA strength..."
            />
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Label htmlFor={`threshold-${node.id}`} className="ui-meta-text text-muted-foreground">Threshold</Label>
              <ClampedNumberInput
                id={`threshold-${node.id}`}
                min={1}
                max={10}
                value={evalConfig.threshold}
                onChange={(v) =>
                  onConfigChange({ ...evalConfig, threshold: v })
                }
                className="w-16 h-control-sm px-2 text-body-sm text-center"
              />
              <span className="ui-meta-text text-muted-foreground">/10</span>
            </div>

            <div className="flex items-center gap-2">
              <Label htmlFor={`max-retries-${node.id}`} className="ui-meta-text text-muted-foreground">Max Retries</Label>
              <ClampedNumberInput
                id={`max-retries-${node.id}`}
                min={1}
                max={10}
                value={evalConfig.maxRetries}
                onChange={(v) =>
                  onConfigChange({ ...evalConfig, maxRetries: v })
                }
                className="w-16 h-control-sm px-2 text-body-sm text-center"
              />
            </div>
          </div>

          <RuntimePolicyEditor
            nodeId={node.id}
            config={evalConfig}
            onConfigChange={onConfigChange}
          />
        </div>
      )}

      {/* Expanded editor — splitter nodes */}
      {isSplitter && expanded && splitterConfig && (
        <div className="ui-fade-slide-in px-3 pb-3 border-t border-border pt-2.5 space-y-2 bg-surface-2/50">
          <div className="flex items-center gap-3">
            <Label htmlFor={`splitter-model-${node.id}`} className="ui-meta-text text-muted-foreground">Model</Label>
            <Select
              value={splitterConfig.model || "sonnet"}
              onValueChange={(v) =>
                onConfigChange({ ...splitterConfig, model: v as SplitterNodeConfig["model"] })
              }
            >
              <SelectTrigger id={`splitter-model-${node.id}`} className="w-36 h-control-md text-body-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sonnet">Sonnet</SelectItem>
                <SelectItem value="opus">Opus</SelectItem>
                <SelectItem value="haiku">Haiku</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor={`split-strategy-${node.id}`} className="ui-meta-text text-muted-foreground mb-1 block">Decomposition Strategy</Label>
            <Textarea
              id={`split-strategy-${node.id}`}
              value={splitterConfig.strategy || ""}
              onChange={(e) => onConfigChange({ ...splitterConfig, strategy: e.target.value })}
              rows={2}
              className="min-h-[72px] resize-y font-mono text-body-sm"
              placeholder="e.g. Split by page section, Split by topic..."
            />
            <p className="mt-1 ui-meta-text text-muted-foreground">
              Describe how to break work into independent subtasks. Clear strategy = more stable fan-out.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Label htmlFor={`max-branches-${node.id}`} className="ui-meta-text text-muted-foreground">Max branches</Label>
            <Input
              id={`max-branches-${node.id}`}
              type="number"
              value={splitterConfig.maxBranches || 8}
              onChange={(e) => onConfigChange({ ...splitterConfig, maxBranches: parseInt(e.target.value) || 8 })}
              className="w-20 h-control-md px-2 py-1 text-body-sm text-center"
              min={1}
              max={20}
            />
          </div>

          <RuntimePolicyEditor
            nodeId={node.id}
            config={splitterConfig}
            onConfigChange={onConfigChange}
          />
        </div>
      )}

      {/* Expanded editor — merger nodes */}
      {isMerger && expanded && mergerConfig && (
        <div className="ui-fade-slide-in px-3 pb-3 border-t border-border pt-2.5 space-y-2 bg-surface-2/50">
          <div className="flex items-center gap-3">
            <Label htmlFor={`merger-strategy-${node.id}`} className="ui-meta-text text-muted-foreground">Strategy</Label>
            <Select
              value={mergerConfig.strategy}
              onValueChange={(v) => onConfigChange({ ...mergerConfig, strategy: v })}
            >
              <SelectTrigger id={`merger-strategy-${node.id}`} className="w-40 h-control-md text-body-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="concatenate">Concatenate</SelectItem>
                <SelectItem value="summarize">Summarize</SelectItem>
                <SelectItem value="select_best">Select Best</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <p className="ui-meta-text text-muted-foreground">
            {mergerConfig.strategy === "concatenate" && "Concatenate keeps all branch outputs in order without rewriting."}
            {mergerConfig.strategy === "summarize" && "Summarize compresses all branch outputs into a shorter synthesis."}
            {mergerConfig.strategy === "select_best" && "Select best picks a single strongest branch output."}
          </p>
          {mergerConfig.strategy !== "concatenate" && (
            <div>
              <Label htmlFor={`merge-prompt-${node.id}`} className="ui-meta-text text-muted-foreground mb-1 block">Merge Instructions</Label>
              <Textarea
                id={`merge-prompt-${node.id}`}
                value={mergerConfig.prompt || ""}
                onChange={(e) => onConfigChange({ ...mergerConfig, prompt: e.target.value })}
                rows={2}
                className="min-h-[72px] resize-y font-mono text-body-sm"
                placeholder="How to combine the results..."
              />
            </div>
          )}

          <RuntimePolicyEditor
            nodeId={node.id}
            config={mergerConfig}
            onConfigChange={onConfigChange}
          />
        </div>
      )}

      {/* Expanded editor — approval nodes */}
      {isApproval && expanded && approvalConfig && (
        <div className="ui-fade-slide-in px-3 pb-3 border-t border-border pt-2.5 space-y-2 bg-surface-2/50">
          <div>
            <Label htmlFor={`approval-message-${node.id}`} className="ui-meta-text text-muted-foreground mb-1 block">
              Message
            </Label>
            <Textarea
              id={`approval-message-${node.id}`}
              value={approvalConfig.message || ""}
              onChange={(e) => onConfigChange({ ...approvalConfig, message: e.target.value })}
              rows={3}
              className="min-h-[72px] resize-y font-mono text-body-sm"
              placeholder="Optional instructions shown to the reviewer..."
            />
          </div>
          <div className="space-y-2 rounded-md border border-hairline bg-surface-1/80 px-2 py-2">
            <div className="flex items-center justify-between">
              <Label htmlFor={`approval-show-content-${node.id}`} className="ui-meta-text text-muted-foreground">
                Show content for review
              </Label>
              <Switch
                checked={approvalConfig.show_content}
                onCheckedChange={(checked) => onConfigChange({ ...approvalConfig, show_content: checked })}
                aria-label="Toggle content visibility in approval dialog"
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor={`approval-allow-edit-${node.id}`} className="ui-meta-text text-muted-foreground">
                Allow content edits
              </Label>
              <Switch
                checked={approvalConfig.allow_edit}
                onCheckedChange={(checked) => onConfigChange({ ...approvalConfig, allow_edit: checked })}
                aria-label="Toggle editing before approval"
              />
            </div>
          </div>

          <RuntimePolicyEditor
            nodeId={node.id}
            config={approvalConfig}
            onConfigChange={onConfigChange}
          />
        </div>
      )}
    </div>
  )
}
