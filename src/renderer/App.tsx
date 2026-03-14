import { memo, useEffect } from "react"
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
  selectedWorkflowPathAtom,
} from "@/lib/store"
import {
  Dialog,
  CanvasDialogContent,
  CanvasDialogFooter,
  CanvasDialogHeader,
  DialogClose,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import { applyWebSearchBackendPreset } from "@/lib/web-search-backend"

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
  const [, setSelectedWorkflowPath] = useAtom(selectedWorkflowPathAtom)
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

  const applyDeepLinkTemplate = () => {
    if (!deepLinkTemplate) return
    const previousWorkflow = structuredClone(workflow)
    const nextWorkflow = applyWebSearchBackendPreset(
      deepLinkTemplate.workflow,
      deepLinkTemplate.category,
      webSearchBackend,
    )
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
            <div className="space-y-2 px-1">
              {deepLinkTemplate.description && (
                <p className="text-body-sm text-muted-foreground">{deepLinkTemplate.description}</p>
              )}
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className="capitalize">{deepLinkTemplate.category}</Badge>
                <span className="ui-meta-text text-muted-foreground">
                  {nodeCount} node{nodeCount === 1 ? "" : "s"} · {edgeCount} edge{edgeCount === 1 ? "" : "s"}
                </span>
              </div>
            </div>
          )}
          <CanvasDialogFooter>
            <DialogClose asChild>
              <Button variant="ghost" size="sm">Cancel</Button>
            </DialogClose>
            <Button size="sm" onClick={applyDeepLinkTemplate}>
              Use Template
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
