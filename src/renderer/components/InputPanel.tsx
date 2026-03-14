import { useEffect, useState } from "react"
import { useAtom } from "jotai"
import { cn } from "@/lib/cn"
import { currentWorkflowAtom, inputValueAtom, selectedWorkflowPathAtom } from "@/lib/store"
import { resolveWorkflowInput } from "@/lib/input-type"
import type { InputNodeConfig } from "@shared/types"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"

interface InputPanelProps {
  label?: string
  compact?: boolean
}

export function InputPanel({ label = "Input", compact = false }: InputPanelProps = {}) {
  const [inputValue, setInputValue] = useAtom(inputValueAtom)
  const [workflow] = useAtom(currentWorkflowAtom)
  const [selectedWorkflowPath] = useAtom(selectedWorkflowPathAtom)
  const [touched, setTouched] = useState(false)
  const inputNode = workflow.nodes.find((node) => node.type === "input")
  const inputConfig = (inputNode?.config || {}) as InputNodeConfig
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
  }, [selectedWorkflowPath])

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

      <Textarea
        id="workflow-input"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onBlur={() => setTouched(true)}
        placeholder={placeholder}
        rows={compact ? 2 : 4}
        aria-invalid={showError || undefined}
        aria-describedby={showError ? "input-hint input-error" : "input-hint"}
        className={cn(
          "resize-y bg-surface-2/90",
          compact ? "min-h-[3.25rem] max-h-[10rem]" : "min-h-[6rem] max-h-[24rem]",
        )}
      />

      <div className={cn("flex items-center gap-2", compact && "flex-wrap gap-y-1")}>
        <span role="status" aria-live="polite">
          <Badge variant="outline">
            Type: {inputTypeLabel}
          </Badge>
        </span>
        {forcedInputType && (
          <span className="ui-meta-text text-muted-foreground">
            Locked to {forcedInputType}
          </span>
        )}
        {resolvedInput.usedDefault && (
          <Badge variant="secondary">Using default value</Badge>
        )}
        <span id="input-hint" className="ui-meta-text">
          {compact
            ? inputConfig.required === false
              ? "Optional input."
              : "Auto-detected type."
            : inputConfig.required === false
              ? "Optional input. If empty, default value is used when provided."
              : "Auto-detected from your input. You can paste plain text, a URL, or a directory path."}
        </span>
      </div>

      {showError && (
        <p id="input-error" role="alert" className="ui-meta-text text-status-danger">
          {resolvedInput.message}
        </p>
      )}
    </section>
  )
}
