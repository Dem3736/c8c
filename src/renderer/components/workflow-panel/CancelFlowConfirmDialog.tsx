import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  CanvasDialogContent,
  CanvasDialogFooter,
  CanvasDialogHeader,
  Dialog,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog"

interface CancelFlowConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  runStartedAt: number | null
  onConfirmCancel: () => void
}

function formatRunningMinutes(startedAt: number | null): string {
  if (!startedAt) return "several"
  const minutes = Math.floor((Date.now() - startedAt) / 60_000)
  return String(Math.max(1, minutes))
}

export function CancelFlowConfirmDialog({
  open,
  onOpenChange,
  runStartedAt,
  onConfirmCancel,
}: CancelFlowConfirmDialogProps) {
  const [displayMinutes, setDisplayMinutes] = useState(() => formatRunningMinutes(runStartedAt))

  useEffect(() => {
    if (!open) return
    setDisplayMinutes(formatRunningMinutes(runStartedAt))
  }, [open, runStartedAt])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <CanvasDialogContent
        showCloseButton={false}
        size="sm"
        onInteractOutside={(event) => event.preventDefault()}
      >
        <CanvasDialogHeader className="surface-warning-soft">
          <DialogTitle>Cancel this flow?</DialogTitle>
          <DialogDescription>
            This flow has been running for {displayMinutes} minutes.
            Cancelling will stop all remaining steps but keep any partial results.
          </DialogDescription>
        </CanvasDialogHeader>
        <CanvasDialogFooter>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
            autoFocus
          >
            Keep running
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={onConfirmCancel}
          >
            Cancel flow
          </Button>
        </CanvasDialogFooter>
      </CanvasDialogContent>
    </Dialog>
  )
}
