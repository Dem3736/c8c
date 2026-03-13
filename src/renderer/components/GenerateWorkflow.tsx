import { useEffect, useMemo, useState } from "react"
import { useAtom } from "jotai"
import {
  generateDialogOpenAtom,
  currentWorkflowAtom,
  skillsAtom,
  selectedProjectAtom,
  selectedWorkflowPathAtom,
  workflowSavedSnapshotAtom,
  workflowsAtom,
} from "@/lib/store"
import {
  Dialog,
  CanvasDialogBody,
  CanvasDialogContent,
  CanvasDialogFooter,
  CanvasDialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Loader2, Sparkles } from "lucide-react"
import { useWorkflowGeneration } from "@/hooks/useWorkflowGeneration"

const STEP_LABELS: Record<string, string> = {
  starting: "Starting Claude...",
  thinking: "Thinking...",
  writing: "Writing workflow...",
  parsing: "Parsing result...",
  done: "Done!",
}

export function GenerateWorkflow() {
  const [open, setOpen] = useAtom(generateDialogOpenAtom)
  const [workflow, setWorkflow] = useAtom(currentWorkflowAtom)
  const [selectedWorkflowPath, setSelectedWorkflowPath] = useAtom(selectedWorkflowPathAtom)
  const [, setWorkflowSavedSnapshot] = useAtom(workflowSavedSnapshotAtom)
  const [, setWorkflows] = useAtom(workflowsAtom)
  const [skills, setSkills] = useAtom(skillsAtom)
  const [selectedProject] = useAtom(selectedProjectAtom)
  const [target, setTarget] = useState<"replace" | "new">("new")
  const {
    description,
    setDescription,
    generating,
    error,
    progress,
    generate,
    handleDialogOpenChange,
  } = useWorkflowGeneration({
    workflow,
    setWorkflow,
    selectedWorkflowPath,
    setSelectedWorkflowPath,
    setWorkflowSavedSnapshot,
    setWorkflows,
    skills,
    setSkills,
    selectedProject,
    onOpenChange: setOpen,
  })

  useEffect(() => {
    if (!open) return
    setTarget(selectedProject ? "new" : "replace")
  }, [open, selectedProject])

  const progressLabel = progress
    ? STEP_LABELS[progress.step] || `${progress.step}...`
    : null
  const generateButtonLabel = useMemo(() => {
    if (generating) return "Generating..."
    return target === "new" ? "Generate New Workflow" : "Replace Current Workflow"
  }, [generating, target])

  return (
    <Dialog
      open={open}
      onOpenChange={handleDialogOpenChange}
    >
      <CanvasDialogContent className="max-w-lg" showCloseButton={false}>
        <CanvasDialogHeader className="border-b border-hairline bg-gradient-to-b from-surface-1 to-surface-2/70">
          <DialogTitle className="flex items-center gap-2">
            <Sparkles size={18} />
            Generate Workflow
          </DialogTitle>
        </CanvasDialogHeader>

        <CanvasDialogBody className="space-y-3 pt-4 bg-surface-1/30">
          <p className="text-body-md text-muted-foreground">
            Describe what you want your workflow to do. AI will create the nodes, edges, and configuration.
          </p>

          <div className="space-y-2">
            <p className="ui-meta-text text-muted-foreground">Generate as</p>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant={target === "new" ? "default" : "outline"}
                onClick={() => setTarget("new")}
                disabled={generating || !selectedProject}
              >
                Create new workflow
              </Button>
              <Button
                type="button"
                size="sm"
                variant={target === "replace" ? "default" : "outline"}
                onClick={() => setTarget("replace")}
                disabled={generating}
              >
                Replace current
              </Button>
            </div>
            {!selectedProject && (
              <p className="ui-meta-text text-muted-foreground">
                Select a project to create a new workflow file.
              </p>
            )}
            {target === "replace" && (
              <p className="ui-meta-text text-muted-foreground">
                Replacing the current workflow keeps the file path unchanged until you save.
              </p>
            )}
          </div>

          <Textarea
            id="workflow-desc"
            aria-label="Workflow description"
            autoFocus
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={5}
            className="resize-y"
            placeholder="e.g. Take my landing page URL, analyze each section with JTBD framework, rewrite weak sections, score overall quality, iterate until score > 8"
            disabled={generating}
          />

          {generating && progress && (
            <div role="status" aria-live="polite" className="flex items-center gap-2 ui-meta-text text-muted-foreground">
              <Loader2 size={12} className="animate-spin" />
              <span>{progressLabel}</span>
              {progress.count > 0 && (
                <span className="ml-auto tabular-nums text-muted-foreground">
                  {progress.count} events
                </span>
              )}
            </div>
          )}

          {error && (
            <div role="alert" aria-live="assertive" className="ui-alert-danger text-status-danger">
              {error}
            </div>
          )}

          <div className="ui-meta-text text-muted-foreground pb-1">
            {skills.length > 0
              ? `${skills.length} skills available from your projects and libraries`
              : "No skills discovered — generic skill names will be used"}
          </div>
        </CanvasDialogBody>

        <CanvasDialogFooter className="bg-surface-1/60">
          <Button
            variant="outline"
            aria-label={generating ? "Cancel generation" : "Cancel"}
            onClick={() => handleDialogOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            variant="default"
            onClick={() => void generate(target)}
            disabled={!description.trim() || generating || (target === "new" && !selectedProject)}
          >
            {generating ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Sparkles size={16} />
                {generateButtonLabel}
              </>
            )}
          </Button>
        </CanvasDialogFooter>
      </CanvasDialogContent>
    </Dialog>
  )
}
