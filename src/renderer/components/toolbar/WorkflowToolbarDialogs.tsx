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
import { Input } from "@/components/ui/input"

interface WorkflowToolbarDialogsProps {
  renameDialogOpen: boolean
  onRenameDialogOpenChange: (open: boolean) => void
  renameInput: string
  onRenameInputChange: (value: string) => void
  onCommitRename: () => void
  deleteDialogOpen: boolean
  onDeleteDialogOpenChange: (open: boolean) => void
  deleteLabel: string
  workflowDirty: boolean
  onCommitDelete: () => void
  templateDialogOpen: boolean
  onTemplateDialogOpenChange: (open: boolean) => void
  templateNameInput: string
  onTemplateNameInputChange: (value: string) => void
  onCommitSaveAsTemplate: () => void
}

export function WorkflowToolbarDialogs({
  renameDialogOpen,
  onRenameDialogOpenChange,
  renameInput,
  onRenameInputChange,
  onCommitRename,
  deleteDialogOpen,
  onDeleteDialogOpenChange,
  deleteLabel,
  workflowDirty,
  onCommitDelete,
  templateDialogOpen,
  onTemplateDialogOpenChange,
  templateNameInput,
  onTemplateNameInputChange,
  onCommitSaveAsTemplate,
}: WorkflowToolbarDialogsProps) {
  return (
    <>
      <Dialog open={renameDialogOpen} onOpenChange={onRenameDialogOpenChange}>
        <CanvasDialogContent showCloseButton={false}>
          <CanvasDialogHeader>
            <DialogTitle>Rename workflow</DialogTitle>
            <DialogDescription>Enter a new name for this workflow.</DialogDescription>
          </CanvasDialogHeader>
          <CanvasDialogBody>
            <Input
              value={renameInput}
              onChange={(event) => onRenameInputChange(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && onCommitRename()}
              autoFocus
            />
          </CanvasDialogBody>
          <CanvasDialogFooter>
            <DialogClose asChild>
              <Button variant="ghost" size="sm">Cancel</Button>
            </DialogClose>
            <Button size="sm" onClick={onCommitRename}>Rename</Button>
          </CanvasDialogFooter>
        </CanvasDialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={onDeleteDialogOpenChange}>
        <CanvasDialogContent showCloseButton={false}>
          <CanvasDialogHeader>
            <DialogTitle>Delete workflow</DialogTitle>
            <DialogDescription>
              Delete &ldquo;{deleteLabel}&rdquo;?{workflowDirty ? " You have unsaved changes that will be lost." : ""} The workflow file will be permanently removed.
            </DialogDescription>
          </CanvasDialogHeader>
          <CanvasDialogFooter>
            <DialogClose asChild>
              <Button variant="ghost" size="sm">Cancel</Button>
            </DialogClose>
            <Button variant="destructive" size="sm" onClick={onCommitDelete}>
              Delete
            </Button>
          </CanvasDialogFooter>
        </CanvasDialogContent>
      </Dialog>

      <Dialog open={templateDialogOpen} onOpenChange={onTemplateDialogOpenChange}>
        <CanvasDialogContent showCloseButton={false}>
          <CanvasDialogHeader>
            <DialogTitle>Save as template</DialogTitle>
            <DialogDescription>Enter a name for this template.</DialogDescription>
          </CanvasDialogHeader>
          <CanvasDialogBody>
            <Input
              value={templateNameInput}
              onChange={(event) => onTemplateNameInputChange(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && onCommitSaveAsTemplate()}
              placeholder="Template name"
              autoFocus
            />
          </CanvasDialogBody>
          <CanvasDialogFooter>
            <DialogClose asChild>
              <Button variant="ghost" size="sm">Cancel</Button>
            </DialogClose>
            <Button size="sm" onClick={onCommitSaveAsTemplate}>Save</Button>
          </CanvasDialogFooter>
        </CanvasDialogContent>
      </Dialog>
    </>
  )
}
