import { useState, useRef, useCallback, useEffect } from "react"
import { useAtom } from "jotai"
import { Send, Square } from "lucide-react"
import { cn } from "@/lib/cn"
import { Button } from "@/components/ui/button"
import { AutosizeTextarea } from "@/components/ui/autosize-textarea"
import {
  chatDraftByWorkflowAtom,
  currentWorkflowAtom,
  defaultProviderAtom,
  providerSettingsAtom,
  selectedWorkflowPathAtom,
} from "@/lib/store"
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
  const composerRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const sendShortcutLabel = "Enter"
  const sendShortcutAriaLabel = "Enter"
  const activeProvider = workflow.defaults?.provider || defaultProvider
  const shortcutHint = isCompact
    ? isStreaming
      ? "Enter send · Esc cancel"
      : "Enter send"
    : `${sendShortcutLabel} send · Shift+Enter newline${isStreaming ? " · Esc cancel" : ""}`

  useEffect(() => {
    if (!selectedWorkflowPath) {
      setValue("")
      return
    }
    setValue(chatDraftByWorkflow[selectedWorkflowPath] || "")
  }, [chatDraftByWorkflow, selectedWorkflowPath])

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
    if (e.key === "Enter" && !e.shiftKey) {
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
      <div
        ref={composerRef}
        className="overflow-hidden rounded-lg surface-elevated transition-[border-color,box-shadow] ui-motion-fast focus-within:border-ring/60 focus-within:ring-[3px] focus-within:ring-ring/20"
      >
        <div className="relative">
          <AutosizeTextarea
            ref={textareaRef}
            id="chat-input"
            aria-label="Message input"
            aria-busy={isStreaming}
            autoFocus={autoFocus}
            value={value}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            placeholder="Describe what to build..."
            rows={1}
            spellCheck
            autoCorrect="on"
            maxHeight={160}
            className={cn(
              "w-full min-h-0 resize-none border-0 bg-transparent px-5 py-4 pr-16 shadow-none hover:border-transparent hover:bg-transparent",
              "text-body-md text-foreground placeholder:text-muted-foreground/80",
              "focus-visible:border-transparent focus-visible:ring-transparent",
              "disabled:bg-surface-2/80 disabled:text-disabled disabled:cursor-not-allowed",
            )}
          />
          <div className="absolute right-3 bottom-3">
            {isStreaming ? (
              <Button
                type="button"
                onClick={onCancel}
                aria-label="Cancel generation"
                title="Cancel (Esc)"
                variant="ghost"
                size="icon"
                className="h-control-lg w-control-lg rounded-full bg-status-danger/10 text-status-danger hover:bg-status-danger/20 hover:text-status-danger active:bg-status-danger/25"
              >
                <Square size={14} aria-hidden="true" />
              </Button>
            ) : (
              <Button
                type="button"
                onClick={handleSend}
                disabled={!value.trim() || isStreaming}
                aria-label="Send message"
                title={`Send (${sendShortcutLabel})`}
                className={cn(
                  "h-control-lg w-control-lg rounded-full ui-transition-colors ui-motion-fast",
                  value.trim() && !isStreaming
                    ? "bg-foreground text-background hover:bg-foreground/90 active:bg-foreground/85"
                    : "bg-surface-3 text-muted-foreground/70 cursor-not-allowed",
                )}
                variant="ghost"
                size="icon"
              >
                <Send size={16} aria-hidden="true" />
              </Button>
            )}
          </div>
        </div>
        <div
          className={cn(
            "border-t border-hairline/70 px-4 py-3",
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
                ? "h-control-md w-[132px] rounded-md"
                : "h-control-lg w-[190px] rounded-md",
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
      </div>
      <span className="sr-only">Press {sendShortcutAriaLabel} to send, Shift Enter for a new line, Escape to cancel generation</span>
    </div>
  )
}
