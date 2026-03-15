import { useEffect, useMemo, useState } from "react"
import { useAtom, useAtomValue } from "jotai"
import { cn } from "@/lib/cn"
import {
  currentWorkflowAtom,
  defaultProviderAtom,
  inputValueAtom,
  inputAttachmentsAtom,
  providerSettingsAtom,
  selectedWorkflowPathAtom,
} from "@/lib/store"
import { resolveWorkflowInput } from "@/lib/input-type"
import type { InputNodeConfig } from "@shared/types"
import { getDefaultModelForProvider, modelLooksCompatible } from "@shared/provider-metadata"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { File, History, Type, X, Plus } from "lucide-react"
import { TextareaWithMention } from "@/components/input/TextareaWithMention"
import { FilePicker } from "@/components/input/FilePicker"
import { RunPicker } from "@/components/input/RunPicker"
import { TextAttachmentEditor } from "@/components/input/TextAttachmentEditor"
import { ProviderModelSelect, ProviderSelect } from "@/components/provider-controls"

interface InputPanelProps {
  label?: string
  compact?: boolean
}

export function InputPanel({ label = "Input", compact = false }: InputPanelProps = {}) {
  const [inputValue, setInputValue] = useAtom(inputValueAtom)
  const [workflow, setWorkflow] = useAtom(currentWorkflowAtom)
  const defaultProvider = useAtomValue(defaultProviderAtom)
  const providerSettings = useAtomValue(providerSettingsAtom)
  const [selectedWorkflowPath] = useAtom(selectedWorkflowPathAtom)
  const [attachments, setAttachments] = useAtom(inputAttachmentsAtom)
  const [touched, setTouched] = useState(false)
  const [filePickerOpen, setFilePickerOpen] = useState(false)
  const [runPickerOpen, setRunPickerOpen] = useState(false)
  const [textEditorOpen, setTextEditorOpen] = useState(false)
  const [editingTextIndex, setEditingTextIndex] = useState<number | undefined>(undefined)

  const inputNode = workflow.nodes.find((node) => node.type === "input")
  const inputConfig = (inputNode?.config || {}) as InputNodeConfig
  const workflowProvider = workflow.defaults?.provider || defaultProvider
  const workflowModel = workflow.defaults?.model || getDefaultModelForProvider(workflowProvider)
  const resolvedInput = resolveWorkflowInput(inputValue, {
    inputType: inputConfig.inputType,
    required: inputConfig.required,
    defaultValue: inputConfig.defaultValue,
  })
  const forcedInputType = inputConfig.inputType && inputConfig.inputType !== "auto" ? inputConfig.inputType : null

  const inputTypeLabel =
    !resolvedInput.value.trim()
      ? "—"
      : resolvedInput.type === "url"
        ? "URL"
        : resolvedInput.type === "directory"
          ? "Directory"
          : "Text"
  const showError = touched && !resolvedInput.valid
  const placeholder =
    inputConfig.placeholder ||
    "Enter your input text, paste a URL, or describe what to process..."

  useEffect(() => {
    setTouched(false)
    setAttachments([])
  }, [selectedWorkflowPath, setAttachments])

  const removeAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index))
  }

  const handleEditText = (index: number) => {
    setEditingTextIndex(index)
    setTextEditorOpen(true)
  }

  const handleAddText = () => {
    setEditingTextIndex(undefined)
    setTextEditorOpen(true)
  }

  const existingFilePaths = useMemo(
    () => new Set(attachments.filter((a) => a.kind === "file").map((a) => a.path)),
    [attachments],
  )

  const handleFileMention = (file: { name: string; relativePath: string }) => {
    if (existingFilePaths.has(file.relativePath)) return
    setAttachments((prev) => [
      ...prev,
      { kind: "file" as const, path: file.relativePath, name: file.name },
    ])
  }

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
    <section
      className={cn(
        "rounded-lg surface-panel ui-fade-slide-in",
        compact ? "p-2.5 space-y-2" : "p-4 space-y-3",
      )}
    >
      <label htmlFor="workflow-input" className="section-kicker">
        {label}
      </label>

      <TextareaWithMention
        id="workflow-input"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onBlur={() => setTouched(true)}
        onFileMention={handleFileMention}
        existingFilePaths={existingFilePaths}
        placeholder={placeholder}
        rows={compact ? 2 : 4}
        aria-invalid={showError || undefined}
        aria-describedby={showError ? "input-hint input-error" : "input-hint"}
        className={cn(
          "resize-y bg-surface-2/90",
          compact ? "min-h-[3.25rem] max-h-[10rem]" : "min-h-[6rem] max-h-[24rem]",
        )}
      />

      {/* Attachment chips */}
      <div className="flex flex-wrap items-center gap-1.5">
        {attachments.map((att, i) => (
          <Badge
            key={`${att.kind}-${i}`}
            variant="outline"
            className="gap-1.5 pl-1.5 pr-1 py-0.5 max-w-[200px] cursor-default"
          >
            {att.kind === "file" && <File size={12} className="flex-shrink-0 text-muted-foreground" aria-hidden="true" />}
            {att.kind === "run" && <History size={12} className="flex-shrink-0 text-muted-foreground" aria-hidden="true" />}
            {att.kind === "text" && <Type size={12} className="flex-shrink-0 text-muted-foreground" aria-hidden="true" />}
            <span
              className="ui-meta-text truncate"
              title={att.kind === "file" ? att.path : att.kind === "run" ? `${att.workflowName} (${att.runId.slice(0, 8)})` : att.label}
              onClick={att.kind === "text" ? () => handleEditText(i) : undefined}
              role={att.kind === "text" ? "button" : undefined}
              tabIndex={att.kind === "text" ? 0 : undefined}
              onKeyDown={att.kind === "text" ? (e) => { if (e.key === "Enter" || e.key === " ") handleEditText(i) } : undefined}
            >
              {att.kind === "file" && att.name}
              {att.kind === "run" && att.workflowName}
              {att.kind === "text" && att.label}
            </span>
            <button
              type="button"
              onClick={() => removeAttachment(i)}
              className="ml-0.5 rounded-sm p-0.5 text-muted-foreground hover:text-foreground hover:bg-surface-3 ui-transition-colors ui-motion-fast"
              aria-label={`Remove ${att.kind === "file" ? att.name : att.kind === "run" ? att.workflowName : att.label}`}
            >
              <X size={10} aria-hidden="true" />
            </button>
          </Badge>
        ))}
      </div>

      <div className={cn("control-cluster control-cluster-compact flex flex-wrap items-center gap-1.5", compact && "gap-1")}>
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
              <DropdownMenuItem onSelect={handleAddText}>
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
            className="control-pill-compact w-[104px] border-hairline bg-surface-1/85 shadow-inset-highlight-subtle"
            ariaLabel="Workflow provider"
          />
          <ProviderModelSelect
            provider={workflowProvider}
            value={workflowModel}
            onValueChange={(model) => updateWorkflowDefaults({ model })}
            className="control-pill-compact w-[124px] border-hairline bg-surface-1/85 tabular-nums shadow-inset-highlight-subtle"
            ariaLabel="Workflow model"
          />
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-1">
          <span role="status" aria-live="polite">
            <Badge variant="outline" size="compact" className="control-badge control-badge-compact rounded-full border-hairline bg-surface-1/80">
              Type: {inputTypeLabel}
            </Badge>
          </span>
          {forcedInputType && (
            <span className="ui-meta-text text-muted-foreground">
              Locked to {forcedInputType}
            </span>
          )}
          {resolvedInput.usedDefault && (
            <Badge variant="secondary" size="compact" className="control-badge control-badge-compact rounded-full">Using default value</Badge>
          )}
          <span id="input-hint" className="ui-meta-text text-muted-foreground">
            {compact
              ? inputConfig.required === false
                ? "Optional input."
                : "Auto-detected type."
              : inputConfig.required === false
                ? "Optional input. Empty state falls back to the workflow default."
                : "Paste text, a URL, or a project path."}
          </span>
        </div>
      </div>

      {showError && (
        <p id="input-error" role="alert" className="ui-meta-text text-status-danger">
          {resolvedInput.message}
        </p>
      )}

      {/* Picker dialogs */}
      <FilePicker open={filePickerOpen} onOpenChange={setFilePickerOpen} />
      <RunPicker open={runPickerOpen} onOpenChange={setRunPickerOpen} />
      <TextAttachmentEditor
        open={textEditorOpen}
        onOpenChange={setTextEditorOpen}
        editIndex={editingTextIndex}
      />
    </section>
  )
}
