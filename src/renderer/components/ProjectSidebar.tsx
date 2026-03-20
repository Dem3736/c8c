import { useEffect, useRef, useState } from "react"
import { useAtom, useSetAtom } from "jotai"
import { toast } from "sonner"
import { moveProjectBeforeOrAfterTarget, type ProjectDropPosition } from "@shared/project-order"
import {
  projectsAtom,
  selectedProjectAtom,
  expandedProjectsAtom,
  workflowsAtom,
  selectedWorkflowPathAtom,
  projectSidebarWidthAtom,
  currentWorkflowAtom,
  skillsAtom,
  factoryBetaEnabledAtom,
  mainViewAtom,
  clearWorkflowTemplateContextForKeyAtom,
  moveWorkflowTemplateContextAtom,
  templateLibraryContextAtom,
  workflowDirtyAtom,
  workflowCreateContextAtom,
  workflowSavedSnapshotAtom,
  unreadInboxCountAtom,
  type WorkflowFile,
} from "@/lib/store"
import {
  clearWorkflowExecutionStateAtom,
  moveWorkflowExecutionStateAtom,
  toWorkflowExecutionKey,
  workflowExecutionStatesAtom,
} from "@/features/execution"
import { cn } from "@/lib/cn"
import { isEditableKeyboardTarget } from "@/lib/keyboard-shortcuts"
import { SIDEBAR_MAX_WIDTH, SIDEBAR_MIN_WIDTH } from "@/lib/sidebar-layout"
import { MOTION_BASE_MS } from "@/lib/tokens"
import {
  FolderOpen,
  Settings,
  MoreHorizontal,
  ChevronRight,
  Plus,
} from "lucide-react"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useUnsavedChangesDialog } from "@/hooks/useUnsavedChangesDialog"
import {
  formatRelativeTime,
  buildSidebarWorkflowSummary,
  projectFolderName,
  resolveProjectRowSelectionState,
  workflowHasActiveRunStatus,
} from "@/components/sidebar/projectSidebarUtils"
import { useProjectSidebarData } from "@/components/sidebar/useProjectSidebarData"
import { useSidebarResize } from "@/components/sidebar/useSidebarResize"
import { useWorkflowCrud } from "@/components/sidebar/useWorkflowCrud"
import { useProjectSidebarMetrics } from "@/components/sidebar/useProjectSidebarMetrics"
import {
  SidebarWorkflowDialogs,
  type SidebarContextMenuState,
} from "@/components/sidebar/SidebarWorkflowDialogs"
import { SidebarGlobalWorkflowRow } from "@/components/sidebar/SidebarGlobalWorkflowRow"
import { SidebarProjectWorkflowList } from "@/components/sidebar/SidebarProjectWorkflowList"
import { ProjectSidebarChrome } from "@/components/sidebar/ProjectSidebarChrome"
import { SidebarNavItem } from "@/components/sidebar/SidebarNavItem"
import { useWorkflowCreateNavigation } from "@/hooks/useWorkflowCreateNavigation"

interface ProjectSidebarProps {
  collapsed?: boolean
  onProjectAdd?: (projectPath: string) => void
  onWorkflowCreate?: (workflowPath: string) => void
  onToggleVisibility?: () => void
  showVisibilityToggle?: boolean
}

export function ProjectSidebar({
  collapsed = false,
  onProjectAdd,
  onWorkflowCreate,
  onToggleVisibility,
  showVisibilityToggle = false,
}: ProjectSidebarProps = {}) {
  const sidebarRef = useRef<HTMLElement | null>(null)
  const scrollHideTimerRef = useRef<number | null>(null)
  const projectReorderRequestIdRef = useRef(0)
  const [projects, setProjects] = useAtom(projectsAtom)
  const [selectedProject, setSelectedProject] = useAtom(selectedProjectAtom)
  const [expandedProjects, setExpandedProjects] = useAtom(expandedProjectsAtom)
  const [workflows, setWorkflows] = useAtom(workflowsAtom)
  const [selectedWorkflowPath, setSelectedWorkflowPath] = useAtom(selectedWorkflowPathAtom)
  const [workflowDirty] = useAtom(workflowDirtyAtom)
  const [sidebarWidth, setSidebarWidth] = useAtom(projectSidebarWidthAtom)
  const [currentWorkflow, setCurrentWorkflow] = useAtom(currentWorkflowAtom)
  const [workflowExecutionStates] = useAtom(workflowExecutionStatesAtom)
  const [, setWorkflowSavedSnapshot] = useAtom(workflowSavedSnapshotAtom)
  const [, setSkills] = useAtom(skillsAtom)
  const [mainView, setMainView] = useAtom(mainViewAtom)
  const [workflowCreateContext] = useAtom(workflowCreateContextAtom)
  const [factoryBetaEnabled] = useAtom(factoryBetaEnabledAtom)
  const [unreadInboxCount] = useAtom(unreadInboxCountAtom)
  const setTemplateLibraryContext = useSetAtom(templateLibraryContextAtom)
  const moveWorkflowExecutionState = useSetAtom(moveWorkflowExecutionStateAtom)
  const clearWorkflowExecutionState = useSetAtom(clearWorkflowExecutionStateAtom)
  const moveWorkflowTemplateContext = useSetAtom(moveWorkflowTemplateContextAtom)
  const clearWorkflowTemplateContext = useSetAtom(clearWorkflowTemplateContextForKeyAtom)
  const [workflowSearchQuery, setWorkflowSearchQuery] = useState("")
  const [expandedWorkflowLists, setExpandedWorkflowLists] = useState<Record<string, boolean>>({})
  const [sidebarScrolling, setSidebarScrolling] = useState(false)
  const [draggedProjectPath, setDraggedProjectPath] = useState<string | null>(null)
  const [projectDropIndicator, setProjectDropIndicator] = useState<{
    projectPath: string
    position: ProjectDropPosition
  } | null>(null)
  const [sidebarContextMenu, setSidebarContextMenu] = useState<SidebarContextMenuState | null>(null)

  const { confirmDiscard, unsavedChangesDialog } = useUnsavedChangesDialog()
  const workflowHasActiveRun = (workflowPath: string) => {
    return workflowHasActiveRunStatus(workflowExecutionStates[workflowPath]?.runStatus ?? "idle")
  }
  const clearDraftExecutionState = () => {
    clearWorkflowExecutionState(toWorkflowExecutionKey(null))
    clearWorkflowTemplateContext(toWorkflowExecutionKey(null))
  }
  const {
    projectWorkflowsCache,
    projectLatestRunsCache,
    projectWorkflowsLoading,
    setProjectWorkflowsCache,
    globalWorkflows,
    toggleProjectExpansion,
  } = useProjectSidebarData({
    projects,
    selectedProject,
    setProjects,
    setSelectedProject,
    expandedProjects,
    setExpandedProjects,
    workflows,
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
    moveWorkflowTemplateContext,
    clearWorkflowTemplateContext,
    onProjectAdd,
    onWorkflowCreate,
  })
  const { openWorkflowCreate } = useWorkflowCreateNavigation()
  const {
    getWorkflowRunMetrics,
    getProjectStatusRollup,
    sortProjectWorkflows,
    getHistoricalRunVisual,
  } = useProjectSidebarMetrics({
    projectLatestRunsCache,
    workflowExecutionStates,
    selectedWorkflowPath,
  })

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
    }, MOTION_BASE_MS)
  }

  const clearProjectDragState = () => {
    setDraggedProjectPath(null)
    setProjectDropIndicator(null)
  }

  const resolveProjectDropPosition = (
    event: React.DragEvent<HTMLElement>,
  ): ProjectDropPosition => {
    const bounds = event.currentTarget.getBoundingClientRect()
    return event.clientY >= bounds.top + bounds.height / 2 ? "after" : "before"
  }

  const handleProjectDragStart = (
    projectPath: string,
    event: React.DragEvent<HTMLButtonElement>,
  ) => {
    if (projects.length < 2) {
      event.preventDefault()
      return
    }

    setDraggedProjectPath(projectPath)
    event.dataTransfer.effectAllowed = "move"
    event.dataTransfer.setData("text/plain", projectPath)
  }

  const handleProjectDragOver = (
    projectPath: string,
    event: React.DragEvent<HTMLDivElement>,
  ) => {
    if (!draggedProjectPath || draggedProjectPath === projectPath) {
      if (projectDropIndicator) {
        setProjectDropIndicator(null)
      }
      return
    }

    event.preventDefault()
    event.dataTransfer.dropEffect = "move"
    const position = resolveProjectDropPosition(event)
    setProjectDropIndicator((current) => {
      if (current?.projectPath === projectPath && current.position === position) {
        return current
      }
      return { projectPath, position }
    })
  }

  const handleProjectDragLeave = (
    projectPath: string,
    event: React.DragEvent<HTMLDivElement>,
  ) => {
    if (projectDropIndicator?.projectPath !== projectPath) return
    const nextTarget = event.relatedTarget as Node | null
    if (nextTarget && event.currentTarget.contains(nextTarget)) return
    setProjectDropIndicator(null)
  }

  const handleProjectDrop = (
    targetProjectPath: string,
    event: React.DragEvent<HTMLDivElement>,
  ) => {
    event.preventDefault()

    if (!draggedProjectPath || draggedProjectPath === targetProjectPath) {
      clearProjectDragState()
      return
    }

    const position = resolveProjectDropPosition(event)
    const previousProjects = projects
    const nextProjects = moveProjectBeforeOrAfterTarget(
      projects,
      draggedProjectPath,
      targetProjectPath,
      position,
    )

    clearProjectDragState()
    if (nextProjects.every((projectPath, index) => projectPath === previousProjects[index])) {
      return
    }

    const requestId = projectReorderRequestIdRef.current + 1
    projectReorderRequestIdRef.current = requestId
    setProjects(nextProjects)

    void window.api.reorderProjects(nextProjects).then((persistedProjects) => {
      if (projectReorderRequestIdRef.current !== requestId) return
      setProjects(persistedProjects)
    }).catch(async (error) => {
      if (projectReorderRequestIdRef.current !== requestId) return
      try {
        const persistedProjects = await window.api.listProjects()
        if (projectReorderRequestIdRef.current !== requestId) return
        setProjects(persistedProjects)
      } catch {
        setProjects(previousProjects)
      }
      toast.error("Could not reorder projects", {
        description: String(error),
      })
    })
  }

  const handleSidebarKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    const target = event.target as HTMLElement | null
    if (!target) return

    if (isEditableKeyboardTarget(target)) return

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
      <ProjectSidebarChrome
        mainView={mainView}
        unreadInboxCount={unreadInboxCount}
        factoryBetaEnabled={factoryBetaEnabled}
        workflowDirty={workflowDirty}
        selectedWorkflowPath={selectedWorkflowPath}
        workflowSearchQuery={workflowSearchQuery}
        showSearch={workflows.length > 3 || Object.values(projectWorkflowsCache).some((wfs) => wfs.length > 3)}
        onSearchChange={setWorkflowSearchQuery}
        onOpenCreate={() => handleOpenWorkflowCreate()}
        onOpenStartingPoints={() => {
          if (mainView === "workflow_create") {
            setTemplateLibraryContext({
              projectPath: workflowCreateContext.projectPath,
              createOnly: Boolean(workflowCreateContext.projectPath),
            })
          } else {
            setTemplateLibraryContext(null)
          }
          setMainView("templates")
        }}
        onOpenSkills={() => setMainView("skills")}
        onOpenInbox={() => setMainView("inbox")}
        onOpenFactory={() => setMainView("factory")}
        onOpenSettings={() => setMainView("settings")}
        onAddProject={() => { void addProject() }}
        onToggleVisibility={onToggleVisibility}
        showVisibilityToggle={showVisibilityToggle}
      />

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
          const isDraggingProject = draggedProjectPath === projectPath
          const projectDropPosition = projectDropIndicator?.projectPath === projectPath
            ? projectDropIndicator.position
            : null
          const projectWorkflows = projectWorkflowsCache[projectPath] || []
          const isProjectLoading = projectWorkflowsLoading[projectPath] === true
          const projectRowSelection = resolveProjectRowSelectionState(projectPath, selectedProject, isExpanded)
          const projectRollup = getProjectStatusRollup(projectPath, projectWorkflows)

          return (
            <div
              key={projectPath}
              className={cn(
                "sidebar-list-group mt-1 first:mt-0",
                projectDropPosition === "before" && "sidebar-list-group--project-drop-before",
                projectDropPosition === "after" && "sidebar-list-group--project-drop-after",
              )}
            >
              <div
                className="group flex items-center gap-1"
                onDragOver={(event) => handleProjectDragOver(projectPath, event)}
                onDragLeave={(event) => handleProjectDragLeave(projectPath, event)}
                onDrop={(event) => handleProjectDrop(projectPath, event)}
              >
                <button
                  type="button"
                  data-sidebar-item="true"
                  draggable={projects.length > 1}
                  aria-grabbed={projects.length > 1 ? isDraggingProject : undefined}
                  className={cn(
                    "sidebar-project-row ui-pressable text-left text-sidebar-label",
                    projects.length > 1 && "cursor-grab active:cursor-grabbing",
                    isSelectedProject ? "text-foreground" : "text-muted-foreground",
                    isDraggingProject && "sidebar-project-row--dragging",
                    projectDropPosition && "sidebar-project-row--drop-target",
                  )}
                  onDragStart={(event) => handleProjectDragStart(projectPath, event)}
                  onDragEnd={clearProjectDragState}
                  onClick={() => {
                    if (projectRowSelection.shouldSelectProject) {
                      setSelectedProject(projectPath)
                    }
                    if (projectRowSelection.nextExpanded !== isExpanded) {
                      toggleProjectExpansion(projectPath)
                    }
                  }}
                  title={projectPath}
                >
                  <ChevronRight
                    size={14}
                    className={cn(
                      "ui-chevron flex-shrink-0 text-muted-foreground",
                      isExpanded && "rotate-90",
                    )}
                  />
                  <FolderOpen size={14} className="flex-shrink-0" />
                  <span className="truncate flex-1">{projectFolderName(projectPath)}</span>
                  {(projectRollup.activeCount > 0 || projectRollup.waitingCount > 0 || projectRollup.attentionCount > 0) && (
                    <span className="ml-1 flex items-center gap-1.5">
                      {projectRollup.activeCount > 0 && (
                        <span
                          title={`${projectRollup.activeCount} active flow${projectRollup.activeCount === 1 ? "" : "s"}`}
                          className="inline-flex items-center gap-1 rounded-full bg-status-info/10 px-1.5 py-0.5 text-sidebar-meta text-status-info"
                        >
                          <span className="h-1.5 w-1.5 rounded-full bg-status-info" />
                          {projectRollup.activeCount}
                        </span>
                      )}
                      {projectRollup.waitingCount > 0 && (
                        <span
                          title={`${projectRollup.waitingCount} waiting flow${projectRollup.waitingCount === 1 ? "" : "s"}`}
                          className="inline-flex items-center gap-1 rounded-full bg-status-warning/10 px-1.5 py-0.5 text-sidebar-meta text-status-warning"
                        >
                          <span className="h-1.5 w-1.5 rounded-full bg-status-warning" />
                          {projectRollup.waitingCount}
                        </span>
                      )}
                      {projectRollup.attentionCount > 0 && (
                        <span
                          title={`${projectRollup.attentionCount} flow${projectRollup.attentionCount === 1 ? "" : "s"} need attention`}
                          className="inline-flex items-center gap-1 rounded-full bg-status-danger/10 px-1.5 py-0.5 text-sidebar-meta text-status-danger"
                        >
                          <span className="h-1.5 w-1.5 rounded-full bg-status-danger" />
                          {projectRollup.attentionCount}
                        </span>
                      )}
                    </span>
                  )}
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
                        aria-label={`New flow in ${projectFolderName(projectPath)}`}
                      >
                        <Plus size={14} />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>New flow in {projectFolderName(projectPath)}</TooltipContent>
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
                        New flow
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
                const isWorkflowListExpanded = expandedWorkflowLists[projectPath] ?? false

                return (
                  <SidebarProjectWorkflowList
                    projectPath={projectPath}
                    projectLabel={projectFolderName(projectPath)}
                    projectWorkflows={projectWorkflows}
                    isProjectLoading={isProjectLoading}
                    workflowSearchQuery={workflowSearchQuery}
                    isWorkflowListExpanded={isWorkflowListExpanded}
                    selectedWorkflowPath={selectedWorkflowPath}
                    workflowDirty={workflowDirty}
                    workflowExecutionStates={workflowExecutionStates}
                    getWorkflowRunMetrics={getWorkflowRunMetrics}
                    getHistoricalRunVisual={getHistoricalRunVisual}
                    sortProjectWorkflows={sortProjectWorkflows}
                    onToggleExpanded={() => {
                      setExpandedWorkflowLists((prev) => ({
                        ...prev,
                        [projectPath]: !isWorkflowListExpanded,
                      }))
                    }}
                    onOpenWorkflow={(workflow) => void selectWorkflow(workflow, projectPath)}
                    onRenameWorkflow={requestRenameWorkflow}
                    onDeleteWorkflow={requestDeleteWorkflow}
                    onWorkflowContextMenu={setSidebarContextMenu}
                  />
                )
              })()}
            </div>
          )
        })}

        {globalWorkflows.length > 0 && (
          <div className="mt-3 px-1.5">
            <div className="px-1.5 pb-1 section-kicker text-muted-foreground">Global flows</div>
            <div className="space-y-0.5 sidebar-list-group">
              {globalWorkflows.map((workflow) => {
                const isSelected = selectedWorkflowPath === workflow.path
                const workflowSummary = buildSidebarWorkflowSummary({
                  executionState: workflowExecutionStates[workflow.path],
                })
                return (
                  <SidebarGlobalWorkflowRow
                    key={workflow.path}
                    workflow={workflow}
                    isSelected={isSelected}
                    detailLabel={workflowSummary.detailLabel}
                    updatedAtLabel={formatRelativeTime(workflow.updatedAt)}
                    onOpen={() => void selectGlobalWorkflow(workflow)}
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
                  />
                )
              })}
            </div>
          </div>
        )}
      </div>

      <SidebarWorkflowDialogs
        sidebarContextMenu={sidebarContextMenu}
        setSidebarContextMenu={setSidebarContextMenu}
        selectWorkflow={selectWorkflow}
        selectGlobalWorkflow={selectGlobalWorkflow}
        requestRenameWorkflow={requestRenameWorkflow}
        duplicateWorkflow={duplicateWorkflow}
        requestDeleteWorkflow={requestDeleteWorkflow}
        pendingRenameWorkflow={pendingRenameWorkflow}
        setPendingRenameWorkflow={setPendingRenameWorkflow}
        renameInput={renameInput}
        setRenameInput={setRenameInput}
        commitRenameWorkflow={commitRenameWorkflow}
        pendingDeleteWorkflow={pendingDeleteWorkflow}
        setPendingDeleteWorkflow={setPendingDeleteWorkflow}
        selectedWorkflowPath={selectedWorkflowPath}
        workflowDirty={workflowDirty}
        commitDeleteWorkflow={commitDeleteWorkflow}
        pendingRemoveProject={pendingRemoveProject}
        setPendingRemoveProject={setPendingRemoveProject}
        removingSelectedDirtyProject={removingSelectedDirtyProject}
        commitRemoveProject={commitRemoveProject}
      />

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
        )}
        data-resizing={resizing}
      />

      {unsavedChangesDialog}
    </aside>
  )
}
