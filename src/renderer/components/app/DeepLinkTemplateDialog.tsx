import type { WorkflowTemplate } from "@shared/types"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  CanvasDialogBody,
  CanvasDialogContent,
  CanvasDialogFooter,
  CanvasDialogHeader,
  DialogClose,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface DeepLinkTemplateDialogProps {
  template: WorkflowTemplate | null
  open: boolean
  onOpenChange: (open: boolean) => void
  projects: string[]
  targetProject: string | null
  onTargetProjectChange: (value: string) => void
  onCreateInProject: () => void
  onReplaceCurrent: () => void
}

export function DeepLinkTemplateDialog({
  template,
  open,
  onOpenChange,
  projects,
  targetProject,
  onTargetProjectChange,
  onCreateInProject,
  onReplaceCurrent,
}: DeepLinkTemplateDialogProps) {
  const nodeCount = template?.workflow.nodes.length ?? 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <CanvasDialogContent showCloseButton={false}>
        <CanvasDialogHeader>
          <DialogTitle>Start with this</DialogTitle>
          <DialogDescription>
            &ldquo;{template?.name}&rdquo; is ready. Choose where to start it.
          </DialogDescription>
        </CanvasDialogHeader>
        {template && (
          <CanvasDialogBody className="space-y-2">
            {template.description && (
              <p className="text-body-sm text-muted-foreground">{template.description}</p>
            )}
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline">From c8c Hub</Badge>
              <span className="ui-meta-text text-muted-foreground">
                {nodeCount} step{nodeCount === 1 ? "" : "s"} ready
              </span>
            </div>
            {projects.length > 0 ? (
              <div className="space-y-1">
                <p className="ui-meta-text text-muted-foreground">Create in project</p>
                <Select
                  value={targetProject ?? ""}
                  onValueChange={onTargetProjectChange}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select project" />
                  </SelectTrigger>
                  <SelectContent>
                    {projects.map((projectPath) => {
                      const projectName = projectPath.split(/[\\/]/).pop() || projectPath
                      return (
                        <SelectItem key={projectPath} value={projectPath}>
                          {projectName}
                        </SelectItem>
                      )
                    })}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <p className="text-body-sm text-muted-foreground">
                Add a project in the sidebar to create this flow there.
              </p>
            )}
          </CanvasDialogBody>
        )}
        <CanvasDialogFooter>
          <DialogClose asChild>
            <Button variant="ghost" size="sm">Cancel</Button>
          </DialogClose>
          <Button
            size="sm"
            disabled={!targetProject}
            onClick={onCreateInProject}
          >
            Create in project
          </Button>
          <Button variant="outline" size="sm" onClick={onReplaceCurrent}>
            Replace current draft
          </Button>
        </CanvasDialogFooter>
      </CanvasDialogContent>
    </Dialog>
  )
}
