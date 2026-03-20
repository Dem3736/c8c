import { Button } from "@/components/ui/button"
import {
  CanvasDialogContent,
  CanvasDialogFooter,
  CanvasDialogHeader,
  Dialog,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog"
import type { PreflightWarning } from "@/features/execution/preflight"

interface CostWarningDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  warning: PreflightWarning | null
  onConfirm: () => void
  onCancel: () => void
}

export function CostWarningDialog({
  open,
  onOpenChange,
  warning,
  onConfirm,
  onCancel,
}: CostWarningDialogProps) {
  if (!warning) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <CanvasDialogContent
        showCloseButton={false}
        size="sm"
        onInteractOutside={(event) => event.preventDefault()}
      >
        <CanvasDialogHeader className="surface-warning-soft">
          <DialogTitle>{warning.title}</DialogTitle>
          <DialogDescription>
            {warning.message}
          </DialogDescription>
        </CanvasDialogHeader>
        <div className="px-4 pb-3">
          <p className="ui-meta-text text-secondary">
            Worst-case breakdown: {warning.detail}
          </p>
        </div>
        <CanvasDialogFooter>
          <Button
            variant="ghost"
            size="sm"
            onClick={onCancel}
          >
            Cancel
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={onConfirm}
            autoFocus
          >
            Continue anyway
          </Button>
        </CanvasDialogFooter>
      </CanvasDialogContent>
    </Dialog>
  )
}
