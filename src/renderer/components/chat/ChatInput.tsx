import { useState, useRef, useCallback, useEffect } from "react"
import { useAtom, useAtomValue } from "jotai"
import { Send, Square } from "lucide-react"
import { cn } from "@/lib/cn"
import { Button } from "@/components/ui/button"
import { PromptComposer } from "@/components/ui/prompt-composer"
import {
  chatDraftByWorkflowAtom,
  currentWorkflowAtom,
  defaultProviderAtom,
  desktopRuntimeAtom,
  providerSettingsAtom,
  selectedWorkflowPathAtom,
} from "@/lib/store"
import { matchesPrimaryShortcut } from "@/lib/keyboard-shortcuts"
import { ProviderSelect } from "@/components/provider-controls"

interface ChatInputProps {
  onSend: (message: string) => void
  onCancel: () => void
  isStreaming?: boolean
  autoFocus?: boolean
}

export function ChatInput({ onSend, onCancel, isStreaming, autoFocus = false }: ChatInputProps) {
  const [value, setValue] = useState("")
  const [isCompact, setIsCompact] = useState(false)
  const [selectedWorkflowPath] = useAtom(selectedWorkflowPathAtom)
  const [workflow, setWorkflow] = useAtom(currentWorkflowAtom)
  const [defaultProvider] = useAtom(defaultProviderAtom)
  const [providerSettings] = useAtom(providerSettingsAtom)
  const [chatDraftByWorkflow, setChatDraftByWorkflow] = useAtom(chatDraftByWorkflowAtom)
  const desktopRuntime = useAtomValue(desktopRuntimeAtom)
  const composerRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const activeWorkflowDraft = selectedWorkflowPath ? (chatDraftByWorkflow[selectedWorkflowPath] || "") : ""
  const sendShortcutLabel = `${desktopRuntime.primaryModifierLabel}↵`
  const sendShortcutAriaLabel = desktopRuntime.primaryModifierKey === "meta" ? "Command Enter" : "Control Enter"
  const activeProvider = workflow.defaults?.provider || defaultProvider
  const shortcutHint = isCompact
    ? isStreaming
      ? `${sendShortcutLabel} send · Esc cancel`
      : `${sendShortcutLabel} send`
    : `${sendShortcutLabel} send · Enter newline${isStreaming ? " · Esc cancel" : ""}`

  useEffect(() => {
    if (!selectedWorkflowPath) {
      setValue("")
      return
    }
    setValue(activeWorkflowDraft)
  }, [activeWorkflowDraft, selectedWorkflowPath])

  useEffect(() => {
    const element = composerRef.current
    if (!element || typeof ResizeObserver === "undefined") return

    const observer = new ResizeObserver(([entry]) => {
      const nextWidth = entry.contentRect.width
      setIsCompact(nextWidth < 560)
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const handleSend = useCallback(() => {
    const trimmed = value.trim()
    if (!trimmed || isStreaming) return
    onSend(trimmed)
    setValue("")
    if (selectedWorkflowPath) {
      setChatDraftByWorkflow((prev) => ({ ...prev, [selectedWorkflowPath]: "" }))
    }
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto"
    }
  }, [isStreaming, onSend, selectedWorkflowPath, setChatDraftByWorkflow, value])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (matchesPrimaryShortcut(e, { key: "Enter", primaryModifierKey: desktopRuntime.primaryModifierKey })) {
      e.preventDefault()
      handleSend()
    }
    if (e.key === "Escape" && isStreaming) {
      e.preventDefault()
      onCancel()
    }
  }

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const nextValue = e.target.value
    setValue(nextValue)
    if (selectedWorkflowPath) {
      setChatDraftByWorkflow((prev) => ({ ...prev, [selectedWorkflowPath]: nextValue }))
    }
  }

  return (
    <div className="border-t border-hairline p-3 bg-surface-1">
      <PromptComposer
        ref={textareaRef}
        id="chat-input"
        aria-label="Message input"
        aria-busy={isStreaming}
        autoFocus={autoFocus}
        value={value}
        onChange={handleInput}
        onKeyDown={handleKeyDown}
        placeholder="Ask the agent to refine the flow, adjust the result, or change how it works..."
        rows={1}
        spellCheck
        autoCorrect="on"
        maxHeight={160}
        shellClassName="rounded-[1.25rem]"
        textareaClassName="min-h-0"
        action={isStreaming ? (
          <button
            type="button"
            onClick={onCancel}
            aria-label="Cancel generation"
            title="Cancel (Esc)"
            className="ui-icon-button h-control-lg w-control-lg rounded-full surface-danger-soft text-status-danger ui-fade-slide-in"
          >
            <Square size={14} aria-hidden="true" />
          </button>
        ) : (
          <Button
            type="button"
            onClick={handleSend}
            disabled={!value.trim() || isStreaming}
            aria-label="Send message"
            title={`Send (${sendShortcutLabel})`}
            className="h-control-lg w-control-lg rounded-full"
            variant="send"
            size="icon"
          >
            <Send size={16} aria-hidden="true" />
          </Button>
        )}
        footer={(
          <div
            ref={composerRef}
            className={cn(
              isCompact
                ? "flex flex-col items-start gap-2"
                : "flex items-center justify-between gap-3",
            )}
          >
            <ProviderSelect
              value={activeProvider}
              onValueChange={(provider) => setWorkflow((prev) => ({
                ...prev,
                defaults: {
                  ...(prev.defaults || {}),
                  provider,
                },
              }))}
              codexEnabled={providerSettings.features.codexProvider}
              labelMode={isCompact ? "short" : "full"}
              className={cn(
                "border-0 bg-surface-2/90 shadow-none",
                isCompact
                  ? "h-control-md w-32 rounded-md"
                  : "h-control-lg w-48 rounded-md",
              )}
            />
            <p
              className={cn(
                "ui-meta-text text-muted-foreground",
                isCompact ? "text-left" : "text-right",
              )}
              aria-hidden="true"
            >
              {shortcutHint}
            </p>
          </div>
        )}
      />
      <span className="sr-only">Press {sendShortcutAriaLabel} to send, Enter for a new line, Escape to cancel generation</span>
    </div>
  )
}
