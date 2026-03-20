import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Provider as JotaiProvider } from "jotai"
import { useAtom, useAtomValue, useSetAtom } from "jotai"
import { Toaster } from "sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { ProjectSidebar } from "@/components/ProjectSidebar"
import { AppStatusBar } from "@/components/AppStatusBar"
import { MultiRunDashboard } from "@/components/MultiRunDashboard"
import { AppCommandPalette } from "@/components/app/AppCommandPalette"
import { DeepLinkTemplateDialog } from "@/components/app/DeepLinkTemplateDialog"
import { AppMainView } from "@/components/app/AppMainView"
import { RendererSmokeBridge } from "@/components/app/RendererSmokeBridge"
import { SidebarVisibilityToggle } from "@/components/app/SidebarVisibilityToggle"
import { SectionErrorBoundary } from "@/components/ui/error-boundary"
import { CliBanner } from "@/components/CliBanner"
import { ExecutionProvider } from "@/hooks/useChainExecution"
import {
  mainViewAtom,
  desktopRuntimeAtom,
  chatPanelOpenAtom,
  factoryBetaEnabledAtom,
  workflowDirtyAtom,
  cliStatusAtom,
  firstLaunchAtom,
  deepLinkPendingTemplateAtom,
  currentWorkflowAtom,
  webSearchBackendAtom,
  projectsAtom,
  projectWorkflowsCacheAtom,
  selectedProjectAtom,
  setWorkflowTemplateContextForKeyAtom,
  templateLibraryContextAtom,
  workflowsAtom,
  workflowSavedSnapshotAtom,
  selectedWorkflowPathAtom,
  selectedFactoryCaseIdAtom,
  selectedFactoryIdAtom,
  providerSettingsAtom,
  providerAvailabilityAtom,
  providerAuthStatusAtom,
  projectSidebarOpenAtom,
  projectSidebarWidthAtom,
  skillPickerOpenAtom,
  workflowCreateContextAtom,
} from "@/lib/store"
import { cn } from "@/lib/cn"
import { toast } from "sonner"
import { toastErrorFromCatch } from "@/lib/toast-error"
import { resolveTemplateWorkflow } from "@/lib/web-search-backend"
import { buildTemplateRunContext } from "@/lib/workflow-entry"
import { workflowSnapshot } from "@/lib/workflow-snapshot"
import { toWorkflowExecutionKey } from "@/lib/workflow-execution"
import { workflowExecutionStatesAtom } from "@/features/execution"
import { buildAppShellActionEntries, buildAppShellProjectEntries, buildAppShellWorkflowEntries, type AppShellCommandEntry } from "@/lib/app-shell-command-palette"
import { resolveAppShellShortcutIntent } from "@/lib/app-shell-shortcuts"
import { isEditableKeyboardTarget } from "@/lib/keyboard-shortcuts"
import { applyLoadedWorkflow } from "@/components/sidebar/useWorkflowCrud"
import { useUnsavedChangesDialog } from "@/hooks/useUnsavedChangesDialog"
import { useWorkflowCreateNavigation } from "@/hooks/useWorkflowCreateNavigation"

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
  const [factoryBetaEnabled] = useAtom(factoryBetaEnabledAtom)
  const [projects, setProjects] = useAtom(projectsAtom)
  const [projectWorkflowsCache] = useAtom(projectWorkflowsCacheAtom)
  const [selectedProject, setSelectedProject] = useAtom(selectedProjectAtom)
  const [workflows, setWorkflows] = useAtom(workflowsAtom)
  const [workflowCreateContext, setWorkflowCreateContext] = useAtom(workflowCreateContextAtom)
  const [, setWorkflowSavedSnapshot] = useAtom(workflowSavedSnapshotAtom)
  const [selectedWorkflowPath, setSelectedWorkflowPath] = useAtom(selectedWorkflowPathAtom)
  const setSelectedFactoryId = useSetAtom(selectedFactoryIdAtom)
  const setSelectedFactoryCaseId = useSetAtom(selectedFactoryCaseIdAtom)
  const setWorkflowTemplateContextForKey = useSetAtom(setWorkflowTemplateContextForKeyAtom)
  const setTemplateLibraryContext = useSetAtom(templateLibraryContextAtom)
  const [, setProviderSettings] = useAtom(providerSettingsAtom)
  const [, setProviderAvailability] = useAtom(providerAvailabilityAtom)
  const [, setProviderAuthStatus] = useAtom(providerAuthStatusAtom)
  const [, setSkillPickerOpen] = useAtom(skillPickerOpenAtom)
  const [sidebarOpen, setSidebarOpen] = useAtom(projectSidebarOpenAtom)
  const [sidebarWidth] = useAtom(projectSidebarWidthAtom)
  const [workflowExecutionStates] = useAtom(workflowExecutionStatesAtom)
  const [deepLinkTargetProject, setDeepLinkTargetProject] = useState<string | null>(selectedProject)
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)
  const sidebarShellRef = useRef<HTMLDivElement | null>(null)
  const sidebarToggleRef = useRef<HTMLButtonElement | null>(null)
  const showDragRegion = desktopRuntime.titlebarHeight > 0 && !desktopRuntime.isFullscreen
  const { confirmDiscard, unsavedChangesDialog } = useUnsavedChangesDialog()
  const { openWorkflowCreate } = useWorkflowCreateNavigation()

  const paletteWorkflowCache = useMemo(() => (
    selectedProject
      ? {
        ...projectWorkflowsCache,
        [selectedProject]: workflows,
      }
      : projectWorkflowsCache
  ), [projectWorkflowsCache, selectedProject, workflows])

  const commandPaletteProjectPath = workflowCreateContext.projectPath ?? selectedProject ?? null

  const commandPaletteEntries = useMemo(() => ([
    ...buildAppShellActionEntries(),
    ...buildAppShellProjectEntries({
      projects,
      selectedProject: commandPaletteProjectPath,
    }),
    ...buildAppShellWorkflowEntries({
      projects,
      selectedProject: commandPaletteProjectPath,
      projectWorkflowsCache: paletteWorkflowCache,
      workflowExecutionStates,
    }),
  ]), [commandPaletteProjectPath, paletteWorkflowCache, projects, workflowExecutionStates])
  const workflowCommandEntries = useMemo(
    () => commandPaletteEntries.filter((entry): entry is Extract<AppShellCommandEntry, { kind: "workflow" }> => entry.kind === "workflow"),
    [commandPaletteEntries],
  )
  const quickSwitchTargets = useMemo(() => {
    return workflowCommandEntries
      .slice(0, 5)
      .map((entry) => ({
        workflowPath: entry.workflowPath,
        projectPath: entry.projectPath,
      }))
  }, [workflowCommandEntries])
  const toggleSidebar = useCallback((nextOpen = !sidebarOpen) => {
    if (!nextOpen) {
      const activeElement = document.activeElement as HTMLElement | null
      if (activeElement && sidebarShellRef.current?.contains(activeElement)) {
        window.requestAnimationFrame(() => {
          sidebarToggleRef.current?.focus()
        })
      }
    }
    setSidebarOpen(nextOpen)
  }, [setSidebarOpen, sidebarOpen])

  const openWorkflowFromPalette = useCallback(async ({
    workflowPath,
    projectPath,
  }: {
    workflowPath: string
    projectPath: string
  }) => {
    if (!(await confirmDiscard("open another flow", workflowDirty))) {
      return
    }

    if (projectPath !== selectedProject) {
      setSelectedProject(projectPath)
      const projectWorkflows = paletteWorkflowCache[projectPath]
      if (projectWorkflows) {
        setWorkflows(projectWorkflows)
      }
    }

    setMainView("thread")
    try {
      const loadedWorkflow = await window.api.loadWorkflow(workflowPath)
      applyLoadedWorkflow(
        workflowPath,
        loadedWorkflow,
        setSelectedWorkflowPath,
        setWorkflow,
        setWorkflowSavedSnapshot,
      )
    } catch (error) {
      toastErrorFromCatch("Could not open flow", error)
    }
  }, [
    confirmDiscard,
    paletteWorkflowCache,
    selectedProject,
    setMainView,
    setSelectedProject,
    setSelectedWorkflowPath,
    setWorkflow,
    setWorkflowSavedSnapshot,
    setWorkflows,
    workflowDirty,
  ])

  const addProjectFromPalette = useCallback(async () => {
    try {
      const projectPath = await window.api.addProject()
      if (!projectPath) return
      setProjects((previous) => (previous.includes(projectPath) ? previous : [...previous, projectPath]))
      setSelectedProject(projectPath)
      setWorkflows(paletteWorkflowCache[projectPath] || [])
      if (mainView === "workflow_create" && !workflowCreateContext.locked) {
        setWorkflowCreateContext({
          projectPath,
          locked: false,
        })
      }
      toast.success(`Added ${projectPath.split(/[\\/]/).filter(Boolean).pop() || "project"}`)
    } catch (error) {
      toastErrorFromCatch("Could not add project", error)
    }
  }, [
    mainView,
    paletteWorkflowCache,
    setProjects,
    setSelectedProject,
    setWorkflowCreateContext,
    setWorkflows,
    workflowCreateContext.locked,
  ])

  const openSkillPicker = useCallback(() => {
    if (mainView !== "thread") {
      setMainView("thread")
    }
    setSkillPickerOpen(true)
  }, [mainView, setMainView, setSkillPickerOpen])

  const handleCommandPaletteSelect = useCallback((entry: AppShellCommandEntry) => {
    if (entry.kind === "start") {
      openWorkflowCreate({
        projectPath: entry.requiresProjectSelection
          ? null
          : (entry.projectPath ?? commandPaletteProjectPath ?? undefined),
        prompt: entry.prompt,
        modeId: entry.modeId,
      })
      return
    }
    if (entry.kind === "project") {
      setSelectedProject(entry.projectPath)
      const projectWorkflows = paletteWorkflowCache[entry.projectPath]
      if (projectWorkflows) {
        setWorkflows(projectWorkflows)
      }
      if (mainView === "workflow_create" && !workflowCreateContext.locked) {
        setWorkflowCreateContext({
          projectPath: entry.projectPath,
          locked: false,
        })
      }
      return
    }
    if (entry.kind === "workflow") {
      void openWorkflowFromPalette({
        workflowPath: entry.workflowPath,
        projectPath: entry.projectPath,
      })
      return
    }

    const action = entry.action
    if (action === "new_process") {
      openWorkflowCreate()
      return
    }
    if (action === "add_project") {
      void addProjectFromPalette()
      return
    }
    if (action === "process_library") {
      setTemplateLibraryContext(mainView === "workflow_create"
        ? {
          projectPath: workflowCreateContext.projectPath,
          createOnly: Boolean(workflowCreateContext.projectPath),
        }
        : null)
      setMainView("templates")
      return
    }
    if (action === "attach_skill") {
      openSkillPicker()
      return
    }
    if (action === "inbox") {
      setMainView("inbox")
      return
    }
    setMainView("settings")
  }, [
    commandPaletteProjectPath,
    addProjectFromPalette,
    mainView,
    openWorkflowCreate,
    openSkillPicker,
    openWorkflowFromPalette,
    paletteWorkflowCache,
    setMainView,
    setSelectedProject,
    setTemplateLibraryContext,
    setWorkflowCreateContext,
    setWorkflows,
    workflowCreateContext.locked,
    workflowCreateContext.projectPath,
  ])

  // Redirect to onboarding on first launch
  useEffect(() => {
    if (firstLaunch) {
      setMainView("onboarding")
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (factoryBetaEnabled) return
    setSelectedFactoryId(null)
    setSelectedFactoryCaseId(null)
    if (mainView === "factory") {
      setMainView("thread")
    }
  }, [factoryBetaEnabled, mainView, setMainView, setSelectedFactoryCaseId, setSelectedFactoryId])

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
        titlebarHeight: fallbackPlatform === "macos" ? 24 : 0,
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
      const isEditable = isEditableKeyboardTarget(event.target as HTMLElement | null)
      const intent = resolveAppShellShortcutIntent({
        event,
        primaryModifierKey: desktopRuntime.primaryModifierKey,
        isEditable,
        quickSwitchCount: quickSwitchTargets.length,
      })
      if (!intent) return

      event.preventDefault()

      if (intent.type === "open_settings") {
        setMainView("settings")
        return
      }

      if (intent.type === "toggle_command_palette") {
        setCommandPaletteOpen((open) => !open)
        return
      }

      if (intent.type === "new_flow") {
        openWorkflowCreate()
        return
      }

      if (intent.type === "attach_skill") {
        openSkillPicker()
        return
      }

      if (intent.type === "quick_switch") {
        const targetEntry = quickSwitchTargets[intent.index]
        if (!targetEntry) return
        void openWorkflowFromPalette({
          workflowPath: targetEntry.workflowPath,
          projectPath: targetEntry.projectPath,
        })
        return
      }

      if (intent.type === "toggle_thread") {
        if (mainView !== "thread") {
          setMainView("thread")
        }
        setChatPanelOpen((open) => !open)
        return
      }

      if (intent.type === "toggle_sidebar") {
        toggleSidebar()
      }
    }

    window.addEventListener("keydown", handler)
    return () => {
      window.removeEventListener("keydown", handler)
    }
  }, [desktopRuntime.primaryModifierKey, mainView, openSkillPicker, openWorkflowCreate, openWorkflowFromPalette, quickSwitchTargets, setChatPanelOpen, setMainView, toggleSidebar])

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
      toastErrorFromCatch(`Could not load library flow "${err.templateId}"`, err.error)
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
    setWorkflowTemplateContextForKey({
      key: toWorkflowExecutionKey(null),
      context: buildTemplateRunContext({
        template: {
          ...deepLinkTemplate,
          workflow: nextWorkflow,
        },
        workflowPath: null,
      }),
    })
    setMainView("thread")
    setDeepLinkTemplate(null)
    toast.success(`Library flow "${deepLinkTemplate.name}" applied`, {
      action: {
        label: "Undo",
        onClick: () => {
          setWorkflow(previousWorkflow)
          setWorkflowTemplateContextForKey({
            key: toWorkflowExecutionKey(null),
            context: null,
          })
        },
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
      setWorkflowTemplateContextForKey({
        key: toWorkflowExecutionKey(filePath),
        context: buildTemplateRunContext({
          template: {
            ...deepLinkTemplate,
            workflow: loadedWorkflow,
          },
          workflowPath: filePath,
        }),
      })
      setMainView("thread")
      setDeepLinkTemplate(null)
      toast.success(`Created "${loadedWorkflow.name || deepLinkTemplate.name}" from library`)
    } catch (error) {
      toastErrorFromCatch("Could not create flow", error)
    }
  }

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
      <SidebarVisibilityToggle
        desktopRuntime={desktopRuntime}
        sidebarOpen={sidebarOpen}
        sidebarWidth={sidebarWidth}
        onToggle={() => toggleSidebar()}
        buttonRef={sidebarToggleRef}
      />
      {__TEST_MODE__ && (
        <RendererSmokeBridge
          commandPaletteOpen={commandPaletteOpen}
          sidebarOpen={sidebarOpen}
          flowStatusRailLabels={[]}
          availableWorkflowNames={workflowCommandEntries.map((entry) => entry.label)}
        />
      )}

      <AppCommandPalette
        open={commandPaletteOpen}
        onOpenChange={setCommandPaletteOpen}
        entries={commandPaletteEntries}
        onSelect={handleCommandPaletteSelect}
        primaryModifierLabel={desktopRuntime.primaryModifierLabel}
        selectedProject={commandPaletteProjectPath}
        projects={projects}
      />

      {/* Left sidebar — projects */}
      <SectionErrorBoundary sectionName="project sidebar">
        <div
          ref={sidebarShellRef}
          aria-hidden={!sidebarOpen}
          className={cn(
            "relative h-full shrink-0 min-h-0 overflow-hidden border-r ui-motion-standard transition-[width,opacity,border-color]",
            sidebarOpen
              ? "opacity-100 border-border"
              : "opacity-0 border-transparent",
          )}
          style={{ width: sidebarOpen ? sidebarWidth : 0 }}
          inert={!sidebarOpen}
        >
          <ProjectSidebar
            collapsed={!sidebarOpen}
            onToggleVisibility={() => toggleSidebar(false)}
            showVisibilityToggle={desktopRuntime.titlebarHeight === 0}
          />
        </div>
      </SectionErrorBoundary>

      <div id="main-content" className="min-w-0 min-h-0 flex-1 flex flex-col">
        <CliBanner />
        {/* Main area — workflow editor */}
        <SectionErrorBoundary sectionName="flow view">
          <AppMainView />
        </SectionErrorBoundary>
        <SectionErrorBoundary sectionName="status bar">
          <AppStatusBar />
        </SectionErrorBoundary>
        <SectionErrorBoundary sectionName="runs dashboard">
          <MultiRunDashboard />
        </SectionErrorBoundary>
      </div>

      <DeepLinkTemplateDialog
        template={deepLinkTemplate}
        open={deepLinkTemplate !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDeepLinkTemplate(null)
          }
        }}
        projects={projects}
        targetProject={deepLinkTargetProject}
        onTargetProjectChange={setDeepLinkTargetProject}
        onCreateInProject={() => void createDeepLinkTemplate()}
        onReplaceCurrent={applyDeepLinkTemplate}
      />
      {unsavedChangesDialog}
    </div>
  )
})

export function App() {
  return (
    <JotaiProvider>
      <ExecutionProvider>
        <TooltipProvider delayDuration={180}>
          <AppShell />
          <Toaster position="bottom-right" closeButton />
        </TooltipProvider>
      </ExecutionProvider>
    </JotaiProvider>
  )
}
