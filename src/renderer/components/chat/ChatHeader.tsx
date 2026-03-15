import { useState } from "react"
import { Undo2, Trash2, PanelRightClose, Loader2 } from "lucide-react"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import { cn } from "@/lib/cn"
import { Button } from "@/components/ui/button"
import {
  CanvasDialogContent,
  CanvasDialogHeader,
  CanvasDialogFooter,
  Dialog,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from "@/components/ui/dialog"

interface ChatHeaderProps {
  onClose: () => void
  onUndo: () => void
  onClear: () => void
  canUndo: boolean
  messageCount: number
  status: "idle" | "thinking" | "streaming" | "error"
  activeToolName: string | null
  title?: string
}

export function ChatHeader({
  onClose,
  onUndo,
  onClear,
  canUndo,
  messageCount,
  status,
  activeToolName,
  title = "Agent",
}: ChatHeaderProps) {
  const [confirmClearOpen, setConfirmClearOpen] = useState(false)
  const statusLabel = status === "error"
    ? "Error"
    : activeToolName
      ? `Editing: ${activeToolName}`
      : status === "streaming"
        ? "Responding"
        : status === "thinking"
          ? "Thinking"
          : null

  return (
    <div className="flex items-center gap-2 px-3 py-2 border-b border-hairline bg-surface-1/90 backdrop-blur-sm">
      <span className="text-body-sm font-semibold text-foreground flex-1">{title}</span>

      {statusLabel && (
        <span
          role="status"
          aria-live="polite"
          className={cn(
            "ui-status-badge ui-meta-text max-w-[170px] truncate",
            status === "error"
              ? "ui-status-badge-danger"
              : "ui-status-badge-info",
          )}
        >
          {status === "error" ? (
            <span className="font-semibold">!</span>
          ) : (
            <Loader2 size={11} className="animate-spin" />
          )}
          <span className="truncate" title={statusLabel}>{statusLabel}</span>
        </span>
      )}

      {messageCount > 0 && (
        <span
          className="ui-meta-text text-muted-foreground/50 tabular-nums"
          aria-label={`${messageCount} messages`}
        >
          {messageCount}
        </span>
      )}

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            onClick={onUndo}
            disabled={!canUndo || status !== "idle"}
            aria-label="Undo last change"
            variant="ghost"
            size="icon"
            className={cn(
              "ui-transition-colors ui-motion-fast",
              canUndo && status === "idle"
                ? "text-muted-foreground hover:text-foreground hover:bg-surface-3"
                : "text-muted-foreground/70 cursor-not-allowed",
            )}
          >
            <Undo2 size={13} />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Undo last change</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            onClick={() => setConfirmClearOpen(true)}
            disabled={messageCount === 0 || status !== "idle"}
            aria-label="Clear Agent history"
            variant="ghost"
            size="icon"
            className={cn(
              "ui-transition-colors ui-motion-fast",
              messageCount > 0 && status === "idle"
                ? "text-muted-foreground hover:text-foreground hover:bg-surface-3"
                : "text-muted-foreground/70 cursor-not-allowed",
            )}
          >
            <Trash2 size={13} />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Clear Agent history</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            onClick={onClose}
            aria-label="Close Agent panel"
            variant="ghost"
            size="icon"
            className="text-muted-foreground ui-transition-colors ui-motion-fast hover:text-foreground hover:bg-surface-3"
          >
            <PanelRightClose size={13} />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Close Agent panel</TooltipContent>
      </Tooltip>

      <Dialog open={confirmClearOpen} onOpenChange={setConfirmClearOpen}>
        <CanvasDialogContent showCloseButton={false}>
          <CanvasDialogHeader>
            <DialogTitle>Clear Agent history?</DialogTitle>
            <DialogDescription>Clear the current conversation? This cannot be undone.</DialogDescription>
          </CanvasDialogHeader>
          <CanvasDialogFooter>
            <DialogClose asChild>
              <Button variant="ghost" size="sm">Cancel</Button>
            </DialogClose>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => {
                setConfirmClearOpen(false)
                onClear()
              }}
            >
              Clear
            </Button>
          </CanvasDialogFooter>
        </CanvasDialogContent>
      </Dialog>
    </div>
  )
}
