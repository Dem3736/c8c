import { useState } from "react"
import type {
  InputNodeConfig,
  OutputNodeConfig,
  SkillNodeConfig,
  EvaluatorNodeConfig,
  SplitterNodeConfig,
  MergerNodeConfig,
  ApprovalNodeConfig,
  HumanNodeConfig,
} from "@shared/types"
import type { ErrorKind, NodeOnErrorPolicy, NodeRetryBackoff, NodeRuntimeConfig } from "@shared/types"
import { X, Plus } from "lucide-react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { TextareaWithMention } from "@/components/input/TextareaWithMention"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { SkillRefInput } from "@/components/ui/skill-ref-input"
import { McpToolPicker } from "@/components/ui/mcp-tool-picker"

// ── Shared constants & helpers ──────────────────────────────

const ON_ERROR_OPTIONS: NodeOnErrorPolicy[] = ["stop", "continue", "continue_error_output"]
const RETRY_ERROR_KINDS: ErrorKind[] = ["tool", "model", "timeout", "policy", "unknown"]

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

// ── Shared sub-components ───────────────────────────────────

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

function OptionalClampedNumberInput({
  value, min, max, onChange, ...props
}: {
  value: number | undefined
  min: number
  max: number
  onChange: (v: number | undefined) => void
} & Omit<React.ComponentProps<typeof Input>, "value" | "onChange">) {
  const [local, setLocal] = useState<string | null>(null)

  return (
    <Input
      {...props}
      type="number"
      min={min}
      max={max}
      value={local ?? (value ?? "")}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={() => {
        if (local === null) return
        const trimmed = local.trim()
        if (!trimmed) {
          onChange(undefined)
          setLocal(null)
          return
        }
        const parsed = parseInt(trimmed, 10)
        onChange(isNaN(parsed) ? value : clampNumber(parsed, min, max))
        setLocal(null)
      }}
    />
  )
}

export function ToolArrayEditor({
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
                className="ui-icon-button shrink-0 rounded-sm"
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

type RuntimeConfigurableNodeConfig =
  | SkillNodeConfig
  | EvaluatorNodeConfig
  | SplitterNodeConfig
  | MergerNodeConfig
  | ApprovalNodeConfig
  | HumanNodeConfig

export function RuntimePolicyEditor({
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
    <details className="ui-disclosure rounded-md surface-soft">
      <summary className="cursor-pointer list-none px-2 py-2 ui-meta-label text-muted-foreground hover:text-foreground ui-transition-colors ui-motion-fast">
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

        <div className="surface-inset-card flex items-center justify-between px-2 py-1.5">
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
          <div className="surface-inset-card space-y-2 px-2 py-2">
            <div className="flex items-center gap-3">
              <Label htmlFor={`runtime-max-tries-${nodeId}`} className="ui-meta-text text-muted-foreground">Max tries</Label>
              <ClampedNumberInput
                id={`runtime-max-tries-${nodeId}`}
                min={1}
                max={10}
                value={retry.maxTries || 2}
                onChange={(v) => updateRetry({ maxTries: v })}
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

// ── Node-type editors ───────────────────────────────────────

export function InputNodeEditor({ nodeId, config, onConfigChange }: {
  nodeId: string
  config: InputNodeConfig
  onConfigChange: (config: InputNodeConfig) => void
}) {
  return (
    <div className="ui-fade-slide-in border-t border-hairline px-3 pb-3 pt-2.5 space-y-2 surface-soft">
      <div className="flex items-center gap-3">
        <Label htmlFor={`input-type-${nodeId}`} className="ui-meta-text text-muted-foreground">Input Type</Label>
        <Select
          value={config.inputType || "auto"}
          onValueChange={(value) =>
            onConfigChange({ ...config, inputType: value as InputNodeConfig["inputType"] })
          }
        >
          <SelectTrigger id={`input-type-${nodeId}`} className="w-36 h-control-md text-body-sm">
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

      <div className="surface-inset-card flex items-center justify-between px-2 py-2">
        <Label htmlFor={`input-required-${nodeId}`} className="ui-meta-text text-muted-foreground">
          Input required
        </Label>
        <Switch
          id={`input-required-${nodeId}`}
          checked={config.required ?? true}
          onCheckedChange={(checked) => onConfigChange({ ...config, required: checked })}
          aria-label="Toggle input required"
        />
      </div>

      {config.required === false && (
        <div>
          <Label htmlFor={`input-default-${nodeId}`} className="ui-meta-text text-muted-foreground mb-1 block">
            Default value
          </Label>
          <TextareaWithMention
            id={`input-default-${nodeId}`}
            value={config.defaultValue || ""}
            onChange={(e) => onConfigChange({ ...config, defaultValue: e.target.value })}
            rows={3}
            className="min-h-20 resize-y font-mono text-body-sm"
            placeholder="Used when input is empty and the node is optional."
          />
        </div>
      )}

      <div>
        <Label htmlFor={`input-placeholder-${nodeId}`} className="ui-meta-text text-muted-foreground mb-1 block">
          Placeholder
        </Label>
        <Input
          id={`input-placeholder-${nodeId}`}
          type="text"
          value={config.placeholder || ""}
          onChange={(e) => onConfigChange({ ...config, placeholder: e.target.value })}
          placeholder="Shown in the run input field"
          className="h-control-md text-body-sm"
        />
      </div>
    </div>
  )
}

export function OutputNodeEditor({ nodeId, config, onConfigChange }: {
  nodeId: string
  config: OutputNodeConfig
  onConfigChange: (config: OutputNodeConfig) => void
}) {
  return (
    <div className="ui-fade-slide-in border-t border-hairline px-3 pb-3 pt-2.5 space-y-2 surface-soft">
      <div>
        <Label htmlFor={`output-title-${nodeId}`} className="ui-meta-text text-muted-foreground mb-1 block">
          Output title
        </Label>
        <Input
          id={`output-title-${nodeId}`}
          type="text"
          value={config.title || ""}
          onChange={(e) => onConfigChange({ ...config, title: e.target.value })}
          placeholder="Optional title for the output node"
          className="h-control-md text-body-sm"
        />
      </div>
      <div className="flex items-center gap-3">
        <Label htmlFor={`output-format-${nodeId}`} className="ui-meta-text text-muted-foreground">Format</Label>
        <Select
          value={config.format || "markdown"}
          onValueChange={(value) =>
            onConfigChange({ ...config, format: value as OutputNodeConfig["format"] })
          }
        >
          <SelectTrigger id={`output-format-${nodeId}`} className="w-40 h-control-md text-body-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="markdown">Markdown</SelectItem>
            <SelectItem value="text">Plain text</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}

export function SkillNodeEditor({ nodeId, config, onConfigChange }: {
  nodeId: string
  config: SkillNodeConfig
  onConfigChange: (config: SkillNodeConfig) => void
}) {
  return (
    <div className="ui-fade-slide-in border-t border-hairline px-3 pb-3 pt-2.5 space-y-2 surface-soft">
      <div>
        <Label htmlFor={`skill-ref-${nodeId}`} className="ui-meta-text text-muted-foreground mb-1 block">
          Skill reference
        </Label>
        <SkillRefInput
          id={`skill-ref-${nodeId}`}
          value={config.skillRef || ""}
          onChange={(v) => onConfigChange({ ...config, skillRef: v })}
          placeholder="category/skill-name"
          className="h-control-md font-mono text-body-sm"
        />
      </div>

      <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
        <div className="space-y-1">
          <Label htmlFor={`skill-output-mode-${nodeId}`} className="ui-meta-text text-muted-foreground">Output</Label>
          <Select
            value={config.outputMode || "auto"}
            onValueChange={(value) =>
              onConfigChange({ ...config, outputMode: value as SkillNodeConfig["outputMode"] })
            }
          >
            <SelectTrigger id={`skill-output-mode-${nodeId}`} className="w-full h-control-md text-body-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">Auto</SelectItem>
              <SelectItem value="stdout">Stdout</SelectItem>
              <SelectItem value="content_file">content.md</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label htmlFor={`skill-max-turns-${nodeId}`} className="ui-meta-text text-muted-foreground">Turns</Label>
          <OptionalClampedNumberInput
            id={`skill-max-turns-${nodeId}`}
            min={1}
            max={200}
            value={config.maxTurns}
            onChange={(value) => onConfigChange({ ...config, maxTurns: value })}
            className="w-full h-control-md px-3 text-body-sm"
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor={`skill-permission-mode-${nodeId}`} className="ui-meta-text text-muted-foreground">Mode</Label>
          <Select
            value={config.permissionMode || "__inherit__"}
            onValueChange={(value) =>
              onConfigChange({
                ...config,
                permissionMode: value === "__inherit__" ? undefined : value as SkillNodeConfig["permissionMode"],
              })
            }
          >
            <SelectTrigger id={`skill-permission-mode-${nodeId}`} className="w-full h-control-md text-body-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__inherit__">Inherit</SelectItem>
              <SelectItem value="plan">Plan</SelectItem>
              <SelectItem value="edit">Edit</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <p className="ui-meta-text text-muted-foreground">
        Provider and model are controlled from the flow Input step.
      </p>

      <div>
        <Label htmlFor={`prompt-${nodeId}`} className="ui-meta-text text-muted-foreground mb-1 block">
          Prompt
        </Label>
        <TextareaWithMention
          id={`prompt-${nodeId}`}
          value={config.prompt || ""}
          onChange={(e) => onConfigChange({ ...config, prompt: e.target.value })}
          rows={4}
          className="min-h-24 resize-y font-mono text-body-sm"
          placeholder="Enter prompt for this skill..."
        />
      </div>

      <div className="surface-inset-card px-2 py-2 space-y-2">
        <p className="ui-meta-label text-muted-foreground">Tool Access</p>
        <McpToolPicker
          nodeId={`${nodeId}-allowed`}
          label="Allowed Tools"
          values={config.allowedTools || []}
          onChange={(next) => onConfigChange({ ...config, allowedTools: next })}
          placeholder="e.g. mcp__exa__web_search_exa"
        />
        <McpToolPicker
          nodeId={`${nodeId}-blocked`}
          label="Blocked Tools"
          values={config.disallowedTools || []}
          onChange={(next) => onConfigChange({ ...config, disallowedTools: next })}
          placeholder="e.g. Edit"
        />
      </div>

      <RuntimePolicyEditor nodeId={nodeId} config={config} onConfigChange={onConfigChange as (next: RuntimeConfigurableNodeConfig) => void} />
    </div>
  )
}

export function EvaluatorNodeEditor({ nodeId, config, onConfigChange }: {
  nodeId: string
  config: EvaluatorNodeConfig
  onConfigChange: (config: EvaluatorNodeConfig) => void
}) {
  return (
    <div className="ui-fade-slide-in border-t border-hairline px-3 pb-3 pt-2.5 space-y-2 surface-soft">
      <div>
        <Label htmlFor={`criteria-${nodeId}`} className="ui-meta-text text-muted-foreground mb-1 block">Criteria</Label>
        <TextareaWithMention
          id={`criteria-${nodeId}`}
          value={config.criteria || ""}
          onChange={(e) => onConfigChange({ ...config, criteria: e.target.value })}
          rows={3}
          className="min-h-20 resize-y font-mono text-body-sm"
          placeholder="Score 1-10 on clarity, engagement, CTA strength..."
        />
      </div>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Label htmlFor={`threshold-${nodeId}`} className="ui-meta-text text-muted-foreground">Threshold</Label>
          <ClampedNumberInput
            id={`threshold-${nodeId}`}
            min={1}
            max={10}
            value={config.threshold}
            onChange={(v) => onConfigChange({ ...config, threshold: v })}
            className="w-16 h-control-sm px-2 text-body-sm text-center"
          />
          <span className="ui-meta-text text-muted-foreground">/10</span>
        </div>

        <div className="flex items-center gap-2">
          <Label htmlFor={`max-retries-${nodeId}`} className="ui-meta-text text-muted-foreground">Max Retries</Label>
          <ClampedNumberInput
            id={`max-retries-${nodeId}`}
            min={1}
            max={10}
            value={config.maxRetries}
            onChange={(v) => onConfigChange({ ...config, maxRetries: v })}
            className="w-16 h-control-sm px-2 text-body-sm text-center"
          />
        </div>
      </div>

      <RuntimePolicyEditor nodeId={nodeId} config={config} onConfigChange={onConfigChange as (next: RuntimeConfigurableNodeConfig) => void} />
    </div>
  )
}

export function SplitterNodeEditor({ nodeId, config, onConfigChange }: {
  nodeId: string
  config: SplitterNodeConfig
  onConfigChange: (config: SplitterNodeConfig) => void
}) {
  return (
    <div className="ui-fade-slide-in border-t border-hairline px-3 pb-3 pt-2.5 space-y-2 surface-soft">
      <div>
        <Label htmlFor={`split-strategy-${nodeId}`} className="ui-meta-text text-muted-foreground mb-1 block">Decomposition Strategy</Label>
        <TextareaWithMention
          id={`split-strategy-${nodeId}`}
          value={config.strategy || ""}
          onChange={(e) => onConfigChange({ ...config, strategy: e.target.value })}
          rows={2}
          className="min-h-20 resize-y font-mono text-body-sm"
          placeholder="e.g. Split by page section, Split by topic..."
        />
        <p className="mt-1 ui-meta-text text-muted-foreground">
          Describe how to break work into independent subtasks. Clear strategy = more stable fan-out.
        </p>
      </div>
      <p className="ui-meta-text text-muted-foreground">
        Provider and model are controlled from the flow Input step.
      </p>
      <div className="flex items-center gap-3">
        <Label htmlFor={`max-branches-${nodeId}`} className="ui-meta-text text-muted-foreground">Max branches</Label>
        <ClampedNumberInput
          id={`max-branches-${nodeId}`}
          min={1}
          max={20}
          value={config.maxBranches || 8}
          onChange={(v) => onConfigChange({ ...config, maxBranches: v })}
          className="w-20 h-control-md px-2 py-1 text-body-sm text-center"
        />
      </div>

      <RuntimePolicyEditor nodeId={nodeId} config={config} onConfigChange={onConfigChange as (next: RuntimeConfigurableNodeConfig) => void} />
    </div>
  )
}

export function MergerNodeEditor({ nodeId, config, onConfigChange }: {
  nodeId: string
  config: MergerNodeConfig
  onConfigChange: (config: MergerNodeConfig) => void
}) {
  return (
    <div className="ui-fade-slide-in border-t border-hairline px-3 pb-3 pt-2.5 space-y-2 surface-soft">
      <div className="flex items-center gap-3">
        <Label htmlFor={`merger-strategy-${nodeId}`} className="ui-meta-text text-muted-foreground">Strategy</Label>
        <Select
          value={config.strategy}
          onValueChange={(v) => onConfigChange({ ...config, strategy: v as MergerNodeConfig["strategy"] })}
        >
          <SelectTrigger id={`merger-strategy-${nodeId}`} className="w-40 h-control-md text-body-sm">
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
        {config.strategy === "concatenate" && "Concatenate keeps all branch outputs in order without rewriting."}
        {config.strategy === "summarize" && "Summarize compresses all branch outputs into a shorter synthesis."}
        {config.strategy === "select_best" && "Select best picks a single strongest branch output."}
      </p>
      {config.strategy !== "concatenate" && (
        <div>
          <Label htmlFor={`merge-prompt-${nodeId}`} className="ui-meta-text text-muted-foreground mb-1 block">Merge Instructions</Label>
          <TextareaWithMention
            id={`merge-prompt-${nodeId}`}
            value={config.prompt || ""}
            onChange={(e) => onConfigChange({ ...config, prompt: e.target.value })}
            rows={2}
            className="min-h-20 resize-y font-mono text-body-sm"
            placeholder="How to combine the results..."
          />
        </div>
      )}

      <RuntimePolicyEditor nodeId={nodeId} config={config} onConfigChange={onConfigChange as (next: RuntimeConfigurableNodeConfig) => void} />
    </div>
  )
}

export function ApprovalNodeEditor({ nodeId, config, onConfigChange }: {
  nodeId: string
  config: ApprovalNodeConfig
  onConfigChange: (config: ApprovalNodeConfig) => void
}) {
  return (
    <div className="ui-fade-slide-in border-t border-hairline px-3 pb-3 pt-2.5 space-y-2 surface-soft">
      <p className="ui-meta-text text-muted-foreground">
        Pauses the flow and asks you to review before continuing.
      </p>

      <div>
        <Label htmlFor={`approval-message-${nodeId}`} className="ui-meta-text text-muted-foreground mb-1 block">
          Message
        </Label>
        <TextareaWithMention
          id={`approval-message-${nodeId}`}
          value={config.message || ""}
          onChange={(e) => onConfigChange({ ...config, message: e.target.value })}
          rows={3}
          className="min-h-20 resize-y font-mono text-body-sm"
          placeholder="Optional instructions shown to the reviewer..."
        />
      </div>
      <div className="surface-inset-card space-y-2 px-2 py-2">
        <div className="space-y-0.5">
          <div className="flex items-center justify-between">
            <Label htmlFor={`approval-show-content-${nodeId}`} className="ui-meta-text text-muted-foreground">
              Show content for review
            </Label>
            <Switch
              id={`approval-show-content-${nodeId}`}
              checked={config.show_content}
              onCheckedChange={(checked) => onConfigChange({ ...config, show_content: checked })}
              aria-label="Toggle content visibility in approval dialog"
            />
          </div>
          <p className="ui-meta-text text-muted-foreground">Display the previous step's output in the approval dialog</p>
        </div>
        <div className="space-y-0.5">
          <div className="flex items-center justify-between">
            <Label htmlFor={`approval-allow-edit-${nodeId}`} className="ui-meta-text text-muted-foreground">
              Allow content edits
            </Label>
            <Switch
              id={`approval-allow-edit-${nodeId}`}
              checked={config.allow_edit}
              onCheckedChange={(checked) => onConfigChange({ ...config, allow_edit: checked })}
              aria-label="Toggle editing before approval"
            />
          </div>
          <p className="ui-meta-text text-muted-foreground">Let the reviewer modify the content before approving</p>
        </div>
      </div>

      <div className="surface-inset-card space-y-2 px-2 py-2">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor={`approval-timeout-${nodeId}`} className="ui-meta-text text-muted-foreground">
            Timeout (minutes)
          </Label>
          <OptionalClampedNumberInput
            id={`approval-timeout-${nodeId}`}
            min={1}
            max={1440}
            value={config.timeout_minutes}
            onChange={(value) => onConfigChange({ ...config, timeout_minutes: value })}
            placeholder="None"
            className="w-20 h-control-sm text-body-sm text-right"
          />
        </div>
        {config.timeout_minutes != null && config.timeout_minutes > 0 && (
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor={`approval-timeout-action-${nodeId}`} className="ui-meta-text text-muted-foreground">
              On timeout
            </Label>
            <Select
              value={config.timeout_action || "auto_reject"}
              onValueChange={(v) => onConfigChange({ ...config, timeout_action: v as ApprovalNodeConfig["timeout_action"] })}
            >
              <SelectTrigger id={`approval-timeout-action-${nodeId}`} className="w-36 h-control-sm text-body-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto_approve">Auto-approve</SelectItem>
                <SelectItem value="auto_reject">Auto-reject</SelectItem>
                <SelectItem value="skip">Skip step</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
        <p className="ui-meta-text text-muted-foreground">
          {config.timeout_minutes != null && config.timeout_minutes > 0
            ? "If no one responds in time, the timeout action runs automatically."
            : "No timeout — the flow will wait indefinitely for approval."}
        </p>
      </div>

      <p className="ui-meta-text text-muted-foreground">
        Rejecting at this approval will stop the entire flow run.
      </p>

      <RuntimePolicyEditor nodeId={nodeId} config={config} onConfigChange={onConfigChange as (next: RuntimeConfigurableNodeConfig) => void} />
    </div>
  )
}

export function HumanNodeEditor({ nodeId, config, onConfigChange }: {
  nodeId: string
  config: HumanNodeConfig
  onConfigChange: (config: HumanNodeConfig) => void
}) {
  const request = config.staticRequest || {
    version: 1 as const,
    kind: config.mode,
    title: "",
    fields: [],
  }

  const firstField = request.fields?.[0]

  const updateRequest = (patch: Partial<NonNullable<HumanNodeConfig["staticRequest"]>>) => {
    onConfigChange({
      ...config,
      staticRequest: {
        ...request,
        ...patch,
        version: 1,
        kind: config.mode,
      },
    })
  }

  return (
    <div className="ui-fade-slide-in border-t border-hairline px-3 pb-3 pt-2.5 space-y-2 surface-soft">
      <div className="flex items-center gap-3">
        <Label htmlFor={`human-mode-${nodeId}`} className="ui-meta-text text-muted-foreground">Mode</Label>
        <Select
          value={config.mode}
          onValueChange={(value) => onConfigChange({
            ...config,
            mode: value as HumanNodeConfig["mode"],
            staticRequest: config.staticRequest
              ? { ...config.staticRequest, kind: value as HumanNodeConfig["mode"] }
              : config.staticRequest,
          })}
        >
          <SelectTrigger id={`human-mode-${nodeId}`} className="w-40 h-control-md text-body-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="form">Form</SelectItem>
            <SelectItem value="approval">Approval</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-3">
        <Label htmlFor={`human-source-${nodeId}`} className="ui-meta-text text-muted-foreground">Request Source</Label>
        <Select
          value={config.requestSource}
          onValueChange={(value) => onConfigChange({ ...config, requestSource: value as HumanNodeConfig["requestSource"] })}
        >
          <SelectTrigger id={`human-source-${nodeId}`} className="w-44 h-control-md text-body-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="static">Static</SelectItem>
            <SelectItem value="upstream_json">Upstream JSON</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label htmlFor={`human-title-${nodeId}`} className="ui-meta-text text-muted-foreground mb-1 block">
          Task Title
        </Label>
        <Input
          id={`human-title-${nodeId}`}
          type="text"
          value={request.title || ""}
          onChange={(event) => updateRequest({ title: event.target.value })}
          placeholder="What the human should do"
          className="h-control-md text-body-sm"
        />
      </div>

      <div>
        <Label htmlFor={`human-instructions-${nodeId}`} className="ui-meta-text text-muted-foreground mb-1 block">
          Instructions
        </Label>
        <TextareaWithMention
          id={`human-instructions-${nodeId}`}
          value={request.instructions || ""}
          onChange={(event) => updateRequest({ instructions: event.target.value })}
          rows={3}
          className="min-h-20 resize-y font-mono text-body-sm"
          placeholder="Explain what information is needed before the flow continues."
        />
      </div>

      {config.requestSource === "static" && config.mode === "form" && (
        <div className="surface-inset-card space-y-2 px-2 py-2">
          <div>
            <Label htmlFor={`human-field-label-${nodeId}`} className="ui-meta-text text-muted-foreground mb-1 block">
              Primary Field Label
            </Label>
            <Input
              id={`human-field-label-${nodeId}`}
              type="text"
              value={firstField?.label || ""}
              onChange={(event) => updateRequest({
                fields: [{
                  ...firstField,
                  id: firstField?.id || "response",
                  type: firstField?.type || "textarea",
                  required: firstField?.required ?? true,
                  label: event.target.value,
                }],
              })}
              placeholder="Response"
              className="h-control-md text-body-sm"
            />
          </div>
          <div>
            <Label htmlFor={`human-field-placeholder-${nodeId}`} className="ui-meta-text text-muted-foreground mb-1 block">
              Field Placeholder
            </Label>
            <Input
              id={`human-field-placeholder-${nodeId}`}
              type="text"
              value={firstField?.placeholder || ""}
              onChange={(event) => updateRequest({
                fields: [{
                  ...firstField,
                  id: firstField?.id || "response",
                  label: firstField?.label || "Response",
                  type: firstField?.type || "textarea",
                  required: firstField?.required ?? true,
                  placeholder: event.target.value,
                }],
              })}
              placeholder="Enter the required input..."
              className="h-control-md text-body-sm"
            />
          </div>
        </div>
      )}

      <div className="surface-inset-card space-y-2 px-2 py-2">
        <div className="flex items-center justify-between">
          <Label htmlFor={`human-allow-revisions-${nodeId}`} className="ui-meta-text text-muted-foreground">
            Allow revisions
          </Label>
          <Switch
            id={`human-allow-revisions-${nodeId}`}
            checked={config.allowRevisions ?? true}
            onCheckedChange={(checked) => onConfigChange({ ...config, allowRevisions: checked })}
            aria-label="Toggle human task revisions"
          />
        </div>
      </div>

      <RuntimePolicyEditor nodeId={nodeId} config={config} onConfigChange={onConfigChange as (next: RuntimeConfigurableNodeConfig) => void} />
    </div>
  )
}
