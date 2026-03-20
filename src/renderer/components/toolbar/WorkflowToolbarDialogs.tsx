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
            <DialogTitle>Rename flow</DialogTitle>
            <DialogDescription>Enter a new name for this flow.</DialogDescription>
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
            <DialogTitle>Delete flow</DialogTitle>
            <DialogDescription>
              Delete &ldquo;{deleteLabel}&rdquo;?{workflowDirty ? " You have unsaved changes that will be lost." : ""} The flow file will be permanently removed.
              <span className="block mt-1 text-status-danger font-medium">This cannot be undone.</span>
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
            <DialogTitle>Save to library</DialogTitle>
            <DialogDescription>Enter a name so you can start from this flow again.</DialogDescription>
          </CanvasDialogHeader>
          <CanvasDialogBody>
            <Input
              value={templateNameInput}
              onChange={(event) => onTemplateNameInputChange(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && onCommitSaveAsTemplate()}
              placeholder="Library name"
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
