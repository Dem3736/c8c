import { useEffect, useRef } from "react"
import { useAtom } from "jotai"
import {
  selectedProjectAtom,
  selectedWorkflowPathAtom,
  currentWorkflowAtom,
  viewModeAtom,
  chatPanelOpenAtom,
  workflowDirtyAtom,
  runStatusAtom,
} from "@/lib/store"
import { InputPanel } from "./InputPanel"
import { ChainBuilder } from "./ChainBuilder"
import { CanvasView } from "./CanvasView"
import { Toolbar } from "./Toolbar"
import { OutputPanel } from "./OutputPanel"
import { TemplateBrowser } from "./TemplateBrowser"
import { GenerateWorkflow } from "./GenerateWorkflow"
import { BatchPanel } from "./BatchPanel"
import { ApprovalDialog } from "./ApprovalDialog"
import { ChatPanel } from "./chat/ChatPanel"
import { WorkflowSettingsPanel } from "./WorkflowSettingsPanel"
import { useWorkflowReset } from "@/hooks/useWorkflowReset"
import { useChainExecution } from "@/hooks/useChainExecution"
import { List, LayoutGrid, SlidersHorizontal, FolderOpen, FileStack, PencilLine, type LucideIcon } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { SectionErrorBoundary } from "@/components/ui/error-boundary"

function EmptyState({ icon: Icon, title, description }: { icon: LucideIcon; title: string; description: string }) {
  return (
    <div className="flex-1 flex items-center justify-center text-muted-foreground pt-[var(--titlebar-height)]">
      <div className="text-center rounded-lg surface-soft px-8 py-7">
        <div className="mx-auto mb-3 h-control-lg w-control-lg rounded-md border border-hairline bg-surface-2/90 flex items-center justify-center ui-elevation-inset">
          <Icon size={20} className="opacity-70" aria-hidden="true" />
        </div>
        <p className="mb-1 text-title-md text-foreground">{title}</p>
        <p className="text-body-md">{description}</p>
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
  const [workflowDirty] = useAtom(workflowDirtyAtom)
  const [runStatus] = useAtom(runStatusAtom)
  const { run, cancel, rerunFrom, continueRun } = useChainExecution()
  const listScrollRegionRef = useRef<HTMLDivElement | null>(null)
  const outputPanelRef = useRef<HTMLDivElement | null>(null)
  const previousRunStatusRef = useRef(runStatus)
  const pendingListAutoScrollRef = useRef(false)

  useWorkflowReset()

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

  const hasMeaningfulContent = workflow.nodes.length > 0
    || workflow.name.trim().length > 0
    || (workflow.description || "").trim().length > 0

  if (!selectedProject && !hasMeaningfulContent) {
    return (
      <EmptyState
        icon={FolderOpen}
        title="Open a project"
        description="Choose a project folder in the sidebar to begin"
      />
    )
  }

  if (!selectedWorkflowPath && !hasMeaningfulContent) {
    return (
      <EmptyState
        icon={FileStack}
        title="Pick a workflow"
        description="Choose an existing workflow or create a new one from the sidebar"
      />
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
            <div className="ui-content-shell py-4 flex flex-wrap items-start gap-3">
              <div className="flex-1 min-w-[280px] group/workflow-meta">
                <div className="mb-1 flex items-center gap-2">
                  <Label htmlFor="workflow-name" className="section-kicker text-muted-foreground">Workflow Name</Label>
                  <span className="ui-meta-text inline-flex items-center gap-1 text-muted-foreground transition-opacity group-focus-within/workflow-meta:opacity-0">
                    <PencilLine size={11} />
                    click to edit
                  </span>
                </div>
                <Input
                  id="workflow-name"
                  type="text"
                  value={workflow.name || ""}
                  onChange={(e) =>
                    setWorkflow((prev) => ({ ...prev, name: e.target.value }))
                  }
                  disabled={runStatus === "running"}
                  placeholder="Workflow name"
                  className="h-auto border-none bg-transparent px-0 py-0 text-title-lg font-semibold shadow-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/20"
                />
                <Label htmlFor="workflow-description" className="sr-only">Workflow description</Label>
                <Input
                  id="workflow-description"
                  type="text"
                  value={workflow.description || ""}
                  onChange={(e) =>
                    setWorkflow((prev) => ({ ...prev, description: e.target.value }))
                  }
                  disabled={runStatus === "running"}
                  placeholder="What does this workflow do?"
                  className="mt-1 h-auto border-none bg-transparent px-0 py-0 text-body-md text-muted-foreground shadow-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/20"
                />
                {workflowDirty && (
                  <p className="mt-2 ui-meta-text text-status-warning">Unsaved changes</p>
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
                  Settings
                </TabsTrigger>
              </TabsList>
            </div>
          </div>

          {/* Content */}
          <TabsContent value="canvas" className="mt-0 flex-1 min-h-0 flex flex-col overflow-hidden ui-fade-slide-in">
            <div className="flex-1 min-h-0 overflow-hidden">
              <SectionErrorBoundary sectionName="canvas view">
                <CanvasView />
              </SectionErrorBoundary>
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
            <div className="ui-content-shell py-6 space-y-6">
              <InputPanel />
              <SectionErrorBoundary sectionName="chain builder">
                <ChainBuilder />
              </SectionErrorBoundary>
              <div ref={outputPanelRef} id="run-output-panel" className="scroll-mt-4">
                <SectionErrorBoundary sectionName="output panel">
                  <OutputPanel onRerunFrom={rerunFrom} onContinueRun={continueRun} />
                </SectionErrorBoundary>
              </div>
            </div>
          </TabsContent>
        </Tabs>

        <TemplateBrowser />
        <GenerateWorkflow />
        <BatchPanel />
        <ApprovalDialog />
      </div>

      {/* Chat panel — right side */}
      {chatOpen && selectedWorkflowPath && (
        <SectionErrorBoundary sectionName="chat panel">
          <ChatPanel onClose={() => setChatOpen(false)} />
        </SectionErrorBoundary>
      )}
    </div>
  )
}
