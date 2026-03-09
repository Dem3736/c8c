import { useState, useRef, useCallback, useEffect } from "react"
import { useAtom } from "jotai"
import { Send, Square } from "lucide-react"
import { cn } from "@/lib/cn"
import { Button } from "@/components/ui/button"
import { chatDraftByWorkflowAtom, selectedWorkflowPathAtom } from "@/lib/store"

interface ChatInputProps {
  onSend: (message: string) => void
  onCancel: () => void
  isStreaming?: boolean
  autoFocus?: boolean
}

export function ChatInput({ onSend, onCancel, isStreaming, autoFocus = false }: ChatInputProps) {
  const [value, setValue] = useState("")
  const [selectedWorkflowPath] = useAtom(selectedWorkflowPathAtom)
  const [chatDraftByWorkflow, setChatDraftByWorkflow] = useAtom(chatDraftByWorkflowAtom)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const sendShortcutLabel = "Enter"
  const sendShortcutAriaLabel = "Enter"

  useEffect(() => {
    if (!selectedWorkflowPath) {
      setValue("")
      return
    }
    setValue(chatDraftByWorkflow[selectedWorkflowPath] || "")
  }, [chatDraftByWorkflow, selectedWorkflowPath])

  useEffect(() => {
    if (!textareaRef.current) return
    textareaRef.current.style.height = "auto"
    textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 160)}px`
  }, [value])

  const handleSend = useCallback(() => {
    const trimmed = value.trim()
    if (!trimmed || isStreaming) return
    onSend(trimmed)
    setValue("")
    if (selectedWorkflowPath) {
      setChatDraftByWorkflow((prev) => ({ ...prev, [selectedWorkflowPath]: "" }))
    }
    // Reset textarea height
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
    // Auto-resize
    const ta = e.target
    ta.style.height = "auto"
    ta.style.height = Math.min(ta.scrollHeight, 160) + "px"
  }

  return (
    <div className="border-t border-hairline p-3 bg-surface-1">
      <div className="relative">
        <textarea
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
          className={cn(
            "w-full resize-none rounded-lg border border-hairline bg-surface-2 px-3 py-2 pr-10",
            "text-body-md text-foreground placeholder:text-muted-foreground/60",
            "focus:outline-none focus:ring-1 focus:ring-primary/40 focus:border-primary/40",
            "disabled:border-hairline disabled:bg-surface-2/75 disabled:text-foreground/75 disabled:cursor-not-allowed",
          )}
        />
        <div className="absolute right-1.5 bottom-1.5">
          {isStreaming ? (
            <Button
              type="button"
              onClick={onCancel}
              aria-label="Cancel generation"
              title="Cancel (Esc)"
              variant="ghost"
              size="icon"
              className="bg-destructive/10 text-destructive hover:bg-destructive/20 hover:text-destructive"
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
                "h-control-sm w-control-sm rounded-md transition-colors ui-motion-fast",
                value.trim() && !isStreaming
                  ? "bg-primary/10 text-primary hover:bg-primary/20"
                  : "text-muted-foreground/70 cursor-not-allowed",
              )}
              variant="ghost"
              size="icon"
            >
              <Send size={14} aria-hidden="true" />
            </Button>
          )}
        </div>
      </div>
      <p className="ui-meta-text text-muted-foreground/50 mt-1 px-1" aria-hidden="true">
        {sendShortcutLabel} send · Shift+Enter newline · Esc cancel
      </p>
      <span className="sr-only">Press {sendShortcutAriaLabel} to send, Shift Enter for a new line, Escape to cancel generation</span>
    </div>
  )
}
