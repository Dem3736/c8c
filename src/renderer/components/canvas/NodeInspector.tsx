import { useEffect, useCallback, useRef, useState } from "react"
import { useAtom, useAtomValue, useSetAtom } from "jotai"
import {
  currentWorkflowAtom,
  defaultProviderAtom,
  providerSettingsAtom,
  selectedNodeIdAtom,
  validationErrorsAtom,
  validationNavigationTargetAtom,
} from "@/lib/store"
import { cn } from "@/lib/cn"
import type {
  InputNodeConfig,
  OutputNodeConfig,
  SkillNodeConfig,
  EvaluatorNodeConfig,
  SplitterNodeConfig,
  MergerNodeConfig,
  ApprovalNodeConfig,
  HumanNodeConfig,
  WorkflowNode,
} from "@shared/types"
import {
  getDefaultModelForProvider,
  modelLooksCompatible,
} from "@shared/provider-metadata"
import { X } from "lucide-react"
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
import { Label } from "@/components/ui/label"
import { McpToolPicker } from "@/components/ui/mcp-tool-picker"
import { SkillRefInput } from "@/components/ui/skill-ref-input"
import { NODE_ICONS, NODE_LABELS } from "@/lib/node-ui-config"
import { ProviderModelInput, ProviderSelect } from "@/components/provider-controls"
import { RuntimePolicyEditor } from "@/components/NodeCardEditors"
import { useWorkflowWithUndo } from "@/hooks/useWorkflowWithUndo"
import { getValidationFieldId } from "@/lib/validation-navigation"

type AnyNodeConfig =
  | InputNodeConfig
  | OutputNodeConfig
  | SkillNodeConfig
  | EvaluatorNodeConfig
  | SplitterNodeConfig
  | MergerNodeConfig
  | ApprovalNodeConfig
  | HumanNodeConfig

type RuntimeConfigurableNodeConfig =
  | SkillNodeConfig
  | EvaluatorNodeConfig
  | SplitterNodeConfig
  | MergerNodeConfig
  | ApprovalNodeConfig
  | HumanNodeConfig

function useNodeValidation(nodeId: string) {
  const allValidationErrors = useAtomValue(validationErrorsAtom)
  const nodeErrors = allValidationErrors[nodeId] || []

  const getFieldValidation = (...fields: string[]) => {
    const errors = nodeErrors.filter((error) => fields.includes(error.field))
    return {
      errors,
      invalid: errors.some((error) => error.severity === "error"),
    }
  }

  const summaryErrors = nodeErrors.filter((error) => !getValidationFieldId(nodeId, error.field))

  return {
    nodeErrors,
    summaryErrors,
    getFieldValidation,
  }
}

function controlErrorClassName(invalid: boolean, className?: string) {
  return cn(
    className,
    invalid && "border-status-danger focus-visible:ring-status-danger/20 focus-visible:border-status-danger",
  )
}

function ValidationMessages({ errors }: { errors: Array<{ field: string; message: string; severity: "error" | "warning" }> }) {
  if (errors.length === 0) return null

  return (
    <div className="mt-1 space-y-1">
      {errors.map((error) => (
        <p
          key={`${error.field}-${error.message}`}
          className={cn(
            "ui-meta-text",
            error.severity === "error" ? "text-status-danger" : "text-status-warning",
          )}
        >
          {error.message}
        </p>
      ))}
    </div>
  )
}

export function NodeInspector() {
  const selectedNodeId = useAtomValue(selectedNodeIdAtom)
  const [validationNavigationTarget, setValidationNavigationTarget] = useAtom(validationNavigationTargetAtom)
  const setSelectedNodeIdDirect = useSetAtom(selectedNodeIdAtom)
  const { workflow, setWorkflow } = useWorkflowWithUndo()
  const [renderedNodeId, setRenderedNodeId] = useState<string | null>(selectedNodeId)

  const nodeId = selectedNodeId || renderedNodeId
  const node = nodeId
    ? workflow.nodes.find((n) => n.id === nodeId) ?? null
    : null
  const { summaryErrors } = useNodeValidation(node?.id ?? "__none__")

  const close = useCallback(() => setSelectedNodeIdDirect(null), [setSelectedNodeIdDirect])

  useEffect(() => {
    if (selectedNodeId) {
      setRenderedNodeId(selectedNodeId)
      return
    }

    if (!renderedNodeId) return

    const timeoutId = window.setTimeout(() => {
      setRenderedNodeId(null)
    }, 170)

    return () => window.clearTimeout(timeoutId)
  }, [renderedNodeId, selectedNodeId])

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

  useEffect(() => {
    if (!node || !validationNavigationTarget) return
    if (validationNavigationTarget.nodeId && validationNavigationTarget.nodeId !== node.id) return

    let cancelled = false
    let timeoutId: number | null = null
    let attempts = 0

    const focusTarget = () => {
      if (cancelled) return
      const target = document.getElementById(validationNavigationTarget.fieldId)
      if (target instanceof HTMLElement) {
        target.focus()
        target.scrollIntoView({ block: "center", behavior: "smooth" })
        setValidationNavigationTarget(null)
        return
      }
      if (attempts >= 5) {
        setValidationNavigationTarget(null)
        return
      }
      attempts += 1
      timeoutId = window.setTimeout(focusTarget, 60)
    }

    timeoutId = window.setTimeout(focusTarget, 0)
    return () => {
      cancelled = true
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId)
      }
    }
  }, [node, setValidationNavigationTarget, validationNavigationTarget])

  if (!node) return null

  const Icon = NODE_ICONS[node.type]
  const typeLabel = NODE_LABELS[node.type] || node.type

  const updateConfig = (next: AnyNodeConfig) => {
    setWorkflow((prev) => ({
      ...prev,
      nodes: prev.nodes.map((n) =>
        n.id === node.id ? ({ ...n, config: next } as WorkflowNode) : n,
      ),
    }), { coalesceKey: `node-config:${node.id}` })
  }

  const asideRef = useRef<HTMLElement>(null)
  useEffect(() => {
    if (selectedNodeId && asideRef.current) {
      asideRef.current.focus({ preventScroll: true })
    }
  }, [selectedNodeId])

  return (
    <aside
      ref={asideRef}
      key={node.id}
      tabIndex={-1}
      className={cn(
        "surface-panel border-l border-hairline w-[320px] shrink-0 flex flex-col overflow-hidden focus:outline-none",
        selectedNodeId ? "ui-fade-slide-in-trailing" : "ui-fade-slide-out-trailing pointer-events-none",
      )}
      aria-label="Node inspector"
    >
      {/* Header */}
      <div className="surface-depth-header flex items-center gap-2 px-3 py-2.5">
        <div key={node.type} className="ui-fade-slide-in surface-inset-card flex h-6 w-6 shrink-0 items-center justify-center p-0">
          <Icon size={14} className="text-muted-foreground" />
        </div>
        <span key={node.type} className="ui-fade-slide-in flex-1 min-w-0 truncate text-body-sm font-medium">{typeLabel}</span>
        <button
          type="button"
          className="ui-icon-button h-6 w-6"
          aria-label="Close inspector"
          onClick={close}
        >
          <X size={14} />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto ui-scroll-region">
        <div className="px-3 py-3 space-y-3">
          {summaryErrors.length > 0 && (
            <div className="rounded-md surface-warning-soft px-3 py-2">
              <p className="ui-meta-label text-status-warning">Needs attention</p>
              <ValidationMessages errors={summaryErrors} />
            </div>
          )}
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
          {node.type === "human" && (
            <HumanFields
              nodeId={node.id}
              config={node.config as HumanNodeConfig}
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
  const [workflow] = useAtom(currentWorkflowAtom)
  const { setWorkflow } = useWorkflowWithUndo()
  const defaultProvider = useAtomValue(defaultProviderAtom)
  const providerSettings = useAtomValue(providerSettingsAtom)
  const workflowProvider = workflow.defaults?.provider || defaultProvider
  const { getFieldValidation } = useNodeValidation(nodeId)
  const inputTypeValidation = getFieldValidation("config.inputType")
  const requiredValidation = getFieldValidation("config.required")
  const defaultValueValidation = getFieldValidation("config.defaultValue")
  const placeholderValidation = getFieldValidation("config.placeholder")
  const workflowModelValidation = getFieldValidation("defaults.model")

  const updateWorkflowDefaults = (patch: Record<string, unknown>) => {
    setWorkflow((prev) => ({
      ...prev,
      defaults: {
        ...(prev.defaults || {}),
        ...patch,
      },
    }), { coalesceKey: "workflow-defaults:inspector" })
  }

  return (
    <>
      <div className="surface-inset-card px-2 py-2 space-y-2">
        <p className="ui-meta-label text-muted-foreground">Flow defaults (all nodes)</p>
        <div className="space-y-1">
          <Label htmlFor={`insp-workflow-provider-${nodeId}`} className="ui-meta-text text-muted-foreground">
            Provider
          </Label>
          <ProviderSelect
            id={`insp-workflow-provider-${nodeId}`}
            value={workflowProvider}
            onValueChange={(value) => updateWorkflowDefaults({
              provider: value,
              model: modelLooksCompatible(value, workflow.defaults?.model)
                ? workflow.defaults?.model
                : getDefaultModelForProvider(value),
            })}
            codexEnabled={providerSettings.features.codexProvider}
            className="w-full h-control-md text-body-sm"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`insp-workflow-model-${nodeId}`} className="ui-meta-text text-muted-foreground">
            Model
          </Label>
          <ProviderModelInput
            id={`insp-workflow-model-${nodeId}`}
            provider={workflowProvider}
            value={workflow.defaults?.model || getDefaultModelForProvider(workflowProvider)}
            onValueChange={(value) => updateWorkflowDefaults({ model: value })}
            placeholder="Enter a model id"
            className={controlErrorClassName(workflowModelValidation.invalid, "w-full h-control-md text-body-sm")}
          />
          <ValidationMessages errors={workflowModelValidation.errors} />
        </div>
      </div>

      <p className="ui-meta-label text-muted-foreground mt-1">Node settings</p>

      <div className="flex items-center gap-3">
        <Label htmlFor={`insp-input-type-${nodeId}`} className="ui-meta-text text-muted-foreground">
          Input Type
        </Label>
        <Select
          value={config.inputType || "auto"}
          onValueChange={(v) => onChange({ ...config, inputType: v as InputNodeConfig["inputType"] })}
        >
          <SelectTrigger id={`insp-input-type-${nodeId}`} className={controlErrorClassName(inputTypeValidation.invalid, "w-36 h-control-md text-body-sm")}>
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
      <ValidationMessages errors={inputTypeValidation.errors} />
      <p className="ui-meta-text text-muted-foreground">
        {(config.inputType || "auto") === "auto" && "Detects text, URL, or directory path automatically."}
        {config.inputType === "text" && "Accepts plain text input only."}
        {config.inputType === "url" && "Expects a web URL (http/https). Validates format."}
        {config.inputType === "directory" && "Expects a local file or directory path."}
      </p>

      <div className={controlErrorClassName(requiredValidation.invalid, "surface-inset-card flex items-center justify-between px-2 py-2")}>
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
      <ValidationMessages errors={requiredValidation.errors} />

      {config.required === false && (
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
            className={controlErrorClassName(defaultValueValidation.invalid, "h-control-md text-body-sm")}
          />
          <ValidationMessages errors={defaultValueValidation.errors} />
        </div>
      )}

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
          className={controlErrorClassName(placeholderValidation.invalid, "h-control-md text-body-sm")}
        />
        <ValidationMessages errors={placeholderValidation.errors} />
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
  const { getFieldValidation } = useNodeValidation(nodeId)
  const titleValidation = getFieldValidation("config.title")
  const formatValidation = getFieldValidation("config.format")

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
          className={controlErrorClassName(titleValidation.invalid, "h-control-md text-body-sm")}
        />
        <ValidationMessages errors={titleValidation.errors} />
      </div>

      <div className="flex items-center gap-3">
        <Label htmlFor={`insp-output-format-${nodeId}`} className="ui-meta-text text-muted-foreground">
          Format
        </Label>
        <Select
          value={config.format || "markdown"}
          onValueChange={(v) => onChange({ ...config, format: v as OutputNodeConfig["format"] })}
        >
          <SelectTrigger id={`insp-output-format-${nodeId}`} className={controlErrorClassName(formatValidation.invalid, "w-40 h-control-md text-body-sm")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="markdown">Markdown</SelectItem>
            <SelectItem value="text">Plain text</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <ValidationMessages errors={formatValidation.errors} />
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
  const { getFieldValidation } = useNodeValidation(nodeId)
  const skillRefValidation = getFieldValidation("config.skillRef")
  const promptValidation = getFieldValidation("config.prompt")
  const maxTurnsValidation = getFieldValidation("config.maxTurns")
  const outputModeValidation = getFieldValidation("config.outputMode")
  const permissionModeValidation = getFieldValidation("config.permissionMode")

  return (
    <>
      <div>
        <Label htmlFor={`insp-skill-ref-${nodeId}`} className="ui-meta-text text-muted-foreground mb-1 block">
          Skill reference
        </Label>
        <SkillRefInput
          id={`insp-skill-ref-${nodeId}`}
          value={config.skillRef || ""}
          onChange={(value) => onChange({ ...config, skillRef: value })}
          placeholder="category/skill-name"
          className={controlErrorClassName(skillRefValidation.invalid, "h-control-md font-mono text-body-sm")}
        />
        <ValidationMessages errors={skillRefValidation.errors} />
      </div>

      <div>
        <Label htmlFor={`insp-prompt-${nodeId}`} className="ui-meta-text text-muted-foreground mb-1 block">
          Prompt
        </Label>
        <TextareaWithMention
          id={`insp-prompt-${nodeId}`}
          value={config.prompt || ""}
          onChange={(e) => onChange({ ...config, prompt: e.target.value })}
          rows={5}
          className={controlErrorClassName(promptValidation.invalid, "min-h-[120px] resize-y font-mono text-body-sm")}
          placeholder="Enter prompt for this skill..."
        />
        <ValidationMessages errors={promptValidation.errors} />
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
          className={controlErrorClassName(maxTurnsValidation.invalid, "w-20 h-control-sm px-2 text-body-sm text-center")}
        />
      </div>
      <ValidationMessages errors={maxTurnsValidation.errors} />

      <p className="ui-meta-text text-muted-foreground">
        Provider and model are controlled from the flow Input step.
      </p>

      <div className="flex items-center gap-3">
        <Label htmlFor={`insp-output-mode-${nodeId}`} className="ui-meta-text text-muted-foreground">Output</Label>
        <Select
          value={config.outputMode || "auto"}
          onValueChange={(v) => onChange({ ...config, outputMode: v as SkillNodeConfig["outputMode"] })}
        >
          <SelectTrigger id={`insp-output-mode-${nodeId}`} className={controlErrorClassName(outputModeValidation.invalid, "flex-1 h-control-md text-body-sm")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="auto">Auto</SelectItem>
            <SelectItem value="stdout">Stdout</SelectItem>
            <SelectItem value="content_file">content.md</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <ValidationMessages errors={outputModeValidation.errors} />
      <p className="ui-meta-text text-muted-foreground">
        Auto lets the step decide. Stdout keeps terminal output. <code>content.md</code> treats a generated file as the step result.
      </p>

      <div className="flex items-center gap-3">
        <Label htmlFor={`insp-perm-mode-${nodeId}`} className="ui-meta-text text-muted-foreground">Mode</Label>
        <Select
          value={config.permissionMode || "__inherit__"}
          onValueChange={(v) => onChange({ ...config, permissionMode: v === "__inherit__" ? undefined : v as "plan" | "edit" })}
        >
          <SelectTrigger id={`insp-perm-mode-${nodeId}`} className={controlErrorClassName(permissionModeValidation.invalid, "flex-1 h-control-md text-body-sm")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__inherit__">Inherit from flow</SelectItem>
            <SelectItem value="plan">Plan (read-only)</SelectItem>
            <SelectItem value="edit">Edit (can modify files)</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <ValidationMessages errors={permissionModeValidation.errors} />
      <p className="ui-meta-text text-muted-foreground">
        Inherit follows the flow default. Plan can inspect but not change files. Edit allows this step to modify files.
      </p>

      <div className="surface-inset-card px-2 py-2 space-y-2">
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

      <RuntimePolicyEditor
        nodeId={nodeId}
        config={config}
        onConfigChange={onChange as (next: RuntimeConfigurableNodeConfig) => void}
      />
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
  const { getFieldValidation } = useNodeValidation(nodeId)
  const retryFromOptions = workflow.nodes.filter(
    (n) => n.type === "skill" || n.type === "splitter",
  )
  const criteriaValidation = getFieldValidation("config.criteria")
  const thresholdValidation = getFieldValidation("config.threshold")
  const maxRetriesValidation = getFieldValidation("config.maxRetries")
  const retryFromValidation = getFieldValidation("config.retryFrom")

  return (
    <>
      <div>
        <Label htmlFor={`insp-criteria-${nodeId}`} className="ui-meta-text text-muted-foreground mb-1 block">
          Criteria
        </Label>
        <TextareaWithMention
          id={`insp-criteria-${nodeId}`}
          value={config.criteria || ""}
          onChange={(e) => onChange({ ...config, criteria: e.target.value })}
          rows={4}
          className={controlErrorClassName(criteriaValidation.invalid, "min-h-[96px] resize-y font-mono text-body-sm")}
          placeholder="Score 1-10 on clarity, engagement, CTA strength..."
        />
        <ValidationMessages errors={criteriaValidation.errors} />
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
          className={controlErrorClassName(thresholdValidation.invalid, "w-16 h-control-sm px-2 text-body-sm text-center")}
        />
        <span className="ui-meta-text text-muted-foreground">/10</span>
      </div>
      <ValidationMessages errors={thresholdValidation.errors} />

      <div className="flex items-center gap-3">
        <Label htmlFor={`insp-max-retries-${nodeId}`} className="ui-meta-text text-muted-foreground">Max Retries</Label>
        <Input
          id={`insp-max-retries-${nodeId}`}
          type="number"
          min={1}
          max={10}
          value={config.maxRetries}
          onChange={(e) => onChange({ ...config, maxRetries: Math.min(10, Math.max(1, Number(e.target.value) || 1)) })}
          className={controlErrorClassName(maxRetriesValidation.invalid, "w-16 h-control-sm px-2 text-body-sm text-center")}
        />
      </div>
      <ValidationMessages errors={maxRetriesValidation.errors} />

      <div className="flex items-center gap-3">
        <Label htmlFor={`insp-retry-from-${nodeId}`} className="ui-meta-text text-muted-foreground">Retry From</Label>
        <Select
          value={config.retryFrom || "__none__"}
          onValueChange={(v) => onChange({ ...config, retryFrom: v === "__none__" ? undefined : v })}
        >
          <SelectTrigger id={`insp-retry-from-${nodeId}`} className={controlErrorClassName(retryFromValidation.invalid, "flex-1 h-control-md text-body-sm")}>
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
      <ValidationMessages errors={retryFromValidation.errors} />

      <RuntimePolicyEditor
        nodeId={nodeId}
        config={config}
        onConfigChange={onChange as (next: RuntimeConfigurableNodeConfig) => void}
      />
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
  const { getFieldValidation } = useNodeValidation(nodeId)
  const strategyValidation = getFieldValidation("config.strategy")
  const maxBranchesValidation = getFieldValidation("config.maxBranches")

  return (
    <>
      <div>
        <Label htmlFor={`insp-split-strategy-${nodeId}`} className="ui-meta-text text-muted-foreground mb-1 block">
          Decomposition Strategy
        </Label>
        <TextareaWithMention
          id={`insp-split-strategy-${nodeId}`}
          value={config.strategy || ""}
          onChange={(e) => onChange({ ...config, strategy: e.target.value })}
          rows={3}
          className={controlErrorClassName(strategyValidation.invalid, "min-h-[72px] resize-y font-mono text-body-sm")}
          placeholder="e.g. Split by page section, Split by topic..."
        />
        <ValidationMessages errors={strategyValidation.errors} />
      </div>

      <p className="ui-meta-text text-muted-foreground">
        Provider and model are controlled from the flow Input step.
      </p>

      <div className="flex items-center gap-3">
        <Label htmlFor={`insp-max-branches-${nodeId}`} className="ui-meta-text text-muted-foreground">Max branches</Label>
        <Input
          id={`insp-max-branches-${nodeId}`}
          type="number"
          value={config.maxBranches || 8}
          onChange={(e) => onChange({ ...config, maxBranches: parseInt(e.target.value) || 8 })}
          className={controlErrorClassName(maxBranchesValidation.invalid, "w-20 h-control-md px-2 text-body-sm text-center")}
          min={1}
          max={20}
        />
      </div>
      <ValidationMessages errors={maxBranchesValidation.errors} />

      <RuntimePolicyEditor
        nodeId={nodeId}
        config={config}
        onConfigChange={onChange as (next: RuntimeConfigurableNodeConfig) => void}
      />
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
  const { getFieldValidation } = useNodeValidation(nodeId)
  const strategyValidation = getFieldValidation("config.strategy")
  const promptValidation = getFieldValidation("config.prompt")

  return (
    <>
      <div className="flex items-center gap-3">
        <Label htmlFor={`insp-merger-strategy-${nodeId}`} className="ui-meta-text text-muted-foreground">Strategy</Label>
        <Select
          value={config.strategy}
          onValueChange={(v) => onChange({ ...config, strategy: v as MergerNodeConfig["strategy"] })}
        >
          <SelectTrigger id={`insp-merger-strategy-${nodeId}`} className={controlErrorClassName(strategyValidation.invalid, "flex-1 h-control-md text-body-sm")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="concatenate">Concatenate</SelectItem>
            <SelectItem value="summarize">Summarize</SelectItem>
            <SelectItem value="select_best">Select Best</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <ValidationMessages errors={strategyValidation.errors} />
      <p className="ui-meta-text text-muted-foreground">
        {config.strategy === "concatenate" && "Keeps all branch outputs in order without rewriting."}
        {config.strategy === "summarize" && "Compresses all branch outputs into a shorter synthesis."}
        {config.strategy === "select_best" && "Picks a single strongest branch output."}
      </p>
      {config.strategy !== "concatenate" && (
        <div>
          <Label htmlFor={`insp-merge-prompt-${nodeId}`} className="ui-meta-text text-muted-foreground mb-1 block">
            Merge Instructions
          </Label>
          <TextareaWithMention
            id={`insp-merge-prompt-${nodeId}`}
            value={config.prompt || ""}
            onChange={(e) => onChange({ ...config, prompt: e.target.value })}
            rows={3}
            className={controlErrorClassName(promptValidation.invalid, "min-h-[72px] resize-y font-mono text-body-sm")}
            placeholder="How to combine the results..."
          />
          <ValidationMessages errors={promptValidation.errors} />
        </div>
      )}

      <RuntimePolicyEditor
        nodeId={nodeId}
        config={config}
        onConfigChange={onChange as (next: RuntimeConfigurableNodeConfig) => void}
      />
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
  const { getFieldValidation } = useNodeValidation(nodeId)
  const messageValidation = getFieldValidation("config.message")
  const showContentValidation = getFieldValidation("config.show_content")
  const allowEditValidation = getFieldValidation("config.allow_edit")
  const timeoutValidation = getFieldValidation("config.timeout_minutes")
  const timeoutActionValidation = getFieldValidation("config.timeout_action")

  return (
    <>
      <p className="ui-meta-text text-muted-foreground">
        Pauses the flow and asks you to review before continuing.
      </p>

      <div>
        <Label htmlFor={`insp-approval-message-${nodeId}`} className="ui-meta-text text-muted-foreground mb-1 block">
          Message
        </Label>
        <TextareaWithMention
          id={`insp-approval-message-${nodeId}`}
          value={config.message || ""}
          onChange={(e) => onChange({ ...config, message: e.target.value })}
          rows={3}
          className={controlErrorClassName(messageValidation.invalid, "min-h-[72px] resize-y font-mono text-body-sm")}
          placeholder="Optional instructions shown to the reviewer..."
        />
        <ValidationMessages errors={messageValidation.errors} />
      </div>

      <div className={controlErrorClassName(showContentValidation.invalid || allowEditValidation.invalid, "surface-inset-card space-y-2 px-2 py-2")}>
        <div className="space-y-0.5">
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
          <p className="ui-meta-text text-muted-foreground/70 text-[10px]">Display the previous step's output in the approval dialog</p>
        </div>
        <div className="space-y-0.5">
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
          <p className="ui-meta-text text-muted-foreground/70 text-[10px]">Let the reviewer modify the content before approving</p>
        </div>
      </div>
      <ValidationMessages errors={[...showContentValidation.errors, ...allowEditValidation.errors]} />

      <div className={controlErrorClassName(timeoutValidation.invalid || timeoutActionValidation.invalid, "surface-inset-card space-y-2 px-2 py-2")}>
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor={`insp-approval-timeout-${nodeId}`} className="ui-meta-text text-muted-foreground">
            Timeout (minutes)
          </Label>
          <Input
            id={`insp-approval-timeout-${nodeId}`}
            type="number"
            min={1}
            value={config.timeout_minutes ?? ""}
            onChange={(e) => {
              const v = e.target.value === "" ? undefined : parseInt(e.target.value, 10)
              onChange({ ...config, timeout_minutes: v && !isNaN(v) ? v : undefined })
            }}
            placeholder="None"
            className="w-20 h-control-sm text-body-sm text-right"
          />
        </div>
        {config.timeout_minutes != null && config.timeout_minutes > 0 && (
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor={`insp-approval-timeout-action-${nodeId}`} className="ui-meta-text text-muted-foreground">
              On timeout
            </Label>
            <Select
              value={config.timeout_action || "auto_reject"}
              onValueChange={(v) => onChange({ ...config, timeout_action: v as ApprovalNodeConfig["timeout_action"] })}
            >
              <SelectTrigger id={`insp-approval-timeout-action-${nodeId}`} className={controlErrorClassName(timeoutActionValidation.invalid, "w-36 h-control-sm text-body-sm")}>
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
        <p className="ui-meta-text text-muted-foreground/70 text-[10px]">
          {config.timeout_minutes != null && config.timeout_minutes > 0
            ? "If no one responds in time, the timeout action runs automatically."
            : "No timeout — the flow will wait indefinitely for approval."}
        </p>
      </div>
      <ValidationMessages errors={[...timeoutValidation.errors, ...timeoutActionValidation.errors]} />

      <p className="ui-meta-text text-muted-foreground/70 text-[10px]">
        Rejecting at this approval will stop the entire flow run.
      </p>

      <RuntimePolicyEditor
        nodeId={nodeId}
        config={config}
        onConfigChange={onChange as (next: RuntimeConfigurableNodeConfig) => void}
      />
    </>
  )
}

function HumanFields({
  nodeId,
  config,
  onChange,
}: {
  nodeId: string
  config: HumanNodeConfig
  onChange: (c: HumanNodeConfig) => void
}) {
  const request = config.staticRequest || {
    version: 1 as const,
    kind: config.mode,
    title: "",
    fields: [],
  }
  const firstField = request.fields?.[0]
  const { getFieldValidation } = useNodeValidation(nodeId)
  const modeValidation = getFieldValidation("config.mode")
  const requestSourceValidation = getFieldValidation("config.requestSource")
  const requestValidation = getFieldValidation("config.staticRequest")
  const revisionsValidation = getFieldValidation("config.allowRevisions")

  const updateRequest = (patch: Partial<NonNullable<HumanNodeConfig["staticRequest"]>>) => {
    onChange({
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
    <>
      <div className="flex items-center gap-3">
        <Label htmlFor={`insp-human-mode-${nodeId}`} className="ui-meta-text text-muted-foreground">Mode</Label>
        <Select
          value={config.mode}
          onValueChange={(v) => onChange({
            ...config,
            mode: v as HumanNodeConfig["mode"],
            staticRequest: config.staticRequest
              ? { ...config.staticRequest, kind: v as HumanNodeConfig["mode"] }
              : config.staticRequest,
          })}
        >
          <SelectTrigger id={`insp-human-mode-${nodeId}`} className={controlErrorClassName(modeValidation.invalid, "w-40 h-control-md text-body-sm")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="form">Form</SelectItem>
            <SelectItem value="approval">Approval</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <ValidationMessages errors={modeValidation.errors} />

      <div className="flex items-center gap-3">
        <Label htmlFor={`insp-human-source-${nodeId}`} className="ui-meta-text text-muted-foreground">Request Source</Label>
        <Select
          value={config.requestSource}
          onValueChange={(v) => onChange({ ...config, requestSource: v as HumanNodeConfig["requestSource"] })}
        >
          <SelectTrigger id={`insp-human-source-${nodeId}`} className={controlErrorClassName(requestSourceValidation.invalid, "w-44 h-control-md text-body-sm")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="static">Static</SelectItem>
            <SelectItem value="upstream_json">Upstream JSON</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <ValidationMessages errors={requestSourceValidation.errors} />

      <div>
        <Label htmlFor={`insp-human-title-${nodeId}`} className="ui-meta-text text-muted-foreground mb-1 block">
          Task Title
        </Label>
        <Input
          id={`insp-human-title-${nodeId}`}
          type="text"
          value={request.title || ""}
          onChange={(e) => updateRequest({ title: e.target.value })}
          placeholder="What the human should do"
          className={controlErrorClassName(requestValidation.invalid, "h-control-md text-body-sm")}
        />
        <ValidationMessages errors={requestValidation.errors} />
      </div>

      <div>
        <Label htmlFor={`insp-human-instructions-${nodeId}`} className="ui-meta-text text-muted-foreground mb-1 block">
          Instructions
        </Label>
        <TextareaWithMention
          id={`insp-human-instructions-${nodeId}`}
          value={request.instructions || ""}
          onChange={(e) => updateRequest({ instructions: e.target.value })}
          rows={3}
          className="min-h-[72px] resize-y font-mono text-body-sm"
          placeholder="Explain what information is needed."
        />
      </div>

      {config.requestSource === "static" && config.mode === "form" && (
        <div className="surface-inset-card px-2 py-2 space-y-2">
          <div>
            <Label htmlFor={`insp-human-field-label-${nodeId}`} className="ui-meta-text text-muted-foreground mb-1 block">
              Primary Field Label
            </Label>
            <Input
              id={`insp-human-field-label-${nodeId}`}
              type="text"
              value={firstField?.label || ""}
              onChange={(e) => updateRequest({
                fields: [{
                  ...firstField,
                  id: firstField?.id || "response",
                  type: firstField?.type || "textarea",
                  required: firstField?.required ?? true,
                  label: e.target.value,
                }],
              })}
              placeholder="Response"
              className="h-control-md text-body-sm"
            />
          </div>
          <div>
            <Label htmlFor={`insp-human-field-placeholder-${nodeId}`} className="ui-meta-text text-muted-foreground mb-1 block">
              Field Placeholder
            </Label>
            <Input
              id={`insp-human-field-placeholder-${nodeId}`}
              type="text"
              value={firstField?.placeholder || ""}
              onChange={(e) => updateRequest({
                fields: [{
                  ...firstField,
                  id: firstField?.id || "response",
                  label: firstField?.label || "Response",
                  type: firstField?.type || "textarea",
                  required: firstField?.required ?? true,
                  placeholder: e.target.value,
                }],
              })}
              placeholder="Enter the required input..."
              className="h-control-md text-body-sm"
            />
          </div>
        </div>
      )}

      <div className={controlErrorClassName(revisionsValidation.invalid, "flex items-center justify-between rounded-md border border-hairline bg-surface-2/50 px-2 py-1.5")}>
        <Label htmlFor={`insp-human-revisions-${nodeId}`} className="ui-meta-text text-muted-foreground">Allow revisions</Label>
        <Switch
          id={`insp-human-revisions-${nodeId}`}
          checked={config.allowRevisions ?? true}
          onCheckedChange={(checked) => onChange({ ...config, allowRevisions: checked })}
          aria-label="Toggle human revisions"
        />
      </div>
      <ValidationMessages errors={revisionsValidation.errors} />

      <RuntimePolicyEditor
        nodeId={nodeId}
        config={config}
        onConfigChange={onChange as (next: RuntimeConfigurableNodeConfig) => void}
      />
    </>
  )
}
