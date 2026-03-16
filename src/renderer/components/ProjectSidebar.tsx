import { useEffect, useRef, useState } from "react"
import { useAtom, useSetAtom } from "jotai"
import {
  projectsAtom,
  selectedProjectAtom,
  expandedProjectsAtom,
  workflowsAtom,
  selectedWorkflowPathAtom,
  projectSidebarWidthAtom,
  currentWorkflowAtom,
  skillsAtom,
  mainViewAtom,
  workflowDirtyAtom,
  workflowSavedSnapshotAtom,
  unreadInboxCountAtom,
  type WorkflowFile,
} from "@/lib/store"
import {
  clearWorkflowExecutionStateAtom,
  moveWorkflowExecutionStateAtom,
  pastRunsAtom,
  toWorkflowExecutionKey,
  workflowExecutionStatesAtom,
} from "@/features/execution"
import { cn } from "@/lib/cn"
import { SIDEBAR_MAX_WIDTH, SIDEBAR_MIN_WIDTH } from "@/lib/sidebar-layout"
import {
  FolderOpen,
  Globe,
  FilePlus2,
  Plus,
  Sparkles,
  LayoutTemplate,
  Inbox,
  Settings,
  Pencil,
  Trash2,
  Loader2,
  MoreHorizontal,
  ChevronRight,
  PanelLeftClose,
} from "lucide-react"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  CanvasDialogBody,
  CanvasDialogContent,
  CanvasDialogFooter,
  CanvasDialogHeader,
  Dialog,
  DialogClose,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog"
import { useUnsavedChangesDialog } from "@/hooks/useUnsavedChangesDialog"
import { SidebarNavItem } from "@/components/sidebar/SidebarNavItem"
import { SidebarConfirmDialog } from "@/components/sidebar/SidebarConfirmDialog"
import { CursorMenu } from "@/components/ui/cursor-menu"
import {
  formatRelativeTime,
  historicalRunVisual,
  latestRunByWorkflowPath,
  projectFolderName,
  workflowHasActiveRunStatus,
} from "@/components/sidebar/projectSidebarUtils"
import { useProjectSidebarData } from "@/components/sidebar/useProjectSidebarData"
import { useSidebarResize } from "@/components/sidebar/useSidebarResize"
import { useWorkflowCrud } from "@/components/sidebar/useWorkflowCrud"
import { useWorkflowCreateNavigation } from "@/hooks/useWorkflowCreateNavigation"

interface ProjectSidebarProps {
  collapsed?: boolean
  onProjectAdd?: (projectPath: string) => void
  onWorkflowCreate?: (workflowPath: string) => void
  onToggleVisibility?: () => void
  showVisibilityToggle?: boolean
}

const PROJECT_WORKFLOW_PREVIEW_LIMIT = 10

export function ProjectSidebar({
  collapsed = false,
  onProjectAdd,
  onWorkflowCreate,
  onToggleVisibility,
  showVisibilityToggle = false,
}: ProjectSidebarProps = {}) {
  const sidebarRef = useRef<HTMLElement | null>(null)
  const scrollHideTimerRef = useRef<number | null>(null)
  const [projects, setProjects] = useAtom(projectsAtom)
  const [selectedProject, setSelectedProject] = useAtom(selectedProjectAtom)
  const [expandedProjects, setExpandedProjects] = useAtom(expandedProjectsAtom)
  const [workflows, setWorkflows] = useAtom(workflowsAtom)
  const [selectedWorkflowPath, setSelectedWorkflowPath] = useAtom(selectedWorkflowPathAtom)
  const [workflowDirty] = useAtom(workflowDirtyAtom)
  const [sidebarWidth, setSidebarWidth] = useAtom(projectSidebarWidthAtom)
  const [currentWorkflow, setCurrentWorkflow] = useAtom(currentWorkflowAtom)
  const [pastRuns] = useAtom(pastRunsAtom)
  const [workflowExecutionStates] = useAtom(workflowExecutionStatesAtom)
  const [, setWorkflowSavedSnapshot] = useAtom(workflowSavedSnapshotAtom)
  const [, setSkills] = useAtom(skillsAtom)
  const [mainView, setMainView] = useAtom(mainViewAtom)
  const [unreadInboxCount] = useAtom(unreadInboxCountAtom)
  const moveWorkflowExecutionState = useSetAtom(moveWorkflowExecutionStateAtom)
  const clearWorkflowExecutionState = useSetAtom(clearWorkflowExecutionStateAtom)
  const [workflowSearchQuery, setWorkflowSearchQuery] = useState("")
  const [expandedWorkflowLists, setExpandedWorkflowLists] = useState<Record<string, boolean>>({})
  const [sidebarScrolling, setSidebarScrolling] = useState(false)
  const [sidebarContextMenu, setSidebarContextMenu] = useState<{
    x: number
    y: number
    scope: "workflow" | "global_workflow"
    workflow: WorkflowFile
    projectPath?: string
  } | null>(null)

  const { confirmDiscard, unsavedChangesDialog } = useUnsavedChangesDialog()
  const workflowHasActiveRun = (workflowPath: string) => {
    return workflowHasActiveRunStatus(workflowExecutionStates[workflowPath]?.runStatus ?? "idle")
  }
  const clearDraftExecutionState = () => {
    clearWorkflowExecutionState(toWorkflowExecutionKey(null))
  }
  const {
    projectWorkflowsCache,
    setProjectWorkflowsCache,
    globalWorkflows,
    toggleProjectExpansion,
  } = useProjectSidebarData({
    selectedProject,
    setProjects,
    setSelectedProject,
    expandedProjects,
    setExpandedProjects,
    setWorkflows,
    setSkills,
    selectedWorkflowPath,
    setSelectedWorkflowPath,
    currentWorkflow,
    setCurrentWorkflow,
    setWorkflowSavedSnapshot,
  })

  const {
    pendingRenameWorkflow,
    setPendingRenameWorkflow,
    renameInput,
    setRenameInput,
    pendingDeleteWorkflow,
    setPendingDeleteWorkflow,
    pendingRemoveProject,
    setPendingRemoveProject,
    addProject,
    requestRemoveProject,
    commitRemoveProject,
    selectWorkflow,
    selectGlobalWorkflow,
    requestRenameWorkflow,
    commitRenameWorkflow,
    requestDeleteWorkflow,
    commitDeleteWorkflow,
    duplicateWorkflow,
  } = useWorkflowCrud({
    selectedProject,
    setProjects,
    setSelectedProject,
    setExpandedProjects,
    setWorkflows,
    setProjectWorkflowsCache,
    selectedWorkflowPath,
    setSelectedWorkflowPath,
    currentWorkflow,
    setCurrentWorkflow,
    setWorkflowSavedSnapshot,
    setMainView,
    workflowDirty,
    confirmDiscard,
    clearDraftExecutionState,
    workflowHasActiveRun,
    moveWorkflowExecutionState,
    clearWorkflowExecutionState,
    onProjectAdd,
    onWorkflowCreate,
  })
  const { openWorkflowCreate } = useWorkflowCreateNavigation()

  const { resizing, startResize, handleResizeKeyDown } = useSidebarResize(sidebarWidth, setSidebarWidth)

  useEffect(() => {
    return () => {
      if (scrollHideTimerRef.current !== null) {
        window.clearTimeout(scrollHideTimerRef.current)
      }
    }
  }, [])

  const removingSelectedDirtyProject =
    pendingRemoveProject !== null &&
    pendingRemoveProject === selectedProject &&
    workflowDirty

  const latestRunByPath = latestRunByWorkflowPath(pastRuns)
  const handleOpenWorkflowCreate = (projectPath?: string, locked = false) => {
    openWorkflowCreate({
      projectPath,
      locked,
    })
  }

  const handleSidebarScroll = () => {
    setSidebarScrolling(true)
    if (scrollHideTimerRef.current !== null) {
      window.clearTimeout(scrollHideTimerRef.current)
    }
    scrollHideTimerRef.current = window.setTimeout(() => {
      setSidebarScrolling(false)
      scrollHideTimerRef.current = null
    }, 180)
  }

  const getWorkflowRunMetrics = (workflowPath: string) => {
    const executionState = workflowExecutionStates[workflowPath]
    const runStatus = executionState?.runStatus ?? "idle"
    const activeRunStates = Object.values(executionState?.nodeStates ?? {})
    let completedSteps = 0
    let failedSteps = 0
    let waitingSteps = 0

    for (const state of activeRunStates) {
      const status = state.status || "pending"
      if (status === "completed" || status === "skipped") completedSteps += 1
      if (status === "failed") failedSteps += 1
      if (status === "waiting_approval") waitingSteps += 1
    }

    const totalSteps = activeRunStates.length
    const progress = totalSteps > 0
      ? Math.round((completedSteps / totalSteps) * 100)
      : 0
    const toneClass = runStatus === "paused" || runStatus === "cancelling" || waitingSteps > 0
      ? "status-warning"
      : failedSteps > 0
        ? "status-danger"
        : "status-info"

    return {
      runStatus,
      completedSteps,
      failedSteps,
      progress,
      totalSteps,
      waitingSteps,
      barClass: toneClass === "status-warning"
        ? "bg-status-warning"
        : toneClass === "status-danger"
          ? "bg-status-danger"
          : "bg-status-info",
      textClass: toneClass === "status-warning"
        ? "text-status-warning"
        : toneClass === "status-danger"
          ? "text-status-danger"
          : "text-status-info",
      showProgressTrack: workflowHasActiveRunStatus(runStatus) && totalSteps > 0,
    }
  }

  const handleSidebarKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    const target = event.target as HTMLElement | null
    if (!target) return

    const tagName = target.tagName
    const isEditable = Boolean(
      target.isContentEditable
      || tagName === "INPUT"
      || tagName === "TEXTAREA"
      || target.closest("[contenteditable=true]"),
    )
    if (isEditable) return

    // F2: rename focused workflow
    if (event.key === "F2") {
      const focusedEl = target.closest("[data-sidebar-item]") as HTMLElement | null
      if (focusedEl && focusedEl.dataset.workflowPath) {
        event.preventDefault()
        const wf = workflows.find((w) => w.path === focusedEl.dataset.workflowPath)
          || Object.values(projectWorkflowsCache).flat().find((w) => w.path === focusedEl.dataset.workflowPath)
        if (wf) {
          requestRenameWorkflow(wf)
        }
      }
      return
    }

    if (
      event.key !== "ArrowDown"
      && event.key !== "ArrowUp"
      && event.key !== "Home"
      && event.key !== "End"
    ) {
      return
    }

    const root = sidebarRef.current
    if (!root) return
    const items = Array.from(
      root.querySelectorAll<HTMLElement>('[data-sidebar-item="true"]:not([disabled])'),
    ).filter((item) => item.offsetParent !== null)
    if (items.length === 0) return

    const currentIndex = items.findIndex((item) => item === document.activeElement)
    let nextIndex = 0
    if (event.key === "Home") {
      nextIndex = 0
    } else if (event.key === "End") {
      nextIndex = items.length - 1
    } else if (event.key === "ArrowDown") {
      nextIndex = currentIndex < 0 ? 0 : Math.min(currentIndex + 1, items.length - 1)
    } else {
      nextIndex = currentIndex < 0 ? 0 : Math.max(currentIndex - 1, 0)
    }

    event.preventDefault()
    const nextItem = items[nextIndex]
    nextItem.focus()
    nextItem.scrollIntoView({ block: "nearest" })
  }

  return (
    <aside
      ref={sidebarRef}
      aria-label="Project sidebar"
      style={{ width: sidebarWidth }}
      onKeyDown={handleSidebarKeyDown}
      className={cn(
        "relative h-full shrink-0 min-h-0 border-r border-border bg-sidebar flex flex-col pt-[var(--titlebar-height)] ui-motion-standard transition-[opacity,transform] will-change-transform",
        collapsed && "-translate-x-2 opacity-0 pointer-events-none",
        resizing && "select-none",
      )}
    >
      {/* Top navigation */}
      <div className="space-y-px px-1.5 pt-2.5 pb-1">
        <SidebarNavItem
          icon={FilePlus2}
          label="New workflow"
          active={mainView === "workflow_create"}
          onClick={() => handleOpenWorkflowCreate()}
        />

        <SidebarNavItem
          icon={Sparkles}
          label="Plugins"
          active={mainView === "skills"}
          onClick={() => setMainView("skills")}
        />

        <SidebarNavItem
          icon={LayoutTemplate}
          label="Templates"
          active={mainView === "templates"}
          onClick={() => setMainView("templates")}
        />

        <SidebarNavItem
          icon={Inbox}
          label="Inbox"
          active={mainView === "inbox"}
          onClick={() => setMainView("inbox")}
          meta={unreadInboxCount > 0 ? (
            <span className="ui-meta-text inline-flex min-w-[1.25rem] items-center justify-center rounded-full border border-primary/20 bg-primary/10 px-1.5 py-0.5 font-medium text-primary">
              {unreadInboxCount > 99 ? "99+" : unreadInboxCount}
            </span>
          ) : null}
        />
      </div>

      {/* Section header */}
      <div className="px-2.5 pt-3 pb-1.5">
        <div className="flex items-center justify-between">
          <span className="section-kicker inline-flex items-center gap-1.5">
            Workflows
            <span className="text-sidebar-meta text-muted-foreground normal-case tracking-normal">
              {workflows.length}
            </span>
            {workflowDirty && selectedWorkflowPath && (
              <span className="inline-flex h-1.5 w-1.5 rounded-full bg-status-warning" aria-label="Workflow has unsaved changes" />
            )}
          </span>
          <div className="flex items-center gap-1">
            {showVisibilityToggle && onToggleVisibility && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    data-sidebar-item="true"
                    className="ui-icon-button hover:bg-sidebar-hover hover:text-foreground ui-transition-colors ui-motion-fast"
                    onClick={onToggleVisibility}
                    aria-label="Hide sidebar"
                  >
                    <PanelLeftClose size={12} />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Hide sidebar</TooltipContent>
              </Tooltip>
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  data-sidebar-item="true"
                  className="ui-icon-button hover:bg-sidebar-hover hover:text-foreground ui-transition-colors ui-motion-fast"
                  onClick={() => handleOpenWorkflowCreate()}
                  aria-label="New workflow"
                >
                  <Plus size={12} />
                </button>
              </TooltipTrigger>
              <TooltipContent>New workflow</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  data-sidebar-item="true"
                  className="ui-icon-button hover:bg-sidebar-hover hover:text-foreground ui-transition-colors ui-motion-fast"
                  onClick={() => void addProject()}
                  aria-label="Add project"
                >
                  <FolderOpen size={12} />
                </button>
              </TooltipTrigger>
              <TooltipContent>Add project</TooltipContent>
            </Tooltip>
          </div>
        </div>
        <div className="mt-1.5 h-px bg-hairline" />
      </div>

      {/* Workflow search */}
      {(workflows.length > 3 || Object.values(projectWorkflowsCache).some((wfs) => wfs.length > 3)) && (
        <div className="px-2.5 pb-1.5">
          <input
            type="search"
            placeholder="Search workflows..."
            aria-label="Search workflows"
            value={workflowSearchQuery}
            onChange={(e) => setWorkflowSearchQuery(e.target.value)}
            className="w-full h-control-sm rounded-md border border-hairline bg-surface-2/60 px-2 text-sidebar-item text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring/30"
          />
        </div>
      )}

      {/* Scrollable workflow list */}
      <div
        className="ui-scroll-region ui-scrollbar-transient flex-1 min-h-0 overflow-y-auto pb-1.5"
        data-scrolling={sidebarScrolling ? "true" : "false"}
        onScroll={handleSidebarScroll}
      >
        {projects.length === 0 && (
          <button
            type="button"
            data-sidebar-item="true"
            onClick={() => void addProject()}
            className="ui-pressable mx-1.5 mt-0.5 flex items-center gap-1.5 rounded-md px-2 py-1 text-sidebar-item text-muted-foreground hover:bg-sidebar-hover hover:text-foreground ui-transition-colors ui-motion-fast"
          >
            <FolderOpen size={15} className="flex-shrink-0 opacity-60" />
            <span>Open a project</span>
          </button>
        )}

        {projects.map((projectPath) => {
          const isSelectedProject = selectedProject === projectPath
          const isExpanded = expandedProjects.includes(projectPath)
          const projectWorkflows = isSelectedProject
            ? workflows
            : projectWorkflowsCache[projectPath] || []

          return (
            <div key={projectPath} className="sidebar-list-group mt-1 first:mt-0">
              <div className="group flex items-center gap-1">
                <button
                  type="button"
                  data-sidebar-item="true"
                  className={cn(
                    "sidebar-project-row ui-pressable text-left text-sidebar-label",
                    isSelectedProject ? "text-foreground" : "text-muted-foreground",
                  )}
                  onClick={() => toggleProjectExpansion(projectPath)}
                  title={projectPath}
                >
                  <ChevronRight
                    size={14}
                    className={cn(
                      "flex-shrink-0 text-muted-foreground transition-transform ui-motion-fast",
                      isExpanded && "rotate-90",
                    )}
                  />
                  <FolderOpen size={14} className="flex-shrink-0" />
                  <span className="truncate flex-1">{projectFolderName(projectPath)}</span>
                </button>
                <div className="ui-reveal-trailing flex items-center gap-0.5">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        className="ui-icon-button hover:bg-sidebar-hover hover:text-foreground"
                        onClick={(event) => {
                          event.stopPropagation()
                          handleOpenWorkflowCreate(projectPath, true)
                        }}
                        aria-label={`New workflow in ${projectFolderName(projectPath)}`}
                      >
                        <Plus size={14} />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>New workflow in {projectFolderName(projectPath)}</TooltipContent>
                  </Tooltip>

                  <DropdownMenu>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            className="ui-icon-button hover:bg-sidebar-hover hover:text-foreground"
                            onClick={(event) => event.stopPropagation()}
                            aria-label={`Project actions for ${projectFolderName(projectPath)}`}
                          >
                            <MoreHorizontal size={14} />
                          </button>
                        </DropdownMenuTrigger>
                      </TooltipTrigger>
                      <TooltipContent>Project actions</TooltipContent>
                    </Tooltip>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onSelect={() => handleOpenWorkflowCreate(projectPath, true)}
                      >
                        New workflow
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-status-danger focus:text-status-danger"
                        onSelect={() => requestRemoveProject(projectPath)}
                      >
                        Remove project
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>

              {isExpanded && (() => {
                const hasSearchQuery = workflowSearchQuery.trim().length > 0
                const filteredProjectWorkflows = projectWorkflows.filter((w) => {
                  if (!hasSearchQuery) return true
                  return w.name.toLowerCase().includes(workflowSearchQuery.trim().toLowerCase())
                })
                const isWorkflowListExpanded = expandedWorkflowLists[projectPath] ?? false
                const autoExpandWorkflowList = !hasSearchQuery
                  && filteredProjectWorkflows
                    .slice(PROJECT_WORKFLOW_PREVIEW_LIMIT)
                    .some((workflow) => workflow.path === selectedWorkflowPath)
                const visibleProjectWorkflows = hasSearchQuery || isWorkflowListExpanded || autoExpandWorkflowList
                  ? filteredProjectWorkflows
                  : filteredProjectWorkflows.slice(0, PROJECT_WORKFLOW_PREVIEW_LIMIT)
                const shouldShowWorkflowToggle = !hasSearchQuery
                  && filteredProjectWorkflows.length > PROJECT_WORKFLOW_PREVIEW_LIMIT

                return (
                  <div className="mt-0.5 ml-7 space-y-px">
                    <div role="listbox" aria-label={`${projectFolderName(projectPath)} workflows`}>
                      {visibleProjectWorkflows.map((workflow) => {
                        const runMetrics = getWorkflowRunMetrics(workflow.path)
                        const workflowRunStatus = runMetrics.runStatus
                        const isSelected = selectedWorkflowPath === workflow.path
                    const isRunOwner = workflowHasActiveRunStatus(workflowRunStatus)
                    const isDirty = isSelected && workflowDirty
                    const latestRun = latestRunByPath.get(workflow.path)
                    const latestRunMeta = historicalRunVisual(latestRun?.status)
                    const showSpinningIndicator = workflowRunStatus === "starting"
                      || workflowRunStatus === "running"
                      || workflowRunStatus === "cancelling"
                    const activeIndicatorClass = runMetrics.textClass === "text-status-warning"
                      ? "border-status-warning/30 bg-status-warning"
                      : runMetrics.textClass === "text-status-danger"
                        ? "border-status-danger/30 bg-status-danger"
                        : "border-status-info/30 bg-status-info"
                    const rowMeta = isRunOwner && runMetrics.totalSteps > 0
                      ? `${runMetrics.completedSteps}/${runMetrics.totalSteps}`
                      : (isRunOwner ? "now" : formatRelativeTime(workflow.updatedAt))
                    const rowMetaClass = isRunOwner && runMetrics.totalSteps > 0
                      ? runMetrics.textClass
                      : "text-muted-foreground"
                    const indicatorTitle = isRunOwner
                      ? (
                        runMetrics.totalSteps > 0
                          ? `${workflowRunStatus}: ${runMetrics.completedSteps}/${runMetrics.totalSteps}`
                          : workflowRunStatus
                      )
                      : (latestRun ? `Last run ${latestRunMeta.label}` : "No runs yet")

                      return (
                        <div
                          key={workflow.path}
                          role="option"
                          aria-selected={isSelected}
                          className={cn(
                            "sidebar-thread-row group",
                            isSelected && "sidebar-thread-row--active",
                          )}
                        >
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              aria-current={isSelected ? "page" : undefined}
                              data-sidebar-item="true"
                              data-workflow-path={workflow.path}
                              onClick={() => void selectWorkflow(workflow, projectPath)}
                              onDoubleClick={(event) => {
                                event.stopPropagation()
                                requestRenameWorkflow(workflow)
                              }}
                              onContextMenu={(event) => {
                                event.preventDefault()
                                event.stopPropagation()
                                setSidebarContextMenu({
                                  x: event.clientX,
                                  y: event.clientY,
                                  scope: "workflow",
                                  workflow,
                                  projectPath,
                                })
                              }}
                              className={cn(
                                "ui-pressable min-w-0 flex-1 flex items-center gap-1.5 rounded-md px-1 py-0.5 text-left ui-transition-colors ui-motion-fast focus-visible:outline-none",
                                isSelected
                                  ? "hover:bg-transparent"
                                  : "hover:bg-sidebar-hover/80",
                              )}
                            >
                              {showSpinningIndicator ? (
                                <span title={indicatorTitle} className="inline-flex flex-shrink-0">
                                  <Loader2
                                    size={12}
                                    className={cn("animate-spin flex-shrink-0", runMetrics.textClass)}
                                  />
                                </span>
                              ) : (
                                <span
                                  className={cn(
                                    "inline-flex h-2 w-2 rounded-full border flex-shrink-0",
                                    isRunOwner ? activeIndicatorClass : latestRunMeta.dotClass,
                                  )}
                                  title={indicatorTitle}
                                />
                              )}
                              <span className={cn(
                                "truncate flex-1 text-sidebar-item",
                                isSelected ? "text-foreground" : "text-foreground-subtle",
                              )}
                              >
                                {workflow.name}
                              </span>
                              {isDirty && (
                                <span className="inline-flex items-center rounded-sm border border-status-warning/40 bg-status-warning/10 px-1 py-0 text-sidebar-meta text-status-warning">
                                  unsaved
                                </span>
                              )}
                            </button>

                            <span
                              className={cn(
                                "text-sidebar-meta flex-shrink-0 tabular-nums ui-transition-colors ui-motion-fast",
                                rowMetaClass,
                              )}
                            >
                              {rowMeta}
                            </span>

                            <div
                              data-visible={isSelected ? "true" : undefined}
                              className="ui-reveal-trailing flex items-center gap-0.5"
                            >
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button
                                    type="button"
                                    className="ui-icon-button ui-transition-colors ui-motion-fast"
                                    onClick={(event) => {
                                      event.stopPropagation()
                                      requestRenameWorkflow(workflow)
                                    }}
                                    aria-label={`Rename ${workflow.name}`}
                                  >
                                    <Pencil size={12} />
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent>Rename</TooltipContent>
                              </Tooltip>

                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button
                                    type="button"
                                    className="ui-icon-button hover:bg-status-danger/20 hover:text-status-danger ui-transition-colors ui-motion-fast"
                                    onClick={(event) => {
                                      event.stopPropagation()
                                      requestDeleteWorkflow(workflow)
                                    }}
                                    aria-label={`Delete ${workflow.name}`}
                                  >
                                    <Trash2 size={12} />
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent>Delete</TooltipContent>
                              </Tooltip>
                            </div>
                          </div>

                          <div
                            data-visible={runMetrics.showProgressTrack ? "true" : "false"}
                            className="ui-inline-presence pointer-events-none absolute inset-x-1 bottom-1"
                          >
                            <div
                              className="sidebar-progress-track"
                              role="progressbar"
                              aria-valuenow={runMetrics.progress}
                              aria-valuemin={0}
                              aria-valuemax={100}
                              aria-label={`${workflow.name} execution progress`}
                            >
                              <div
                                className={cn("sidebar-progress-bar", runMetrics.barClass)}
                                style={{ width: `${runMetrics.showProgressTrack ? runMetrics.progress : 0}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      )
                    })}
                    </div>

                    {shouldShowWorkflowToggle && !autoExpandWorkflowList && (
                      <button
                        type="button"
                        data-sidebar-item="true"
                        onClick={() => {
                          setExpandedWorkflowLists((prev) => ({
                            ...prev,
                            [projectPath]: !isWorkflowListExpanded,
                          }))
                        }}
                        className="ui-pressable ml-1 inline-flex h-6 items-center rounded-md px-1.5 text-sidebar-meta text-muted-foreground hover:bg-sidebar-hover hover:text-foreground ui-transition-colors ui-motion-fast"
                      >
                        {isWorkflowListExpanded ? "Show less" : "Show more"}
                      </button>
                    )}
                  </div>
                )
              })()}
            </div>
          )
        })}

        {globalWorkflows.length > 0 && (
          <div className="mt-3 px-1.5">
            <div className="px-1.5 pb-1 section-kicker text-muted-foreground">Global workflows</div>
            <div className="space-y-0.5 sidebar-list-group">
              {globalWorkflows.map((workflow) => {
                const isSelected = selectedWorkflowPath === workflow.path
                return (
                  <button
                    key={workflow.path}
                    type="button"
                    data-sidebar-item="true"
                    onClick={() => void selectGlobalWorkflow(workflow)}
                    onContextMenu={(event) => {
                      event.preventDefault()
                      event.stopPropagation()
                      setSidebarContextMenu({
                        x: event.clientX,
                        y: event.clientY,
                        scope: "global_workflow",
                        workflow,
                      })
                    }}
                    className={cn(
                      "ui-pressable w-full sidebar-thread-row text-left text-sidebar-item ui-transition-colors ui-motion-fast",
                      isSelected
                        ? "sidebar-thread-row--active text-foreground"
                        : "text-foreground-subtle",
                    )}
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <Globe size={12} className="text-muted-foreground flex-shrink-0" />
                      <span className="truncate flex-1">{workflow.name}</span>
                      <span className="text-sidebar-meta text-muted-foreground tabular-nums">
                        {formatRelativeTime(workflow.updatedAt)}
                      </span>
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>

      <CursorMenu
        open={sidebarContextMenu !== null}
        x={sidebarContextMenu?.x || 0}
        y={sidebarContextMenu?.y || 0}
        onOpenChange={(open) => {
          if (!open) setSidebarContextMenu(null)
        }}
      >
        {sidebarContextMenu?.scope === "workflow" && (
          <>
            <DropdownMenuItem
              onSelect={() => {
                if (!sidebarContextMenu) return
                void selectWorkflow(sidebarContextMenu.workflow, sidebarContextMenu.projectPath)
                setSidebarContextMenu(null)
              }}
            >
              Open workflow
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => {
                if (!sidebarContextMenu) return
                requestRenameWorkflow(sidebarContextMenu.workflow)
                setSidebarContextMenu(null)
              }}
            >
              Rename workflow
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => {
                if (!sidebarContextMenu) return
                const wf = sidebarContextMenu.workflow
                const projectPath = sidebarContextMenu.projectPath
                setSidebarContextMenu(null)
                void duplicateWorkflow(wf, projectPath)
              }}
            >
              Duplicate workflow
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => {
                if (!sidebarContextMenu) return
                requestDeleteWorkflow(sidebarContextMenu.workflow)
                setSidebarContextMenu(null)
              }}
            >
              Delete workflow
            </DropdownMenuItem>
          </>
        )}
        {sidebarContextMenu?.scope === "global_workflow" && (
          <DropdownMenuItem
            onSelect={() => {
              if (!sidebarContextMenu) return
              void selectGlobalWorkflow(sidebarContextMenu.workflow)
              setSidebarContextMenu(null)
            }}
          >
            Open global workflow
          </DropdownMenuItem>
        )}
      </CursorMenu>

      {/* Settings */}
      <div className="px-1.5 pb-1.5">
        <SidebarNavItem
          icon={Settings}
          label="Global Settings"
          active={mainView === "settings"}
          onClick={() => setMainView("settings")}
        />
      </div>

      {/* Resize handle */}
      <div
        role="slider"
        aria-label="Sidebar width"
        aria-orientation="horizontal"
        aria-valuemin={SIDEBAR_MIN_WIDTH}
        aria-valuemax={SIDEBAR_MAX_WIDTH}
        aria-valuenow={sidebarWidth}
        tabIndex={0}
        onPointerDown={startResize}
        onKeyDown={handleResizeKeyDown}
        className={cn(
          "absolute right-0 top-0 h-full no-drag ui-resize-handle",
          resizing && "bg-primary/30",
        )}
        data-resizing={resizing}
      />

      {/* Rename dialog */}
      <Dialog
        open={pendingRenameWorkflow !== null}
        onOpenChange={(open) => {
          if (!open) setPendingRenameWorkflow(null)
        }}
      >
        <CanvasDialogContent showCloseButton={false}>
          <CanvasDialogHeader>
            <DialogTitle>Rename workflow</DialogTitle>
            <DialogDescription>Enter a new name for this workflow.</DialogDescription>
          </CanvasDialogHeader>
          <CanvasDialogBody>
            <Input
              value={renameInput}
              onChange={(event) => setRenameInput(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && void commitRenameWorkflow()}
              autoFocus
            />
          </CanvasDialogBody>
          <CanvasDialogFooter>
            <DialogClose asChild>
              <Button variant="ghost" size="sm">Cancel</Button>
            </DialogClose>
            <Button size="sm" onClick={() => void commitRenameWorkflow()}>Rename</Button>
          </CanvasDialogFooter>
        </CanvasDialogContent>
      </Dialog>

      {/* Delete dialog */}
      <SidebarConfirmDialog
        open={pendingDeleteWorkflow !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDeleteWorkflow(null)
        }}
        title="Delete workflow"
        description={`Delete "${pendingDeleteWorkflow?.name || "workflow"}"? The workflow file will be permanently removed.`}
        confirmLabel="Delete"
        onConfirm={() => void commitDeleteWorkflow()}
      />

      {/* Remove project dialog */}
      <SidebarConfirmDialog
        open={pendingRemoveProject !== null}
        onOpenChange={(open) => {
          if (!open) setPendingRemoveProject(null)
        }}
        title="Remove project"
        description={
          removingSelectedDirtyProject
            ? `Remove "${pendingRemoveProject ? projectFolderName(pendingRemoveProject) : "project"}" from Projects? This will discard unsaved workflow changes. Files on disk will not be deleted.`
            : `Remove "${pendingRemoveProject ? projectFolderName(pendingRemoveProject) : "project"}" from Projects? This will not delete files on disk.`
        }
        confirmLabel="Remove"
        onConfirm={() => void commitRemoveProject()}
      />
      {unsavedChangesDialog}
    </aside>
  )
}
