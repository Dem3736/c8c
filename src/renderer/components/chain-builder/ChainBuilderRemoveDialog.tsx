import { Button } from "@/components/ui/button"
import {
  CanvasDialogBody,
  CanvasDialogContent,
  CanvasDialogFooter,
  CanvasDialogHeader,
  Dialog,
  DialogClose,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog"

interface ChainBuilderRemoveDialogProps {
  open: boolean
  stepLabel: string
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}

export function ChainBuilderRemoveDialog({
  open,
  stepLabel,
  onOpenChange,
  onConfirm,
}: ChainBuilderRemoveDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <CanvasDialogContent showCloseButton={false}>
        <CanvasDialogHeader>
          <DialogTitle>Remove step?</DialogTitle>
          <DialogDescription>This will remove the step and its connections from the workflow.</DialogDescription>
        </CanvasDialogHeader>
        <CanvasDialogBody>
          <p className="text-body-md text-muted-foreground">
            Remove &ldquo;{stepLabel}&rdquo; from the chain?
          </p>
        </CanvasDialogBody>
        <CanvasDialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button variant="destructive" onClick={onConfirm}>
            Remove
          </Button>
        </CanvasDialogFooter>
      </CanvasDialogContent>
    </Dialog>
  )
}
