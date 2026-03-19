import { memo, useCallback, useEffect, useMemo, useRef, useState, type Ref } from "react"
import { Provider as JotaiProvider } from "jotai"
import { useAtom, useAtomValue, useSetAtom } from "jotai"
import { FilePlus2, Folder, Inbox, LayoutTemplate, Loader2, PanelLeft, PanelLeftOpen, Search, Settings2 } from "lucide-react"
import { Toaster } from "sonner"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { ProjectSidebar } from "@/components/ProjectSidebar"
import { WorkflowPanel } from "@/components/WorkflowPanel"
import { SkillsPage } from "@/components/SkillsPage"
import { WorkflowsTemplatesPage } from "@/components/WorkflowsTemplatesPage"
import { ArtifactsPage } from "@/components/ArtifactsPage"
import { FactoryPage } from "@/components/FactoryPage"
import { SettingsPage } from "@/components/SettingsPage"
import { NotificationsPage } from "@/components/NotificationsPage"
import { OnboardingWizard } from "@/components/OnboardingWizard"
import { WorkflowCreatePage } from "@/components/WorkflowCreatePage"
import { AppStatusBar } from "@/components/AppStatusBar"
import { MultiRunDashboard } from "@/components/MultiRunDashboard"
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
  workflowCreateContextAtom,
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
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/cn"
import { toast } from "sonner"
import { resolveTemplateWorkflow } from "@/lib/web-search-backend"
import { buildTemplateRunContext } from "@/lib/workflow-entry"
import { workflowSnapshot } from "@/lib/workflow-snapshot"
import { STAGE_META } from "@/lib/template-stages"
import { toWorkflowExecutionKey } from "@/lib/workflow-execution"
import { workflowExecutionStatesAtom } from "@/features/execution"
import { buildAppShellActionEntries, buildAppShellCommandSections, buildAppShellProjectEntries, buildAppShellWorkflowEntries, type AppShellActionEntry, type AppShellCommandAction, type AppShellCommandEntry, type AppShellProjectEntry, type AppShellWorkflowEntry } from "@/lib/app-shell-command-palette"
import { applyLoadedWorkflow } from "@/components/sidebar/useWorkflowCrud"
import { useUnsavedChangesDialog } from "@/hooks/useUnsavedChangesDialog"
import { useWorkflowCreateNavigation } from "@/hooks/useWorkflowCreateNavigation"

function SidebarVisibilityToggle({
  desktopRuntime,
  sidebarOpen,
  sidebarWidth,
  onToggle,
  buttonRef,
}: {
  desktopRuntime: {
    platform: string
    titlebarHeight: number
    primaryModifierLabel: string
  }
  sidebarOpen: boolean
  sidebarWidth: number
  onToggle: () => void
  buttonRef?: Ref<HTMLButtonElement>
}) {
  const inTitlebar = desktopRuntime.titlebarHeight > 0
  if (!inTitlebar && sidebarOpen) return null

  const Icon = sidebarOpen ? PanelLeft : PanelLeftOpen
  const label = sidebarOpen ? "Hide sidebar" : "Show sidebar"
  const shortcutLabel = `${desktopRuntime.primaryModifierLabel}B`
  const positionStyle = inTitlebar
    ? desktopRuntime.platform === "macos"
      ? {
        top: 12,
        left: sidebarOpen
          ? Math.max(12, Math.round(sidebarWidth - 28))
          : 96,
      }
      : { top: Math.max(6, Math.round((desktopRuntime.titlebarHeight - 20) / 2)), left: 12 }
    : { top: 12, left: 12 }

  return (
    <div className={cn("fixed z-[60]")} style={positionStyle}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            ref={buttonRef}
            className="pointer-events-auto no-drag h-5 w-5 rounded-sm border-transparent bg-transparent p-0 text-muted-foreground hover:border-transparent hover:bg-transparent hover:text-foreground active:bg-transparent"
            onClick={onToggle}
            aria-label={`${label} (${shortcutLabel})`}
            aria-pressed={sidebarOpen}
          >
            <Icon size={17} strokeWidth={1.8} />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{label} ({shortcutLabel})</TooltipContent>
      </Tooltip>
    </div>
  )
}

function entryIcon(entry: AppShellCommandEntry) {
  if (entry.kind === "start") return FilePlus2
  if (entry.kind === "project") return Folder
  if (entry.kind === "workflow") return null
  if (entry.action === "new_process") return FilePlus2
  if (entry.action === "add_project") return Folder
  if (entry.action === "process_library") return LayoutTemplate
  if (entry.action === "inbox") return Inbox
  return Settings2
}

function isActionEntry(entry: AppShellCommandEntry): entry is AppShellActionEntry {
  return entry.kind === "action"
}

function isWorkflowEntry(entry: AppShellCommandEntry): entry is AppShellWorkflowEntry {
  return entry.kind === "workflow"
}

function isProjectEntry(entry: AppShellCommandEntry): entry is AppShellProjectEntry {
  return entry.kind === "project"
}

function AppCommandPalette({
  open,
  onOpenChange,
  entries,
  onSelect,
  primaryModifierLabel,
  selectedProject,
  projects,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  entries: AppShellCommandEntry[]
  onSelect: (entry: AppShellCommandEntry) => void
  primaryModifierLabel: string
  selectedProject: string | null
  projects: string[]
}) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)
  const itemRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  const [query, setQuery] = useState("")
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [selectionMode, setSelectionMode] = useState<"pointer" | "keyboard">("pointer")

  const sections = useMemo(
    () => buildAppShellCommandSections({
      query,
      actions: entries.filter(isActionEntry),
      projectEntries: entries.filter(isProjectEntry),
      workflows: entries.filter(isWorkflowEntry),
      selectedProject,
      projects,
    }),
    [entries, projects, query, selectedProject],
  )
  const filteredEntries = useMemo(
    () => sections.flatMap((section) => section.entries),
    [sections],
  )

  useEffect(() => {
    if (!open) {
      setQuery("")
      setSelectedIndex(0)
      setSelectionMode("pointer")
      return
    }
    window.requestAnimationFrame(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    })
  }, [open])

  useEffect(() => {
    setSelectedIndex(0)
  }, [query])

  useEffect(() => {
    if (!open) return
    const selectedEntry = filteredEntries[selectedIndex]
    if (!selectedEntry) return

    const frame = window.requestAnimationFrame(() => {
      const target = itemRefs.current[selectedEntry.id]
      if (!target || !listRef.current) return
      target.scrollIntoView({
        block: "nearest",
        inline: "nearest",
      })
    })

    return () => window.cancelAnimationFrame(frame)
  }, [filteredEntries, open, selectedIndex])

  const handleActivate = (entry: AppShellCommandEntry) => {
    onSelect(entry)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <CanvasDialogContent size="lg" className="max-w-[44rem] gap-0 p-0" showCloseButton={false}>
        <CanvasDialogHeader className="command-center-header">
          <div className="space-y-2.5">
            <div className="flex items-center gap-3">
              <div className="command-center-search-shell">
                <Search size={14} className="text-muted-foreground" />
                <Input
                  ref={inputRef}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "ArrowDown") {
                      event.preventDefault()
                      setSelectionMode("keyboard")
                      setSelectedIndex((previous) =>
                        filteredEntries.length === 0 ? 0 : Math.min(previous + 1, filteredEntries.length - 1),
                      )
                      return
                    }
                    if (event.key === "ArrowUp") {
                      event.preventDefault()
                      setSelectionMode("keyboard")
                      setSelectedIndex((previous) => Math.max(previous - 1, 0))
                      return
                    }
                    if (event.key === "Enter") {
                      const entry = filteredEntries[selectedIndex]
                      if (!entry) return
                      event.preventDefault()
                      handleActivate(entry)
                    }
                  }}
                  placeholder="Jump to a process, project, or action"
                  className="h-auto border-0 bg-transparent px-0 py-0 text-body-md shadow-none focus-visible:ring-0"
                  aria-label="Command palette"
                />
              </div>
              <span className="command-center-kbd">
                {primaryModifierLabel}K
              </span>
            </div>
            {selectedProject ? (
              <div className="px-1">
                <span className="text-sidebar-meta text-muted-foreground">
                  {`In ${selectedProject.split(/[\\/]/).filter(Boolean).pop() || selectedProject}`}
                </span>
              </div>
            ) : null}
          </div>
        </CanvasDialogHeader>

        <div
          ref={listRef}
          className="command-center-scroll"
          onPointerMove={() => {
            if (selectionMode !== "pointer") {
              setSelectionMode("pointer")
            }
          }}
        >
        <CanvasDialogBody className="py-2">
          {filteredEntries.length === 0 ? (
            <div className="command-center-empty">
              Nothing matches this query
            </div>
          ) : (
            <div className="space-y-1.5">
              {sections.map((section) => (
                <div key={section.id} className="command-center-section">
                  <p className="command-center-section-label">{section.label}</p>
                  {section.entries.map((entry) => {
                    const index = filteredEntries.findIndex((candidate) => candidate.id === entry.id)
                    const isSelected = index === selectedIndex
                    const Icon = entryIcon(entry)
                    return (
                      <button
                        key={entry.id}
                        type="button"
                        ref={(node) => {
                          itemRefs.current[entry.id] = node
                        }}
                        onMouseEnter={() => {
                          if (selectionMode !== "pointer") return
                          setSelectedIndex(index)
                        }}
                        onClick={() => handleActivate(entry)}
                        className={cn(
                          "command-center-row",
                          isSelected && "command-center-row--selected",
                        )}
                        aria-selected={isSelected}
                      >
                        <span className="command-center-icon">
                          {entry.kind === "workflow" ? (
                            entry.active ? <Loader2 size={13} className="animate-spin" /> : <span className="command-center-dot" />
                          ) : Icon ? (
                            <Icon size={14} />
                          ) : (
                            <span className="command-center-dot" />
                          )}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-body-sm text-foreground">
                            {entry.label}
                          </span>
                          {entry.kind === "workflow" ? (
                            <span className="block truncate text-sidebar-meta text-muted-foreground">
                              {entry.projectLabel}
                            </span>
                          ) : entry.subtitle ? (
                            <span className="block truncate text-sidebar-meta text-muted-foreground">
                              {entry.subtitle}
                            </span>
                          ) : null}
                        </span>
                        {entry.kind === "workflow" ? (
                          entry.active ? null : (
                            <span className="command-center-meta">
                              {entry.metaLabel}
                            </span>
                          )
                        ) : null}
                      </button>
                    )
                  })}
                </div>
              ))}
            </div>
          )}
        </CanvasDialogBody>
        </div>
        <CanvasDialogFooter className="command-center-footer">
          <div className="flex flex-wrap items-center gap-3 text-sidebar-meta text-muted-foreground">
            <span>↑↓ Move</span>
            <span>Enter Open</span>
            <span>Esc Close</span>
          </div>
          <span className="text-sidebar-meta text-muted-foreground">
            Start, open, switch
          </span>
        </CanvasDialogFooter>
      </CanvasDialogContent>
    </Dialog>
  )
}

const MainView = memo(function MainView() {
  const [mainView] = useAtom(mainViewAtom)
  const factoryBetaEnabled = useAtomValue(factoryBetaEnabledAtom)

  if (mainView === "onboarding") return <OnboardingWizard />
  if (mainView === "factory") return factoryBetaEnabled ? <FactoryPage /> : <WorkflowPanel />
  if (mainView === "workflow_create") return <WorkflowCreatePage />
  if (mainView === "skills") return <SkillsPage />
  if (mainView === "templates") return <WorkflowsTemplatesPage />
  if (mainView === "artifacts") return <ArtifactsPage />
  if (mainView === "settings") return <SettingsPage />
  if (mainView === "inbox") return <NotificationsPage />

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
  const [factoryBetaEnabled] = useAtom(factoryBetaEnabledAtom)
  const [projects, setProjects] = useAtom(projectsAtom)
  const [projectWorkflowsCache] = useAtom(projectWorkflowsCacheAtom)
  const [selectedProject, setSelectedProject] = useAtom(selectedProjectAtom)
  const [workflows, setWorkflows] = useAtom(workflowsAtom)
  const [workflowCreateContext, setWorkflowCreateContext] = useAtom(workflowCreateContextAtom)
  const [, setWorkflowSavedSnapshot] = useAtom(workflowSavedSnapshotAtom)
  const [, setSelectedWorkflowPath] = useAtom(selectedWorkflowPathAtom)
  const setSelectedFactoryId = useSetAtom(selectedFactoryIdAtom)
  const setSelectedFactoryCaseId = useSetAtom(selectedFactoryCaseIdAtom)
  const setWorkflowTemplateContextForKey = useSetAtom(setWorkflowTemplateContextForKeyAtom)
  const setTemplateLibraryContext = useSetAtom(templateLibraryContextAtom)
  const [, setProviderSettings] = useAtom(providerSettingsAtom)
  const [, setProviderAvailability] = useAtom(providerAvailabilityAtom)
  const [, setProviderAuthStatus] = useAtom(providerAuthStatusAtom)
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
  const quickSwitchEntries = useMemo(
    () => commandPaletteEntries.filter(isWorkflowEntry).slice(0, 9),
    [commandPaletteEntries],
  )

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
    if (!(await confirmDiscard("open another process", workflowDirty))) {
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
      toast.error(`Failed to open process: ${String(error)}`)
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
      toast.error(`Failed to add project: ${String(error)}`)
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
      if (event.defaultPrevented || event.altKey) return
      const target = event.target as HTMLElement | null
      const tagName = target?.tagName
      const isEditable = Boolean(
        target?.isContentEditable
        || tagName === "INPUT"
        || tagName === "TEXTAREA"
        || target?.closest("[contenteditable=true]"),
      )
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

      if (key === "k" && !event.shiftKey) {
        event.preventDefault()
        setCommandPaletteOpen((open) => !open)
        return
      }

      if (key === "n" && !event.shiftKey) {
        event.preventDefault()
        openWorkflowCreate()
        return
      }

      if (!event.shiftKey && /^[1-9]$/.test(key)) {
        if (isEditable) return
        const targetEntry = quickSwitchEntries[Number(key) - 1]
        if (!targetEntry) return
        event.preventDefault()
        void openWorkflowFromPalette({
          workflowPath: targetEntry.workflowPath,
          projectPath: targetEntry.projectPath,
        })
        return
      }

      if (key === "k" && event.shiftKey) {
        event.preventDefault()
        if (mainView !== "thread") {
          setMainView("thread")
        }
        setChatPanelOpen((open) => !open)
        return
      }

      if (key === "b" && !event.shiftKey) {
        if (isEditable) return
        event.preventDefault()
        toggleSidebar()
      }
    }

    window.addEventListener("keydown", handler)
    return () => {
      window.removeEventListener("keydown", handler)
    }
  }, [desktopRuntime.primaryModifierKey, mainView, openWorkflowCreate, openWorkflowFromPalette, quickSwitchEntries, setChatPanelOpen, setMainView, toggleSidebar])

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
    toast.success(`Template "${deepLinkTemplate.name}" applied`, {
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
      <SidebarVisibilityToggle
        desktopRuntime={desktopRuntime}
        sidebarOpen={sidebarOpen}
        sidebarWidth={sidebarWidth}
        onToggle={() => toggleSidebar()}
        buttonRef={sidebarToggleRef}
      />

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
