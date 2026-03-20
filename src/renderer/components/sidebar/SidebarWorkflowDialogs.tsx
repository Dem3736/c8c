import type { WorkflowFile } from "@shared/types"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { DropdownMenuItem } from "@/components/ui/dropdown-menu"
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
import { CursorMenu } from "@/components/ui/cursor-menu"
import { SidebarConfirmDialog } from "./SidebarConfirmDialog"
import { projectFolderName } from "./projectSidebarUtils"

export interface SidebarContextMenuState {
  x: number
  y: number
  scope: "workflow" | "global_workflow"
  workflow: WorkflowFile
  projectPath?: string
}

interface SidebarWorkflowDialogsProps {
  sidebarContextMenu: SidebarContextMenuState | null
  setSidebarContextMenu: (value: SidebarContextMenuState | null) => void
  selectWorkflow: (workflow: WorkflowFile, projectPath?: string) => Promise<void>
  selectGlobalWorkflow: (workflow: WorkflowFile) => Promise<void>
  requestRenameWorkflow: (workflow: WorkflowFile) => void
  duplicateWorkflow: (workflow: WorkflowFile, projectPath?: string) => Promise<void>
  requestDeleteWorkflow: (workflow: WorkflowFile) => void
  pendingRenameWorkflow: WorkflowFile | null
  setPendingRenameWorkflow: (workflow: WorkflowFile | null) => void
  renameInput: string
  setRenameInput: (value: string) => void
  commitRenameWorkflow: () => Promise<void>
  pendingDeleteWorkflow: WorkflowFile | null
  setPendingDeleteWorkflow: (workflow: WorkflowFile | null) => void
  selectedWorkflowPath: string | null
  workflowDirty: boolean
  commitDeleteWorkflow: () => Promise<void>
  pendingRemoveProject: string | null
  setPendingRemoveProject: (projectPath: string | null) => void
  removingSelectedDirtyProject: boolean
  commitRemoveProject: () => Promise<void>
}

export function SidebarWorkflowDialogs({
  sidebarContextMenu,
  setSidebarContextMenu,
  selectWorkflow,
  selectGlobalWorkflow,
  requestRenameWorkflow,
  duplicateWorkflow,
  requestDeleteWorkflow,
  pendingRenameWorkflow,
  setPendingRenameWorkflow,
  renameInput,
  setRenameInput,
  commitRenameWorkflow,
  pendingDeleteWorkflow,
  setPendingDeleteWorkflow,
  selectedWorkflowPath,
  workflowDirty,
  commitDeleteWorkflow,
  pendingRemoveProject,
  setPendingRemoveProject,
  removingSelectedDirtyProject,
  commitRemoveProject,
}: SidebarWorkflowDialogsProps) {
  return (
    <>
      <CursorMenu
        open={sidebarContextMenu !== null}
        x={sidebarContextMenu?.x || 0}
        y={sidebarContextMenu?.y || 0}
        onOpenChange={(open) => {
          if (!open) setSidebarContextMenu(null)
        }}
      >
        {sidebarContextMenu?.scope === "workflow" && (
          <>
            <DropdownMenuItem
              onSelect={() => {
                if (!sidebarContextMenu) return
                void selectWorkflow(sidebarContextMenu.workflow, sidebarContextMenu.projectPath)
                setSidebarContextMenu(null)
              }}
            >
              Open flow
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => {
                if (!sidebarContextMenu) return
                requestRenameWorkflow(sidebarContextMenu.workflow)
                setSidebarContextMenu(null)
              }}
            >
              Rename flow
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => {
                if (!sidebarContextMenu) return
                const workflow = sidebarContextMenu.workflow
                const projectPath = sidebarContextMenu.projectPath
                setSidebarContextMenu(null)
                void duplicateWorkflow(workflow, projectPath)
              }}
            >
              Duplicate flow
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => {
                if (!sidebarContextMenu) return
                requestDeleteWorkflow(sidebarContextMenu.workflow)
                setSidebarContextMenu(null)
              }}
            >
              Delete flow
            </DropdownMenuItem>
          </>
        )}
        {sidebarContextMenu?.scope === "global_workflow" && (
          <DropdownMenuItem
            onSelect={() => {
              if (!sidebarContextMenu) return
              void selectGlobalWorkflow(sidebarContextMenu.workflow)
              setSidebarContextMenu(null)
            }}
          >
            Open global flow
          </DropdownMenuItem>
        )}
      </CursorMenu>

      <Dialog
        open={pendingRenameWorkflow !== null}
        onOpenChange={(open) => {
          if (!open) setPendingRenameWorkflow(null)
        }}
      >
        <CanvasDialogContent showCloseButton={false}>
          <CanvasDialogHeader>
            <DialogTitle>Rename flow</DialogTitle>
            <DialogDescription>Enter a new name for this flow.</DialogDescription>
          </CanvasDialogHeader>
          <CanvasDialogBody>
            <Input
              value={renameInput}
              onChange={(event) => setRenameInput(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && void commitRenameWorkflow()}
              autoFocus
            />
          </CanvasDialogBody>
          <CanvasDialogFooter>
            <DialogClose asChild>
              <Button variant="ghost" size="sm">Cancel</Button>
            </DialogClose>
            <Button size="sm" onClick={() => void commitRenameWorkflow()}>Rename</Button>
          </CanvasDialogFooter>
        </CanvasDialogContent>
      </Dialog>

      <SidebarConfirmDialog
        open={pendingDeleteWorkflow !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDeleteWorkflow(null)
        }}
        title="Delete flow"
        description={
          `Delete "${pendingDeleteWorkflow?.name || "flow"}"?` +
          (pendingDeleteWorkflow?.path === selectedWorkflowPath && workflowDirty
            ? " You have unsaved changes that will be lost."
            : "") +
          " The flow file will be permanently removed."
        }
        confirmLabel="Delete"
        onConfirm={() => void commitDeleteWorkflow()}
      />

      <SidebarConfirmDialog
        open={pendingRemoveProject !== null}
        onOpenChange={(open) => {
          if (!open) setPendingRemoveProject(null)
        }}
        title="Remove project"
        description={
          removingSelectedDirtyProject
            ? `Remove "${pendingRemoveProject ? projectFolderName(pendingRemoveProject) : "project"}" from Projects? This will discard unsaved flow changes. Files on disk will not be deleted.`
            : `Remove "${pendingRemoveProject ? projectFolderName(pendingRemoveProject) : "project"}" from Projects? This will not delete files on disk.`
        }
        confirmLabel="Remove"
        onConfirm={() => void commitRemoveProject()}
      />
    </>
  )
}
