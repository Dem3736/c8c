import { FolderPlus, Loader2 } from "lucide-react"
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
import type {
  CreateEntryHelpModeHint,
  CreateEntryRouteClarification,
  WorkflowTemplate,
} from "@shared/types"
import { getWorkflowTemplateDisplayName } from "@/lib/template-display"
import { PendingTemplateDetails } from "@/components/create/TemplateSuggestionCard"

export function RouteClarificationDialog({
  clarification,
  onClose,
  onSelect,
}: {
  clarification: CreateEntryRouteClarification | null
  onClose: () => void
  onSelect: (helpMode: CreateEntryHelpModeHint) => void
}) {
  return (
    <Dialog open={clarification !== null} onOpenChange={(open) => !open && onClose()}>
      <CanvasDialogContent showCloseButton={false} size="md">
        <CanvasDialogHeader>
          <DialogTitle>{clarification?.title || "Choose how to start"}</DialogTitle>
          <DialogDescription>
            {clarification?.message || "Pick the kind of help you want first."}
          </DialogDescription>
        </CanvasDialogHeader>
        <CanvasDialogBody className="space-y-2">
          {clarification?.options.map((option) => (
            <Button
              key={option.value}
              type="button"
              variant="outline"
              size="sm"
              disabled={option.disabled}
              onClick={() => onSelect(option.value)}
              className="h-auto w-full justify-start rounded-lg px-3 py-3 text-left"
            >
              <span className="min-w-0">
                <span className="block text-body-sm font-medium text-foreground">{option.label}</span>
                {option.description ? (
                  <span className="mt-0.5 block text-sidebar-meta text-muted-foreground">{option.description}</span>
                ) : null}
              </span>
            </Button>
          ))}
        </CanvasDialogBody>
        <CanvasDialogFooter>
          <DialogClose asChild>
            <Button variant="ghost" size="sm">Cancel</Button>
          </DialogClose>
        </CanvasDialogFooter>
      </CanvasDialogContent>
    </Dialog>
  )
}

export function PendingTemplateDialog({
  pendingTemplate,
  pendingQuickStartLabel,
  targetProjectPath,
  targetProjectName,
  pendingTemplateIntentLabel,
  pendingTemplateExecutionSummary,
  openingProject,
  templateAction,
  pendingPrimaryActionLabel,
  onClose,
  onOpenProject,
  onCustomize,
  onCreate,
}: {
  pendingTemplate: WorkflowTemplate | null
  pendingQuickStartLabel: string | null
  targetProjectPath: string | null
  targetProjectName: string | null
  pendingTemplateIntentLabel: string | null
  pendingTemplateExecutionSummary: string | null
  openingProject: boolean
  templateAction: "create" | "customize" | null
  pendingPrimaryActionLabel: string
  onClose: () => void
  onOpenProject: () => void
  onCustomize: (template: WorkflowTemplate) => void
  onCreate: (template: WorkflowTemplate) => void
}) {
  return (
    <Dialog open={pendingTemplate !== null} onOpenChange={(open) => !open && onClose()}>
      <CanvasDialogContent showCloseButton={false} size="lg">
        <CanvasDialogHeader>
          <DialogTitle>{pendingQuickStartLabel ? `Start ${pendingQuickStartLabel}` : "Start from this starting point"}</DialogTitle>
          <DialogDescription>
            &ldquo;{pendingQuickStartLabel || (pendingTemplate ? getWorkflowTemplateDisplayName(pendingTemplate) : "")}&rdquo; is ready in the selected project.
          </DialogDescription>
        </CanvasDialogHeader>
        <CanvasDialogBody className="space-y-3">
          {targetProjectPath ? (
            <div className="rounded-lg surface-inset-card px-3 py-3">
              <p className="ui-meta-text text-muted-foreground">Selected project</p>
              <p className="mt-1 ui-body-text-medium text-foreground">{targetProjectName}</p>
            </div>
          ) : (
            <div className="rounded-lg surface-inset-card px-3 py-3 text-body-sm text-muted-foreground">
              Select or add a project first so this starting point has somewhere to start.
            </div>
          )}
          <PendingTemplateDetails
            intentLabel={pendingTemplateIntentLabel}
            executionSummary={pendingTemplateExecutionSummary}
          />
        </CanvasDialogBody>
        <CanvasDialogFooter>
          {!targetProjectPath ? (
            <Button
              variant="outline"
              size="sm"
              onClick={onOpenProject}
              disabled={openingProject}
            >
              {openingProject ? <Loader2 size={14} className="animate-spin" /> : <FolderPlus size={14} />}
              Add project
            </Button>
          ) : null}
          <DialogClose asChild>
            <Button variant="ghost" size="sm">Cancel</Button>
          </DialogClose>
          <Button
            variant="outline"
            size="sm"
            disabled={!pendingTemplate || !targetProjectPath || templateAction !== null}
            isLoading={templateAction === "customize"}
            loadingText="Opening with agent"
            onClick={() => pendingTemplate && onCustomize(pendingTemplate)}
          >
            Refine with agent
          </Button>
          <Button
            size="sm"
            disabled={!pendingTemplate || !targetProjectPath || templateAction !== null}
            isLoading={templateAction === "create"}
            loadingText="Creating flow"
            onClick={() => pendingTemplate && onCreate(pendingTemplate)}
          >
            {pendingPrimaryActionLabel}
          </Button>
        </CanvasDialogFooter>
      </CanvasDialogContent>
    </Dialog>
  )
}
