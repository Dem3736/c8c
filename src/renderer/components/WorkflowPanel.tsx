import { useEffect, useRef } from "react"
import { useAtom } from "jotai"
import { cn } from "@/lib/cn"
import {
  chatStatusAtom,
  selectedProjectAtom,
  selectedWorkflowPathAtom,
  currentWorkflowAtom,
  viewModeAtom,
  chatPanelOpenAtom,
  workflowDirtyAtom,
  mainViewAtom,
  workflowCreatePendingMessageAtom,
} from "@/lib/store"
import { runStatusAtom } from "@/features/execution"
import { InputPanel } from "./InputPanel"
import { ChainBuilder } from "./ChainBuilder"
import { CanvasView } from "./CanvasView"
import { NodeInspector } from "./canvas/NodeInspector"
import { Toolbar } from "./Toolbar"
import { OutputPanel } from "./OutputPanel"
import { BatchPanel } from "./BatchPanel"
import { ApprovalDialog } from "./ApprovalDialog"
import { ChatPanel } from "./chat/ChatPanel"
import { WorkflowSettingsPanel } from "./WorkflowSettingsPanel"
import { workflowHasMeaningfulContent } from "@/lib/workflow-content"
import { useWorkflowReset } from "@/hooks/useWorkflowReset"
import { useWorkflowValidation } from "@/hooks/useWorkflowValidation"
import { useUndoRedo } from "@/hooks/useUndoRedo"
import { useChainExecution } from "@/hooks/useChainExecution"
import {
  List,
  LayoutGrid,
  SlidersHorizontal,
  FolderOpen,
  FileStack,
  LayoutTemplate,
  PencilLine,
  Loader2,
  Sparkles,
  type LucideIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { SectionErrorBoundary } from "@/components/ui/error-boundary"

function EmptyState({ icon: Icon, title, description, children }: { icon: LucideIcon; title: string; description: string; children?: React.ReactNode }) {
  return (
    <div className="flex-1 flex items-center justify-center text-muted-foreground pt-[var(--titlebar-height)]">
      <div className="ui-empty-state rounded-lg surface-soft px-8">
        <div className="mx-auto mb-3 h-control-lg w-control-lg rounded-md border border-hairline bg-surface-2/90 flex items-center justify-center ui-elevation-inset">
          <Icon size={20} className="opacity-70" aria-hidden="true" />
        </div>
        <p className="mb-1 text-title-md text-foreground">{title}</p>
        <p className="text-body-md">{description}</p>
        {children && <div className="mt-4 flex items-center justify-center gap-2">{children}</div>}
      </div>
    </div>
  )
}

function WorkflowDraftSkeleton() {
  return (
    <div className="rounded-lg surface-panel p-5 ui-fade-slide-in">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-foreground shadow-inset-highlight">
          <Sparkles size={18} aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-title-sm text-foreground">
            <Loader2 size={14} className="animate-spin text-status-info" />
            Building the first workflow draft
          </div>
          <p className="mt-2 text-body-sm text-muted-foreground">
            The agent is turning your prompt into concrete steps. This list will populate as soon as the structure is ready.
          </p>
        </div>
      </div>
      <div className="mt-5 space-y-3" aria-hidden="true">
        {Array.from({ length: 3 }).map((_, index) => (
          <div
            key={`workflow-draft-skeleton-${index}`}
            className="animate-pulse rounded-xl border border-hairline bg-surface-2/70 px-4 py-4"
          >
            <div className="h-4 w-40 rounded bg-surface-3" />
            <div className="mt-3 h-3 w-full rounded bg-surface-3" />
            <div className="mt-2 h-3 w-5/6 rounded bg-surface-3" />
          </div>
        ))}
      </div>
    </div>
  )
}

export function WorkflowPanel() {
  const [selectedProject] = useAtom(selectedProjectAtom)
  const [selectedWorkflowPath] = useAtom(selectedWorkflowPathAtom)
  const [workflow, setWorkflow] = useAtom(currentWorkflowAtom)
  const [viewMode, setViewMode] = useAtom(viewModeAtom)
  const [chatOpen, setChatOpen] = useAtom(chatPanelOpenAtom)
  const [chatStatus] = useAtom(chatStatusAtom)
  const [workflowDirty] = useAtom(workflowDirtyAtom)
  const [runStatus] = useAtom(runStatusAtom)
  const [pendingCreateMessage] = useAtom(workflowCreatePendingMessageAtom)
  const [, setMainView] = useAtom(mainViewAtom)
  const { run, cancel, rerunFrom, continueRun } = useChainExecution()
  const listScrollRegionRef = useRef<HTMLDivElement | null>(null)
  const outputPanelRef = useRef<HTMLDivElement | null>(null)
  const previousRunStatusRef = useRef(runStatus)
  const pendingListAutoScrollRef = useRef(false)

  useWorkflowReset()
  useWorkflowValidation()
  useUndoRedo()

  useEffect(() => {
    const previousRunStatus = previousRunStatusRef.current
    if (runStatus === "running" && previousRunStatus !== "running") {
      pendingListAutoScrollRef.current = true
    }
    if (runStatus !== "running") {
      pendingListAutoScrollRef.current = false
    }
    previousRunStatusRef.current = runStatus
  }, [runStatus])

  useEffect(() => {
    if (viewMode === "list" && runStatus === "running" && pendingListAutoScrollRef.current) {
      const listScrollRegion = listScrollRegionRef.current
      const outputPanel = outputPanelRef.current
      if (listScrollRegion && outputPanel) {
        const padding = 16
        const regionRect = listScrollRegion.getBoundingClientRect()
        const panelRect = outputPanel.getBoundingClientRect()
        const panelAboveViewport = panelRect.top < regionRect.top + padding
        const panelBelowViewport = panelRect.bottom > regionRect.bottom - padding

        if (panelAboveViewport || panelBelowViewport) {
          const targetTop = listScrollRegion.scrollTop + panelRect.top - regionRect.top - padding
          listScrollRegion.scrollTo({ top: Math.max(0, targetTop), behavior: "smooth" })
        }
      }
      pendingListAutoScrollRef.current = false
    }
  }, [runStatus, viewMode])

  const hasMeaningfulContent = workflowHasMeaningfulContent(workflow)
  const workflowHasGeneratedSteps = workflow.nodes.some(
    (node) => node.type !== "input" && node.type !== "output",
  )
  const showCreateDraftSkeleton = (
    viewMode === "list"
    && selectedWorkflowPath != null
    && (
      pendingCreateMessage?.workflowPath === selectedWorkflowPath
      || (
        (chatStatus === "thinking" || chatStatus === "streaming")
        && !workflowHasGeneratedSteps
      )
    )
  )

  if (!selectedProject && !hasMeaningfulContent) {
    return (
      <EmptyState
        icon={FolderOpen}
        title="Open a project"
        description="Choose a project folder in the sidebar to begin"
      >
        <Button
          variant="outline"
          size="sm"
          onClick={() => void window.api.addProject()}
        >
          <FolderOpen size={14} />
          Open project folder
        </Button>
      </EmptyState>
    )
  }

  if (!selectedWorkflowPath && !hasMeaningfulContent) {
    return (
      <EmptyState
        icon={FileStack}
        title="Pick a workflow"
        description="Choose an existing workflow or create a new one from the sidebar"
      >
        <Button variant="outline" size="sm" onClick={() => setMainView("templates")}>
          <LayoutTemplate size={14} />
          Start from template
        </Button>
      </EmptyState>
    )
  }

  return (
    <div className="flex-1 min-h-0 flex overflow-hidden pt-[var(--titlebar-height)]">
      {/* Main workflow editor area */}
      <div role="region" aria-label="Workflow editor" className="flex-1 min-h-0 flex flex-col overflow-hidden min-w-0">
        <Toolbar onRun={run} onCancel={cancel} />

        <Tabs
          value={viewMode}
          onValueChange={(next) => setViewMode(next as "list" | "canvas" | "settings")}
          className="flex-1 min-h-0 flex flex-col overflow-hidden"
        >
          <div className="border-b border-hairline bg-surface-1">
            <div className="ui-content-shell flex flex-wrap items-center gap-3 py-2.5">
              <div className="flex min-w-[280px] flex-1 items-center gap-2">
                <span
                  className="inline-flex h-control-sm w-control-sm shrink-0 items-center justify-center rounded-md border border-hairline bg-surface-2/80 text-muted-foreground ui-elevation-inset"
                  aria-hidden="true"
                >
                  <PencilLine size={13} />
                </span>
                <Label htmlFor="workflow-name" className="sr-only">Workflow name</Label>
                <Input
                  id="workflow-name"
                  type="text"
                  value={workflow.name || ""}
                  onChange={(e) =>
                    setWorkflow((prev) => ({ ...prev, name: e.target.value }))
                  }
                  disabled={runStatus === "running" || runStatus === "paused"}
                  placeholder="Workflow name"
                  className="h-auto min-w-0 flex-1 border-none bg-transparent px-0 py-0 text-title-md font-semibold shadow-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/20"
                />
                {workflowDirty && (
                  <Badge variant="warning" className="ui-meta-text shrink-0 px-2 py-1">
                    Unsaved
                  </Badge>
                )}
              </div>
              <TabsList className="h-control-md shrink-0" aria-label="View mode">
                <TabsTrigger value="list" className="px-3 py-1">
                  <List size={13} aria-hidden="true" className="mr-1.5" />
                  Steps
                </TabsTrigger>
                <TabsTrigger value="canvas" className="px-3 py-1">
                  <LayoutGrid size={13} aria-hidden="true" className="mr-1.5" />
                  Canvas
                </TabsTrigger>
                <TabsTrigger value="settings" className="px-3 py-1">
                  <SlidersHorizontal size={13} aria-hidden="true" className="mr-1.5" />
                  Defaults
                </TabsTrigger>
              </TabsList>
            </div>
          </div>

          {/* Content */}
          <TabsContent value="canvas" className="mt-0 flex-1 min-h-0 flex flex-col overflow-hidden ui-fade-slide-in">
            <div className="flex-1 min-h-0 flex overflow-hidden">
              <div className="flex-1 min-h-0 min-w-0 overflow-hidden">
                <SectionErrorBoundary sectionName="canvas view">
                  <CanvasView />
                </SectionErrorBoundary>
              </div>
              <NodeInspector />
            </div>
            <div className="ui-scroll-region border-t border-hairline overflow-y-auto h-[clamp(120px,30vh,320px)]">
              <div className="ui-content-shell py-6 space-y-6">
                <InputPanel />
                <SectionErrorBoundary sectionName="output panel">
                  <OutputPanel onRerunFrom={rerunFrom} onContinueRun={continueRun} />
                </SectionErrorBoundary>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="settings" className="mt-0 ui-scroll-region flex-1 min-h-0 overflow-y-auto ui-fade-slide-in">
            <div className="ui-content-shell py-6 space-y-6">
              <WorkflowSettingsPanel />
            </div>
          </TabsContent>

          <TabsContent
            value="list"
            ref={listScrollRegionRef}
            className="mt-0 ui-scroll-region flex-1 min-h-0 overflow-y-auto ui-fade-slide-in"
          >
            <div className="ui-content-shell py-3 space-y-3">
              {showCreateDraftSkeleton ? (
                <WorkflowDraftSkeleton />
              ) : (
                <>
                  <SectionErrorBoundary sectionName="chain builder">
                    <ChainBuilder compact />
                  </SectionErrorBoundary>
                  <div ref={outputPanelRef} id="run-output-panel" className="scroll-mt-4">
                    <SectionErrorBoundary sectionName="output panel">
                      <OutputPanel onRerunFrom={rerunFrom} onContinueRun={continueRun} />
                    </SectionErrorBoundary>
                  </div>
                </>
              )}
            </div>
          </TabsContent>
        </Tabs>

        <BatchPanel />
        <ApprovalDialog />
      </div>

      {/* Agent panel — right side */}
      {chatOpen && selectedWorkflowPath && (
        <SectionErrorBoundary sectionName="Agent panel">
          <ChatPanel onClose={() => setChatOpen(false)} />
        </SectionErrorBoundary>
      )}
    </div>
  )
}
