import { useRef, useState } from "react"
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
  createEmptyWorkflowExecutionState,
  moveWorkflowExecutionStateAtom,
  pastRunsAtom,
  workflowExecutionStatesAtom,
} from "@/features/execution"
import { cn } from "@/lib/cn"
import { SIDEBAR_MAX_WIDTH, SIDEBAR_MIN_WIDTH } from "@/lib/sidebar-layout"
import {
  FolderOpen,
  Globe,
  FilePlus2,
  Plus,
  X,
  Sparkles,
  LayoutTemplate,
  Inbox,
  Settings,
  Pencil,
  Trash2,
  Loader2,
  ChevronRight,
  ChevronDown,
} from "lucide-react"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { DropdownMenuItem } from "@/components/ui/dropdown-menu"
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
import { useExecutionReset } from "@/hooks/useExecutionReset"
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

interface ProjectSidebarProps {
  onProjectAdd?: (projectPath: string) => void
  onWorkflowCreate?: (workflowPath: string) => void
}

export function ProjectSidebar({
  onProjectAdd,
  onWorkflowCreate,
}: ProjectSidebarProps = {}) {
  const sidebarRef = useRef<HTMLElement | null>(null)
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
  const [sidebarContextMenu, setSidebarContextMenu] = useState<{
    x: number
    y: number
    scope: "workflow" | "global_workflow"
    workflow: WorkflowFile
    projectPath?: string
  } | null>(null)

  const resetExecutionState = useExecutionReset({ clearReportPath: true, clearSelectedPastRun: true })
  const { confirmDiscard, unsavedChangesDialog } = useUnsavedChangesDialog()
  const selectedExecutionState = selectedWorkflowPath
    ? (workflowExecutionStates[selectedWorkflowPath] ?? createEmptyWorkflowExecutionState())
    : createEmptyWorkflowExecutionState()
  const selectedRunStatus = selectedExecutionState.runStatus
  const workflowHasActiveRun = (workflowPath: string) => {
    return workflowHasActiveRunStatus(workflowExecutionStates[workflowPath]?.runStatus ?? "idle")
  }
  const resetExecutionIfSafe = () => {
    if (workflowHasActiveRunStatus(selectedRunStatus)) return
    resetExecutionState()
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
    creatingWorkflow,
    addProject,
    requestRemoveProject,
    commitRemoveProject,
    selectWorkflow,
    createNewWorkflow,
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
    resetExecutionIfSafe,
    workflowHasActiveRun,
    moveWorkflowExecutionState,
    clearWorkflowExecutionState,
    onProjectAdd,
    onWorkflowCreate,
  })

  const { resizing, startResize, handleResizeKeyDown } = useSidebarResize(sidebarWidth, setSidebarWidth)

  const removingSelectedDirtyProject =
    pendingRemoveProject !== null &&
    pendingRemoveProject === selectedProject &&
    workflowDirty

  const latestRunByPath = latestRunByWorkflowPath(pastRuns)

  const activeRunStates = Object.values(selectedExecutionState.nodeStates)
  let activeRunCompletedSteps = 0
  let activeRunRunningSteps = 0
  let activeRunFailedSteps = 0
  let activeRunWaitingSteps = 0
  for (const state of activeRunStates) {
    const status = state.status || "pending"
    if (status === "completed" || status === "skipped") activeRunCompletedSteps += 1
    if (status === "running") activeRunRunningSteps += 1
    if (status === "failed") activeRunFailedSteps += 1
    if (status === "waiting_approval") activeRunWaitingSteps += 1
  }
  const activeRunTotalSteps = activeRunStates.length
  const activeRunProgress = activeRunTotalSteps > 0
    ? Math.round((activeRunCompletedSteps / activeRunTotalSteps) * 100)
    : 0
  const activeRunPhase = activeRunWaitingSteps > 0
    ? "waiting approval"
    : activeRunFailedSteps > 0
      ? "errors"
      : activeRunRunningSteps > 0
        ? "running"
        : "queued"
  const activeRunLiveBarClass = activeRunFailedSteps > 0
      ? "bg-status-danger"
      : activeRunWaitingSteps > 0
        ? "bg-status-warning"
        : "bg-status-info"
  const showSelectedWorkflowProgress = (
    (selectedRunStatus === "running" || selectedRunStatus === "paused")
    && selectedWorkflowPath != null
    && activeRunTotalSteps > 0
  )
  const selectedWorkflowTitle = (
    workflows.find((workflow) => workflow.path === selectedWorkflowPath)?.name
    || selectedWorkflowPath?.split("/").pop()
    || "Running workflow"
  )

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
        "relative shrink-0 min-h-0 border-r border-border bg-sidebar flex flex-col pt-[var(--titlebar-height)]",
        resizing && "select-none",
      )}
    >
      {/* Top navigation */}
      <div className="space-y-px px-1.5 pt-2.5 pb-1">
        <SidebarNavItem
          icon={FilePlus2}
          label="New workflow"
          onClick={() => void createNewWorkflow()}
          disabled={creatingWorkflow}
        />

        <SidebarNavItem
          icon={Sparkles}
          label="Skills"
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
            <span className="inline-flex min-w-[1.25rem] items-center justify-center rounded-full border border-primary/20 bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary">
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
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  data-sidebar-item="true"
                  className="ui-icon-button hover:bg-sidebar-hover hover:text-foreground ui-transition-colors ui-motion-fast"
                  onClick={() => void createNewWorkflow()}
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
      <div className="ui-scroll-region flex-1 min-h-0 overflow-y-auto pb-1.5">
        {projects.length === 0 && (
          <button
            type="button"
            data-sidebar-item="true"
            onClick={() => void addProject()}
            className="mx-1.5 mt-0.5 flex items-center gap-1.5 rounded-md px-2 py-1 text-sidebar-item text-muted-foreground hover:bg-sidebar-hover hover:text-foreground ui-transition-colors ui-motion-fast"
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
          const ChevronIcon = isExpanded ? ChevronDown : ChevronRight

          return (
            <div key={projectPath} className="sidebar-list-group mt-1 first:mt-0">
              <div className="group flex items-center gap-1">
                <button
                  type="button"
                  data-sidebar-item="true"
                  className={cn(
                    "sidebar-project-row text-left text-sidebar-label",
                    isSelectedProject ? "text-foreground" : "text-muted-foreground",
                  )}
                  onClick={() => toggleProjectExpansion(projectPath)}
                  title={projectPath}
                >
                  <ChevronIcon size={14} className="flex-shrink-0 text-muted-foreground" />
                  <FolderOpen size={14} className="flex-shrink-0" />
                  <span className="truncate flex-1">{projectFolderName(projectPath)}</span>
                </button>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="ui-icon-button opacity-0 group-hover:opacity-100 hover:bg-status-danger/20 hover:text-status-danger ui-transition-opacity ui-motion-fast"
                      onClick={(event) => {
                        event.stopPropagation()
                        requestRemoveProject(projectPath)
                      }}
                      aria-label="Remove project"
                    >
                      <X size={14} />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Remove project</TooltipContent>
                </Tooltip>
              </div>

              {isExpanded && (
                <div className="mt-0.5 ml-7 space-y-px" role="listbox" aria-label={`${projectFolderName(projectPath)} workflows`}>
                  {projectWorkflows.filter((w) => {
                    if (!workflowSearchQuery.trim()) return true
                    return w.name.toLowerCase().includes(workflowSearchQuery.trim().toLowerCase())
                  }).map((workflow) => {
                    const workflowExecution = workflowExecutionStates[workflow.path]
                    const workflowRunStatus = workflowExecution?.runStatus ?? "idle"
                    const isSelected = selectedWorkflowPath === workflow.path
                    const isRunOwner = workflowRunStatus === "starting"
                      || workflowRunStatus === "running"
                      || workflowRunStatus === "paused"
                      || workflowRunStatus === "cancelling"
                    const isRunning = isRunOwner
                    const isDirty = isSelected && workflowDirty
                    const latestRun = latestRunByPath.get(workflow.path)
                    const latestRunMeta = historicalRunVisual(latestRun?.status)
                    const statusDotClass = latestRun?.status === "completed"
                      ? "border-status-success/50"
                      : latestRun?.status === "failed"
                        ? "border-status-danger/50"
                        : latestRun?.status === "interrupted"
                          ? "border-status-warning/50"
                          : latestRun?.status === "cancelled"
                            ? "border-muted-foreground/40"
                            : "border-muted-foreground/30"
                    const showLiveProgress = isSelected && showSelectedWorkflowProgress
                    const runningHint = workflowRunStatus === "paused"
                      ? (isSelected ? "Paused" : "Paused in background")
                      : workflowRunStatus === "cancelling"
                        ? (isSelected ? "Stopping..." : "Stopping in background")
                        : workflowRunStatus === "starting"
                          ? (isSelected ? "Connecting..." : "Starting in background")
                          : isSelected
                            ? `Running · ${activeRunPhase}`
                            : "Running in background"

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
                              "min-w-0 flex-1 flex items-center gap-1.5 rounded-md px-1 py-0.5 text-left ui-transition-colors ui-motion-fast focus-visible:outline-none",
                              isSelected
                                ? "hover:bg-transparent"
                                : "hover:bg-sidebar-hover/80",
                            )}
                          >
                            {isRunning ? (
                              <Loader2 size={12} className="text-status-info animate-spin flex-shrink-0" />
                            ) : (
                              <span className={cn("inline-flex h-2 w-2 rounded-full border bg-transparent flex-shrink-0", statusDotClass)} />
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

                          <div
                            className={cn(
                              "flex items-center gap-0.5 ui-transition-opacity ui-motion-fast",
                              isSelected
                                ? "opacity-100"
                                : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100",
                            )}
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

                          <span
                            className={cn(
                              "text-muted-foreground text-sidebar-meta flex-shrink-0 tabular-nums ui-transition-opacity ui-motion-fast",
                              isSelected ? "hidden" : "group-hover:hidden",
                            )}
                          >
                            {isRunning ? "now" : formatRelativeTime(workflow.updatedAt)}
                          </span>
                        </div>

                        {showLiveProgress && (
                          <div className="px-1 pb-0.5">
                            <div
                              className="sidebar-progress-track"
                              role="progressbar"
                              aria-valuenow={activeRunProgress}
                              aria-valuemin={0}
                              aria-valuemax={100}
                              aria-label="Workflow execution progress"
                            >
                              <div
                                className={cn("sidebar-progress-bar", activeRunLiveBarClass)}
                                style={{ width: `${activeRunProgress}%` }}
                              />
                            </div>
                            <div className="mt-0.5 flex items-center justify-between text-sidebar-meta text-muted-foreground">
                              <span className="truncate pr-2">{selectedWorkflowTitle}</span>
                              <span className="tabular-nums">
                                {activeRunCompletedSteps}/{activeRunTotalSteps}
                              </span>
                            </div>
                          </div>
                        )}

                        {!showLiveProgress && isRunOwner && (
                          <div className="px-1 pb-0.5 text-sidebar-meta text-status-info">
                            {runningHint}
                          </div>
                        )}

                        {!showLiveProgress && !isRunOwner && isSelected && latestRun && (
                          <div className="px-1 pb-0.5 text-sidebar-meta text-muted-foreground">
                            Last run: <span className={latestRunMeta.textClass}>{latestRunMeta.label}</span>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
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
                      "w-full sidebar-thread-row text-left text-sidebar-item ui-transition-colors ui-motion-fast",
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
