import { LayoutGrid, List, Loader2, PencilLine, SlidersHorizontal, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/cn"
import type { ExecutionRunStatus } from "@/lib/workflow-execution"

export function WorkflowOpenLoadingState({ flowLabel }: { flowLabel: string }) {
  return (
    <div className="flex-1 min-h-0 flex items-center justify-center px-[var(--content-gutter)]">
      <div className="w-full max-w-xl rounded-xl surface-panel p-6 ui-fade-slide-in">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-hairline bg-surface-2 text-status-info ui-elevation-inset">
            <Loader2 size={18} className="animate-spin" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <div className="text-title-sm text-foreground">
              Opening {flowLabel}
            </div>
            <p className="mt-1 text-body-sm text-muted-foreground">
              Loading the flow and restoring its step state.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

export function WorkflowOpenErrorBanner({
  flowLabel,
  message,
  onDismiss,
}: {
  flowLabel: string
  message: string | null
  onDismiss: () => void
}) {
  return (
    <div className="surface-danger-soft px-[var(--content-gutter)] py-2.5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="ui-meta-label text-status-danger">Could not open flow</div>
          <p className="mt-1 text-body-sm text-status-danger">
            Failed to open {flowLabel}. The previous flow remains open.
          </p>
          {message && (
            <p className="mt-1 ui-meta-text text-status-danger/90">
              {message}
            </p>
          )}
        </div>
        <Button variant="ghost" size="sm" onClick={onDismiss}>
          Dismiss
        </Button>
      </div>
    </div>
  )
}

export function WorkflowPanelHeader({
  runStatus,
  showEntryLanding,
  showEntryEditor,
  workflowName,
  entryTitle,
  workflowDirty,
  viewMode,
  flowSurfaceMode,
  onWorkflowNameChange,
  onToggleFlowSurfaceMode,
}: {
  runStatus: ExecutionRunStatus
  showEntryLanding: boolean
  showEntryEditor: boolean
  workflowName: string
  entryTitle?: string | null
  workflowDirty: boolean
  viewMode: "list" | "canvas" | "settings"
  flowSurfaceMode: "edit" | "outline"
  onWorkflowNameChange: (next: string) => void
  onToggleFlowSurfaceMode: () => void
}) {
  return (
    <div className="border-b border-hairline bg-surface-1">
      <div className={cn("ui-content-gutter flex flex-wrap items-center gap-3", runStatus === "idle" ? "py-2.5" : "py-2")}>
        <div className="flex min-w-[280px] flex-1 items-center gap-2">
          <span
            className="inline-flex h-control-sm w-control-sm shrink-0 items-center justify-center rounded-md border border-hairline bg-surface-2/80 text-muted-foreground ui-elevation-inset"
            aria-hidden="true"
          >
            {showEntryLanding && !showEntryEditor ? <Sparkles size={13} /> : <PencilLine size={13} />}
          </span>
          {runStatus === "idle" && !(showEntryLanding && !showEntryEditor) ? (
            <>
              <Label htmlFor="workflow-name" className="sr-only">Flow name</Label>
              <Input
                id="workflow-name"
                type="text"
                value={workflowName}
                onChange={(event) => onWorkflowNameChange(event.target.value)}
                placeholder="Flow name"
                className="h-auto min-w-0 flex-1 border-none bg-transparent px-0 py-0 text-title-md font-semibold shadow-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/20"
              />
            </>
          ) : (
            <div className="min-w-0 flex-1">
              <div className="truncate text-title-md font-semibold text-foreground">
                {workflowName || entryTitle || "Untitled flow"}
              </div>
            </div>
          )}
          {workflowDirty && (
            <Badge variant="warning" className="ui-meta-text shrink-0 px-2 py-1">
              Unsaved
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {showEntryLanding && !showEntryEditor ? (
            <Badge variant="outline" className="ui-meta-text shrink-0 px-2.5 py-1">
              Step shell
            </Badge>
          ) : (
            <TabsList className="h-control-md shrink-0" aria-label="View mode">
              <TabsTrigger value="list" className="px-3 py-1">
                <List size={13} aria-hidden="true" className="mr-1.5" />
                Flow
              </TabsTrigger>
              <TabsTrigger value="canvas" className="px-3 py-1">
                <LayoutGrid size={13} aria-hidden="true" className="mr-1.5" />
                Graph
              </TabsTrigger>
              <TabsTrigger value="settings" className="px-3 py-1">
                <SlidersHorizontal size={13} aria-hidden="true" className="mr-1.5" />
                Defaults
              </TabsTrigger>
            </TabsList>
          )}
          {viewMode === "list" && runStatus === "idle" && !showEntryLanding && (
            <Button
              variant={flowSurfaceMode === "edit" ? "secondary" : "ghost"}
              size="sm"
              className="h-control-md shrink-0"
              onClick={onToggleFlowSurfaceMode}
            >
              <PencilLine size={13} />
              {flowSurfaceMode === "edit" ? "View flow" : "Edit flow"}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
