import { Button } from "@/components/ui/button"
import {
  CanvasDialogContent,
  CanvasDialogFooter,
  CanvasDialogHeader,
  Dialog,
  DialogClose,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog"

interface SidebarConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  confirmLabel: string
  onConfirm: () => void
  confirmVariant?: "destructive" | "default"
}

export function SidebarConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  onConfirm,
  confirmVariant = "destructive",
}: SidebarConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <CanvasDialogContent
        showCloseButton={false}
        onInteractOutside={(event) => {
          if (confirmVariant === "destructive") {
            event.preventDefault()
          }
        }}
      >
        <CanvasDialogHeader className={confirmVariant === "destructive" ? "surface-danger-soft" : undefined}>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {description}
            {confirmVariant === "destructive" && (
              <span className="block mt-1 text-status-danger font-medium">This cannot be undone.</span>
            )}
          </DialogDescription>
        </CanvasDialogHeader>
        <CanvasDialogFooter>
          <DialogClose asChild>
            <Button variant="ghost" size="sm">Cancel</Button>
          </DialogClose>
          <Button
            variant={confirmVariant}
            size="sm"
            onClick={() => {
              onConfirm()
              onOpenChange(false)
            }}
          >
            {confirmLabel}
          </Button>
        </CanvasDialogFooter>
      </CanvasDialogContent>
    </Dialog>
  )
}
