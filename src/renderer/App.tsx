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
import { AppStatusBar } from "@/components/AppStatusBar"
import { SectionErrorBoundary } from "@/components/ui/error-boundary"
import { mainViewAtom, desktopRuntimeAtom, chatPanelOpenAtom, workflowDirtyAtom } from "@/lib/store"

const MainView = memo(function MainView() {
  const [mainView] = useAtom(mainViewAtom)

  if (mainView === "skills") return <SkillsPage />
  if (mainView === "templates") return <WorkflowsTemplatesPage />
  if (mainView === "settings") return <SettingsPage />

  return <WorkflowPanel />
})

const AppShell = memo(function AppShell() {
  const [mainView, setMainView] = useAtom(mainViewAtom)
  const [, setChatPanelOpen] = useAtom(chatPanelOpenAtom)
  const [desktopRuntime, setDesktopRuntime] = useAtom(desktopRuntimeAtom)
  const workflowDirty = useAtomValue(workflowDirtyAtom)
  const showDragRegion = desktopRuntime.titlebarHeight > 0 && !desktopRuntime.isFullscreen

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
    if (!workflowDirty) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
    }
    window.addEventListener("beforeunload", handler)
    return () => window.removeEventListener("beforeunload", handler)
  }, [workflowDirty])

  return (
    <div role="application" aria-label="c8c" className="flex h-full w-full overflow-hidden bg-background text-foreground">
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

      <div className="min-w-0 min-h-0 flex-1 flex flex-col">
        {/* Main area — workflow editor */}
        <SectionErrorBoundary sectionName="workflow panel">
          <MainView />
        </SectionErrorBoundary>
        <SectionErrorBoundary sectionName="status bar">
          <AppStatusBar />
        </SectionErrorBoundary>
      </div>
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
