import { memo, useEffect, useState } from "react"
import { Provider as JotaiProvider } from "jotai"
import { useAtom, useAtomValue } from "jotai"
import { Toaster } from "sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { ProjectSidebar } from "@/components/ProjectSidebar"
import { WorkflowPanel } from "@/components/WorkflowPanel"
import { SkillsPage } from "@/components/SkillsPage"
import { WorkflowsTemplatesPage } from "@/components/WorkflowsTemplatesPage"
import { SettingsPage } from "@/components/SettingsPage"
import { OnboardingWizard } from "@/components/OnboardingWizard"
import { AppStatusBar } from "@/components/AppStatusBar"
import { MultiRunDashboard } from "@/components/MultiRunDashboard"
import { SectionErrorBoundary } from "@/components/ui/error-boundary"
import { CliBanner } from "@/components/CliBanner"
import {
  mainViewAtom,
  desktopRuntimeAtom,
  chatPanelOpenAtom,
  workflowDirtyAtom,
  cliStatusAtom,
  firstLaunchAtom,
  deepLinkPendingTemplateAtom,
  currentWorkflowAtom,
  webSearchBackendAtom,
  projectsAtom,
  selectedProjectAtom,
  workflowsAtom,
  workflowSavedSnapshotAtom,
  selectedWorkflowPathAtom,
  providerSettingsAtom,
  providerAvailabilityAtom,
  providerAuthStatusAtom,
} from "@/lib/store"
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
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import { resolveTemplateWorkflow } from "@/lib/web-search-backend"
import { workflowSnapshot } from "@/lib/workflow-snapshot"
import { STAGE_META } from "@/lib/template-stages"

const MainView = memo(function MainView() {
  const [mainView] = useAtom(mainViewAtom)

  if (mainView === "onboarding") return <OnboardingWizard />
  if (mainView === "skills") return <SkillsPage />
  if (mainView === "templates") return <WorkflowsTemplatesPage />
  if (mainView === "settings") return <SettingsPage />

  return <WorkflowPanel />
})

const AppShell = memo(function AppShell() {
  const [mainView, setMainView] = useAtom(mainViewAtom)
  const [, setChatPanelOpen] = useAtom(chatPanelOpenAtom)
  const [desktopRuntime, setDesktopRuntime] = useAtom(desktopRuntimeAtom)
  const [, setCliStatus] = useAtom(cliStatusAtom)
  const workflowDirty = useAtomValue(workflowDirtyAtom)
  const [firstLaunch] = useAtom(firstLaunchAtom)
  const [deepLinkTemplate, setDeepLinkTemplate] = useAtom(deepLinkPendingTemplateAtom)
  const [workflow, setWorkflow] = useAtom(currentWorkflowAtom)
  const [webSearchBackend] = useAtom(webSearchBackendAtom)
  const [projects] = useAtom(projectsAtom)
  const [selectedProject, setSelectedProject] = useAtom(selectedProjectAtom)
  const [, setWorkflows] = useAtom(workflowsAtom)
  const [, setWorkflowSavedSnapshot] = useAtom(workflowSavedSnapshotAtom)
  const [, setSelectedWorkflowPath] = useAtom(selectedWorkflowPathAtom)
  const [, setProviderSettings] = useAtom(providerSettingsAtom)
  const [, setProviderAvailability] = useAtom(providerAvailabilityAtom)
  const [, setProviderAuthStatus] = useAtom(providerAuthStatusAtom)
  const [deepLinkTargetProject, setDeepLinkTargetProject] = useState<string | null>(selectedProject)
  const showDragRegion = desktopRuntime.titlebarHeight > 0 && !desktopRuntime.isFullscreen

  // Redirect to onboarding on first launch
  useEffect(() => {
    if (firstLaunch) {
      setMainView("onboarding")
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    document.documentElement.dataset.platform = desktopRuntime.platform
    document.documentElement.dataset.windowFullscreen = desktopRuntime.isFullscreen ? "true" : "false"
    document.documentElement.dataset.windowMaximized = desktopRuntime.isMaximized ? "true" : "false"
    document.documentElement.style.setProperty("--titlebar-height", `${desktopRuntime.titlebarHeight}px`)
  }, [desktopRuntime])

  useEffect(() => {
    let cancelled = false

    const applyFallbackRuntime = () => {
      if (cancelled) return
      const nav = navigator as Navigator & { userAgentData?: { platform?: string } }
      const platform = (nav.userAgentData?.platform || navigator.platform || "").toLowerCase()
      const fallbackPlatform = platform.includes("mac")
        ? "macos"
        : platform.includes("win")
          ? "windows"
          : "linux"
      setDesktopRuntime({
        platform: fallbackPlatform,
        titlebarHeight: fallbackPlatform === "macos" ? 32 : 0,
        primaryModifierKey: fallbackPlatform === "macos" ? "meta" : "ctrl",
        primaryModifierLabel: fallbackPlatform === "macos" ? "⌘" : "Ctrl",
        isFullscreen: false,
        isMaximized: false,
      })
    }

    void window.api.getDesktopRuntime().then((runtime) => {
      if (cancelled) return
      setDesktopRuntime(runtime)
    }).catch(applyFallbackRuntime)

    const unsubscribeRuntime = window.api.onDesktopRuntimeChange((runtime) => {
      if (cancelled) return
      setDesktopRuntime(runtime)
    })

    return () => {
      cancelled = true
      unsubscribeRuntime()
    }
  }, [setDesktopRuntime])

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey) return
      const usesPrimaryModifier = desktopRuntime.primaryModifierKey === "meta"
        ? event.metaKey
        : event.ctrlKey
      if (!usesPrimaryModifier) return

      const key = event.key.toLowerCase()
      if (key === "," && !event.shiftKey) {
        event.preventDefault()
        setMainView("settings")
        return
      }

      if (key === "k" && event.shiftKey) {
        event.preventDefault()
        if (mainView !== "thread") {
          setMainView("thread")
        }
        setChatPanelOpen((open) => !open)
      }
    }

    window.addEventListener("keydown", handler)
    return () => {
      window.removeEventListener("keydown", handler)
    }
  }, [desktopRuntime.primaryModifierKey, mainView, setChatPanelOpen, setMainView])

  useEffect(() => {
    window.api.getClaudeCodeSubscriptionStatus().then(setCliStatus).catch(() => {})
  }, [setCliStatus])

  useEffect(() => {
    window.api.getProviderDiagnostics().then((diagnostics) => {
      setProviderSettings(diagnostics.settings)
      setProviderAvailability(diagnostics.health)
      setProviderAuthStatus(diagnostics.auth)
    }).catch(() => {})
  }, [setProviderAuthStatus, setProviderAvailability, setProviderSettings])

  // Deep link protocol subscription
  useEffect(() => {
    const unsubTemplate = window.api.onDeepLinkTemplate((template) => {
      setDeepLinkTemplate(template)
    })
    const unsubError = window.api.onDeepLinkTemplateError((err) => {
      toast.error(`Failed to load template "${err.templateId}": ${err.error}`)
    })
    return () => {
      unsubTemplate()
      unsubError()
    }
  }, [setDeepLinkTemplate])

  useEffect(() => {
    if (!workflowDirty) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
    }
    window.addEventListener("beforeunload", handler)
    return () => window.removeEventListener("beforeunload", handler)
  }, [workflowDirty])

  useEffect(() => {
    if (!deepLinkTemplate) return
    if (selectedProject && projects.includes(selectedProject)) {
      setDeepLinkTargetProject(selectedProject)
      return
    }
    setDeepLinkTargetProject(projects[0] ?? null)
  }, [deepLinkTemplate, projects, selectedProject])

  const applyDeepLinkTemplate = () => {
    if (!deepLinkTemplate) return
    const previousWorkflow = structuredClone(workflow)
    const nextWorkflow = resolveTemplateWorkflow(deepLinkTemplate, webSearchBackend)
    setWorkflow(nextWorkflow)
    setSelectedWorkflowPath(null)
    setMainView("thread")
    setDeepLinkTemplate(null)
    toast.success(`Template "${deepLinkTemplate.name}" applied`, {
      action: {
        label: "Undo",
        onClick: () => setWorkflow(previousWorkflow),
      },
    })
  }

  const createDeepLinkTemplate = async () => {
    if (!deepLinkTemplate || !deepLinkTargetProject) return
    const nextWorkflow = resolveTemplateWorkflow(deepLinkTemplate, webSearchBackend)
    try {
      const filePath = await window.api.createWorkflow(deepLinkTargetProject, deepLinkTemplate.name, nextWorkflow)
      const loadedWorkflow = await window.api.loadWorkflow(filePath)
      const refreshed = await window.api.listProjectWorkflows(deepLinkTargetProject)
      setWorkflows(refreshed)
      setSelectedProject(deepLinkTargetProject)
      setSelectedWorkflowPath(filePath)
      setWorkflow(loadedWorkflow)
      setWorkflowSavedSnapshot(workflowSnapshot(loadedWorkflow))
      setMainView("thread")
      setDeepLinkTemplate(null)
      toast.success(`Created "${loadedWorkflow.name || deepLinkTemplate.name}" from template`)
    } catch (error) {
      toast.error(`Failed to create workflow: ${String(error)}`)
    }
  }

  const nodeCount = deepLinkTemplate?.workflow.nodes.length ?? 0
  const edgeCount = deepLinkTemplate?.workflow.edges.length ?? 0

  return (
    <div role="application" aria-label="c8c" className="flex h-full w-full overflow-hidden bg-background text-foreground">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:z-[100] focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded-md focus:m-2">
        Skip to main content
      </a>
      {showDragRegion && (
        <div
          aria-hidden="true"
          className="drag-region fixed top-0 left-0 right-0 z-50"
          style={{ height: "var(--titlebar-height,0px)" }}
        />
      )}

      {/* Left sidebar — projects */}
      <SectionErrorBoundary sectionName="project sidebar">
        <ProjectSidebar />
      </SectionErrorBoundary>

      <div id="main-content" className="min-w-0 min-h-0 flex-1 flex flex-col">
        <CliBanner />
        {/* Main area — workflow editor */}
        <SectionErrorBoundary sectionName="workflow panel">
          <MainView />
        </SectionErrorBoundary>
        <SectionErrorBoundary sectionName="status bar">
          <AppStatusBar />
        </SectionErrorBoundary>
        <SectionErrorBoundary sectionName="runs dashboard">
          <MultiRunDashboard />
        </SectionErrorBoundary>
      </div>

      {/* Deep link template confirmation */}
      <Dialog open={deepLinkTemplate !== null} onOpenChange={(open) => !open && setDeepLinkTemplate(null)}>
        <CanvasDialogContent showCloseButton={false}>
          <CanvasDialogHeader>
            <DialogTitle>Template from c8c Hub</DialogTitle>
            <DialogDescription>
              Do you want to use &ldquo;{deepLinkTemplate?.name}&rdquo;?
            </DialogDescription>
          </CanvasDialogHeader>
          {deepLinkTemplate && (
            <CanvasDialogBody className="space-y-2">
              {deepLinkTemplate.description && (
                <p className="text-body-sm text-muted-foreground">{deepLinkTemplate.description}</p>
              )}
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline">{STAGE_META[deepLinkTemplate.stage].label}</Badge>
                <span className="ui-meta-text text-muted-foreground">
                  {nodeCount} node{nodeCount === 1 ? "" : "s"} · {edgeCount} edge{edgeCount === 1 ? "" : "s"}
                </span>
              </div>
              {projects.length > 0 ? (
                <div className="space-y-1">
                  <p className="ui-meta-text text-muted-foreground">Create in project</p>
                  <Select
                    value={deepLinkTargetProject ?? ""}
                    onValueChange={(value) => setDeepLinkTargetProject(value)}
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
                  Add a project in sidebar to create a workflow file from this template.
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
              disabled={!deepLinkTargetProject}
              onClick={() => void createDeepLinkTemplate()}
            >
              Create in project
            </Button>
            <Button variant="outline" size="sm" onClick={applyDeepLinkTemplate}>
              Replace current
            </Button>
          </CanvasDialogFooter>
        </CanvasDialogContent>
      </Dialog>
    </div>
  )
})

export function App() {
  return (
    <JotaiProvider>
      <TooltipProvider delayDuration={180}>
        <AppShell />
        <Toaster position="bottom-right" closeButton />
      </TooltipProvider>
    </JotaiProvider>
  )
}
