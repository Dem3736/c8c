import { useEffect, useCallback } from "react"
import { useAtom } from "jotai"
import { currentWorkflowAtom, selectedNodeIdAtom } from "@/lib/store"
import { cn } from "@/lib/cn"
import type {
  InputNodeConfig,
  OutputNodeConfig,
  SkillNodeConfig,
  EvaluatorNodeConfig,
  SplitterNodeConfig,
  MergerNodeConfig,
  ApprovalNodeConfig,
  WorkflowNode,
} from "@shared/types"
import { X } from "lucide-react"
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
import { Label } from "@/components/ui/label"
import { McpToolPicker } from "@/components/ui/mcp-tool-picker"
import { NODE_ICONS, NODE_LABELS } from "@/lib/node-ui-config"

type AnyNodeConfig =
  | InputNodeConfig
  | OutputNodeConfig
  | SkillNodeConfig
  | EvaluatorNodeConfig
  | SplitterNodeConfig
  | MergerNodeConfig
  | ApprovalNodeConfig

export function NodeInspector() {
  const [selectedNodeId, setSelectedNodeId] = useAtom(selectedNodeIdAtom)
  const [workflow, setWorkflow] = useAtom(currentWorkflowAtom)

  const node = selectedNodeId
    ? workflow.nodes.find((n) => n.id === selectedNodeId) ?? null
    : null

  const close = useCallback(() => setSelectedNodeId(null), [setSelectedNodeId])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && node) {
        e.preventDefault()
        close()
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [close, node])

  if (!node) return null

  const Icon = NODE_ICONS[node.type]
  const typeLabel = NODE_LABELS[node.type] || node.type

  const updateConfig = (next: AnyNodeConfig) => {
    setWorkflow((prev) => ({
      ...prev,
      nodes: prev.nodes.map((n) =>
        n.id === node.id ? ({ ...n, config: next } as WorkflowNode) : n,
      ),
    }))
  }

  return (
    <aside
      className="surface-panel border-l border-hairline w-[320px] shrink-0 flex flex-col overflow-hidden"
      aria-label="Node inspector"
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-hairline bg-surface-1">
        <div className="h-6 w-6 shrink-0 rounded-md border border-hairline bg-surface-2/80 flex items-center justify-center">
          <Icon size={14} className="text-muted-foreground" />
        </div>
        <span className="flex-1 min-w-0 truncate text-body-sm font-medium">{typeLabel}</span>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-muted-foreground hover:text-foreground"
          aria-label="Close inspector"
          onClick={close}
        >
          <X size={14} />
        </Button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto ui-scroll-region">
        <div className="px-3 py-3 space-y-3">
          {node.type === "input" && (
            <InputFields
              nodeId={node.id}
              config={node.config as InputNodeConfig}
              onChange={updateConfig}
            />
          )}
          {node.type === "output" && (
            <OutputFields
              nodeId={node.id}
              config={node.config as OutputNodeConfig}
              onChange={updateConfig}
            />
          )}
          {node.type === "skill" && (
            <SkillFields
              nodeId={node.id}
              config={node.config as SkillNodeConfig}
              onChange={updateConfig}
            />
          )}
          {node.type === "evaluator" && (
            <EvaluatorFields
              nodeId={node.id}
              config={node.config as EvaluatorNodeConfig}
              onChange={updateConfig}
            />
          )}
          {node.type === "splitter" && (
            <SplitterFields
              nodeId={node.id}
              config={node.config as SplitterNodeConfig}
              onChange={updateConfig}
            />
          )}
          {node.type === "merger" && (
            <MergerFields
              nodeId={node.id}
              config={node.config as MergerNodeConfig}
              onChange={updateConfig}
            />
          )}
          {node.type === "approval" && (
            <ApprovalFields
              nodeId={node.id}
              config={node.config as ApprovalNodeConfig}
              onChange={updateConfig}
            />
          )}
        </div>
      </div>
    </aside>
  )
}

/* ── Field sections ─────────────────────────────────── */

function InputFields({
  nodeId,
  config,
  onChange,
}: {
  nodeId: string
  config: InputNodeConfig
  onChange: (c: InputNodeConfig) => void
}) {
  return (
    <>
      <div className="flex items-center gap-3">
        <Label htmlFor={`insp-input-type-${nodeId}`} className="ui-meta-text text-muted-foreground">
          Input Type
        </Label>
        <Select
          value={config.inputType || "auto"}
          onValueChange={(v) => onChange({ ...config, inputType: v as InputNodeConfig["inputType"] })}
        >
          <SelectTrigger id={`insp-input-type-${nodeId}`} className="w-36 h-control-md text-body-sm">
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
        <Label htmlFor={`insp-input-required-${nodeId}`} className="ui-meta-text text-muted-foreground">
          Input required
        </Label>
        <Switch
          id={`insp-input-required-${nodeId}`}
          checked={config.required ?? true}
          onCheckedChange={(checked) => onChange({ ...config, required: checked })}
          aria-label="Toggle input required"
        />
      </div>

      <div>
        <Label htmlFor={`insp-input-default-${nodeId}`} className="ui-meta-text text-muted-foreground mb-1 block">
          Default value
        </Label>
        <Input
          id={`insp-input-default-${nodeId}`}
          type="text"
          value={config.defaultValue || ""}
          onChange={(e) => onChange({ ...config, defaultValue: e.target.value })}
          placeholder="Used when input is empty"
          className="h-control-md text-body-sm"
        />
      </div>

      <div>
        <Label htmlFor={`insp-input-placeholder-${nodeId}`} className="ui-meta-text text-muted-foreground mb-1 block">
          Placeholder
        </Label>
        <Input
          id={`insp-input-placeholder-${nodeId}`}
          type="text"
          value={config.placeholder || ""}
          onChange={(e) => onChange({ ...config, placeholder: e.target.value })}
          placeholder="Shown in the run input field"
          className="h-control-md text-body-sm"
        />
      </div>
    </>
  )
}

function OutputFields({
  nodeId,
  config,
  onChange,
}: {
  nodeId: string
  config: OutputNodeConfig
  onChange: (c: OutputNodeConfig) => void
}) {
  return (
    <>
      <div>
        <Label htmlFor={`insp-output-title-${nodeId}`} className="ui-meta-text text-muted-foreground mb-1 block">
          Output title
        </Label>
        <Input
          id={`insp-output-title-${nodeId}`}
          type="text"
          value={config.title || ""}
          onChange={(e) => onChange({ ...config, title: e.target.value })}
          placeholder="Optional title for the output node"
          className="h-control-md text-body-sm"
        />
      </div>

      <div className="flex items-center gap-3">
        <Label htmlFor={`insp-output-format-${nodeId}`} className="ui-meta-text text-muted-foreground">
          Format
        </Label>
        <Select
          value={config.format || "markdown"}
          onValueChange={(v) => onChange({ ...config, format: v as OutputNodeConfig["format"] })}
        >
          <SelectTrigger id={`insp-output-format-${nodeId}`} className="w-40 h-control-md text-body-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="markdown">Markdown</SelectItem>
            <SelectItem value="text">Plain text</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </>
  )
}

function SkillFields({
  nodeId,
  config,
  onChange,
}: {
  nodeId: string
  config: SkillNodeConfig
  onChange: (c: SkillNodeConfig) => void
}) {
  return (
    <>
      <div>
        <Label htmlFor={`insp-skill-ref-${nodeId}`} className="ui-meta-text text-muted-foreground mb-1 block">
          Skill reference
        </Label>
        <Input
          id={`insp-skill-ref-${nodeId}`}
          type="text"
          value={config.skillRef || ""}
          onChange={(e) => onChange({ ...config, skillRef: e.target.value })}
          placeholder="category/skill-name"
          className="h-control-md font-mono text-body-sm"
        />
      </div>

      <div>
        <Label htmlFor={`insp-prompt-${nodeId}`} className="ui-meta-text text-muted-foreground mb-1 block">
          Prompt
        </Label>
        <Textarea
          id={`insp-prompt-${nodeId}`}
          value={config.prompt || ""}
          onChange={(e) => onChange({ ...config, prompt: e.target.value })}
          rows={5}
          className="min-h-[120px] resize-y font-mono text-body-sm"
          placeholder="Enter prompt for this skill..."
        />
      </div>

      <div className="flex items-center gap-3">
        <Label htmlFor={`insp-model-${nodeId}`} className="ui-meta-text text-muted-foreground">Model</Label>
        <Select
          value={config.model || "sonnet"}
          onValueChange={(v) => onChange({ ...config, model: v as SkillNodeConfig["model"] })}
        >
          <SelectTrigger id={`insp-model-${nodeId}`} className="flex-1 h-control-md text-body-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="sonnet">Sonnet</SelectItem>
            <SelectItem value="opus">Opus</SelectItem>
            <SelectItem value="haiku">Haiku</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-3">
        <Label htmlFor={`insp-max-turns-${nodeId}`} className="ui-meta-text text-muted-foreground">Max Turns</Label>
        <Input
          id={`insp-max-turns-${nodeId}`}
          type="number"
          min={1}
          max={200}
          value={config.maxTurns ?? ""}
          onChange={(e) => {
            const value = e.target.value.trim()
            onChange({
              ...config,
              maxTurns: value ? Math.max(1, Number(value) || 1) : undefined,
            })
          }}
          className="w-20 h-control-sm px-2 text-body-sm text-center"
        />
      </div>

      <div className="flex items-center gap-3">
        <Label htmlFor={`insp-output-mode-${nodeId}`} className="ui-meta-text text-muted-foreground">Output</Label>
        <Select
          value={config.outputMode || "auto"}
          onValueChange={(v) => onChange({ ...config, outputMode: v as SkillNodeConfig["outputMode"] })}
        >
          <SelectTrigger id={`insp-output-mode-${nodeId}`} className="flex-1 h-control-md text-body-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="auto">Auto</SelectItem>
            <SelectItem value="stdout">Stdout</SelectItem>
            <SelectItem value="content_file">content.md</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-3">
        <Label htmlFor={`insp-perm-mode-${nodeId}`} className="ui-meta-text text-muted-foreground">Mode</Label>
        <Select
          value={config.permissionMode || "__inherit__"}
          onValueChange={(v) => onChange({ ...config, permissionMode: v === "__inherit__" ? undefined : v as "plan" | "edit" })}
        >
          <SelectTrigger id={`insp-perm-mode-${nodeId}`} className="flex-1 h-control-md text-body-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__inherit__">Inherit from workflow</SelectItem>
            <SelectItem value="plan">Plan (read-only)</SelectItem>
            <SelectItem value="edit">Edit (can modify files)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-md border border-hairline bg-surface-1/80 px-2 py-2 space-y-2">
        <p className="ui-meta-label text-muted-foreground">Tool Access</p>
        <McpToolPicker
          nodeId={`${nodeId}-insp-allowed`}
          label="Allowed Tools"
          values={config.allowedTools || []}
          onChange={(next) => onChange({ ...config, allowedTools: next })}
          placeholder="e.g. WebFetch"
        />
        <McpToolPicker
          nodeId={`${nodeId}-insp-blocked`}
          label="Blocked Tools"
          values={config.disallowedTools || []}
          onChange={(next) => onChange({ ...config, disallowedTools: next })}
          placeholder="e.g. Edit"
        />
      </div>
    </>
  )
}

function EvaluatorFields({
  nodeId,
  config,
  onChange,
}: {
  nodeId: string
  config: EvaluatorNodeConfig
  onChange: (c: EvaluatorNodeConfig) => void
}) {
  const [workflow] = useAtom(currentWorkflowAtom)
  const retryFromOptions = workflow.nodes.filter(
    (n) => n.type === "skill" || n.type === "splitter",
  )

  return (
    <>
      <div>
        <Label htmlFor={`insp-criteria-${nodeId}`} className="ui-meta-text text-muted-foreground mb-1 block">
          Criteria
        </Label>
        <Textarea
          id={`insp-criteria-${nodeId}`}
          value={config.criteria || ""}
          onChange={(e) => onChange({ ...config, criteria: e.target.value })}
          rows={4}
          className="min-h-[96px] resize-y font-mono text-body-sm"
          placeholder="Score 1-10 on clarity, engagement, CTA strength..."
        />
      </div>

      <div className="flex items-center gap-3">
        <Label htmlFor={`insp-threshold-${nodeId}`} className="ui-meta-text text-muted-foreground">Threshold</Label>
        <Input
          id={`insp-threshold-${nodeId}`}
          type="number"
          min={1}
          max={10}
          value={config.threshold}
          onChange={(e) => onChange({ ...config, threshold: Math.min(10, Math.max(1, Number(e.target.value) || 1)) })}
          className="w-16 h-control-sm px-2 text-body-sm text-center"
        />
        <span className="ui-meta-text text-muted-foreground">/10</span>
      </div>

      <div className="flex items-center gap-3">
        <Label htmlFor={`insp-max-retries-${nodeId}`} className="ui-meta-text text-muted-foreground">Max Retries</Label>
        <Input
          id={`insp-max-retries-${nodeId}`}
          type="number"
          min={1}
          max={10}
          value={config.maxRetries}
          onChange={(e) => onChange({ ...config, maxRetries: Math.min(10, Math.max(1, Number(e.target.value) || 1)) })}
          className="w-16 h-control-sm px-2 text-body-sm text-center"
        />
      </div>

      <div className="flex items-center gap-3">
        <Label htmlFor={`insp-retry-from-${nodeId}`} className="ui-meta-text text-muted-foreground">Retry From</Label>
        <Select
          value={config.retryFrom || "__none__"}
          onValueChange={(v) => onChange({ ...config, retryFrom: v === "__none__" ? undefined : v })}
        >
          <SelectTrigger id={`insp-retry-from-${nodeId}`} className="flex-1 h-control-md text-body-sm">
            <SelectValue placeholder="Select node..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">None</SelectItem>
            {retryFromOptions.map((n) => (
              <SelectItem key={n.id} value={n.id}>
                {n.type === "skill"
                  ? (n.config as SkillNodeConfig).skillRef || n.id
                  : NODE_LABELS[n.type] || n.id}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </>
  )
}

function SplitterFields({
  nodeId,
  config,
  onChange,
}: {
  nodeId: string
  config: SplitterNodeConfig
  onChange: (c: SplitterNodeConfig) => void
}) {
  return (
    <>
      <div>
        <Label htmlFor={`insp-split-strategy-${nodeId}`} className="ui-meta-text text-muted-foreground mb-1 block">
          Decomposition Strategy
        </Label>
        <Textarea
          id={`insp-split-strategy-${nodeId}`}
          value={config.strategy || ""}
          onChange={(e) => onChange({ ...config, strategy: e.target.value })}
          rows={3}
          className="min-h-[72px] resize-y font-mono text-body-sm"
          placeholder="e.g. Split by page section, Split by topic..."
        />
      </div>

      <div className="flex items-center gap-3">
        <Label htmlFor={`insp-max-branches-${nodeId}`} className="ui-meta-text text-muted-foreground">Max branches</Label>
        <Input
          id={`insp-max-branches-${nodeId}`}
          type="number"
          value={config.maxBranches || 8}
          onChange={(e) => onChange({ ...config, maxBranches: parseInt(e.target.value) || 8 })}
          className="w-20 h-control-md px-2 text-body-sm text-center"
          min={1}
          max={20}
        />
      </div>
    </>
  )
}

function MergerFields({
  nodeId,
  config,
  onChange,
}: {
  nodeId: string
  config: MergerNodeConfig
  onChange: (c: MergerNodeConfig) => void
}) {
  return (
    <>
      <div className="flex items-center gap-3">
        <Label htmlFor={`insp-merger-strategy-${nodeId}`} className="ui-meta-text text-muted-foreground">Strategy</Label>
        <Select
          value={config.strategy}
          onValueChange={(v) => onChange({ ...config, strategy: v as MergerNodeConfig["strategy"] })}
        >
          <SelectTrigger id={`insp-merger-strategy-${nodeId}`} className="flex-1 h-control-md text-body-sm">
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
        {config.strategy === "concatenate" && "Keeps all branch outputs in order without rewriting."}
        {config.strategy === "summarize" && "Compresses all branch outputs into a shorter synthesis."}
        {config.strategy === "select_best" && "Picks a single strongest branch output."}
      </p>
    </>
  )
}

function ApprovalFields({
  nodeId,
  config,
  onChange,
}: {
  nodeId: string
  config: ApprovalNodeConfig
  onChange: (c: ApprovalNodeConfig) => void
}) {
  return (
    <>
      <div>
        <Label htmlFor={`insp-approval-message-${nodeId}`} className="ui-meta-text text-muted-foreground mb-1 block">
          Message
        </Label>
        <Textarea
          id={`insp-approval-message-${nodeId}`}
          value={config.message || ""}
          onChange={(e) => onChange({ ...config, message: e.target.value })}
          rows={3}
          className="min-h-[72px] resize-y font-mono text-body-sm"
          placeholder="Optional instructions shown to the reviewer..."
        />
      </div>

      <div className="space-y-2 rounded-md border border-hairline bg-surface-1/80 px-2 py-2">
        <div className="flex items-center justify-between">
          <Label htmlFor={`insp-approval-show-content-${nodeId}`} className="ui-meta-text text-muted-foreground">
            Show content for review
          </Label>
          <Switch
            id={`insp-approval-show-content-${nodeId}`}
            checked={config.show_content}
            onCheckedChange={(checked) => onChange({ ...config, show_content: checked })}
            aria-label="Toggle content visibility in approval dialog"
          />
        </div>
        <div className="flex items-center justify-between">
          <Label htmlFor={`insp-approval-allow-edit-${nodeId}`} className="ui-meta-text text-muted-foreground">
            Allow content edits
          </Label>
          <Switch
            id={`insp-approval-allow-edit-${nodeId}`}
            checked={config.allow_edit}
            onCheckedChange={(checked) => onChange({ ...config, allow_edit: checked })}
            aria-label="Toggle editing before approval"
          />
        </div>
      </div>
    </>
  )
}
