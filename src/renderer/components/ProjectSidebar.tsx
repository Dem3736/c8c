import { useEffect, useRef, useState } from "react"
import { useAtom, useSetAtom } from "jotai"
import {
  clearWorkflowExecutionStateAtom,
  createEmptyWorkflowExecutionState,
  moveWorkflowExecutionStateAtom,
  projectsAtom,
  selectedProjectAtom,
  expandedProjectsAtom,
  workflowsAtom,
  selectedWorkflowPathAtom,
  projectSidebarWidthAtom,
  currentWorkflowAtom,
  skillsAtom,
  mainViewAtom,
  pastRunsAtom,
  toWorkflowExecutionKey,
  workflowExecutionStatesAtom,
  workflowDirtyAtom,
  workflowSavedSnapshotAtom,
  type WorkflowFile,
} from "@/lib/store"
import { cn } from "@/lib/cn"
import {
  FolderOpen,
  Globe,
  FilePlus2,
  Plus,
  X,
  Sparkles,
  LayoutTemplate,
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
import { toast } from "sonner"
import { createEmptyWorkflow } from "@/lib/default-workflow"
import { useExecutionReset } from "@/hooks/useExecutionReset"
import { workflowSnapshot } from "@/lib/workflow-snapshot"
import { workflowHasMeaningfulContent } from "@/lib/workflow-content"
import { useUnsavedChangesDialog } from "@/hooks/useUnsavedChangesDialog"
import { SidebarNavItem } from "@/components/sidebar/SidebarNavItem"
import { SidebarConfirmDialog } from "@/components/sidebar/SidebarConfirmDialog"
import { CursorMenu } from "@/components/ui/cursor-menu"

interface ProjectSidebarProps {
  onProjectAdd?: (projectPath: string) => void
  onWorkflowCreate?: (workflowPath: string) => void
}

function historicalRunVisual(status?: string): {
  label: string
  progress: number
  barClass: string
  textClass: string
} {
  switch (status) {
    case "completed":
      return {
        label: "completed",
        progress: 100,
        barClass: "bg-status-success",
        textClass: "text-status-success",
      }
    case "failed":
      return {
        label: "failed",
        progress: 78,
        barClass: "bg-status-danger",
        textClass: "text-status-danger",
      }
    case "interrupted":
      return {
        label: "interrupted",
        progress: 56,
        barClass: "bg-status-warning",
        textClass: "text-status-warning",
      }
    case "cancelled":
      return {
        label: "cancelled",
        progress: 40,
        barClass: "bg-muted-foreground/60",
        textClass: "text-muted-foreground",
      }
    default:
      return {
        label: "no runs yet",
        progress: 0,
        barClass: "bg-muted-foreground/50",
        textClass: "text-muted-foreground",
      }
  }
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
  const [projectWorkflowsCache, setProjectWorkflowsCache] = useState<Record<string, WorkflowFile[]>>({})
  const [selectedWorkflowPath, setSelectedWorkflowPath] = useAtom(selectedWorkflowPathAtom)
  const [workflowDirty] = useAtom(workflowDirtyAtom)
  const [sidebarWidth, setSidebarWidth] = useAtom(projectSidebarWidthAtom)
  const [currentWorkflow, setCurrentWorkflow] = useAtom(currentWorkflowAtom)
  const [pastRuns] = useAtom(pastRunsAtom)
  const [workflowExecutionStates] = useAtom(workflowExecutionStatesAtom)
  const [, setWorkflowSavedSnapshot] = useAtom(workflowSavedSnapshotAtom)
  const [, setSkills] = useAtom(skillsAtom)
  const [mainView, setMainView] = useAtom(mainViewAtom)
  const moveWorkflowExecutionState = useSetAtom(moveWorkflowExecutionStateAtom)
  const clearWorkflowExecutionState = useSetAtom(clearWorkflowExecutionStateAtom)
  const [pendingRenameWorkflow, setPendingRenameWorkflow] = useState<WorkflowFile | null>(null)
  const [renameInput, setRenameInput] = useState("")
  const [pendingDeleteWorkflow, setPendingDeleteWorkflow] = useState<WorkflowFile | null>(null)
  const [pendingRemoveProject, setPendingRemoveProject] = useState<string | null>(null)
  const [creatingWorkflow, setCreatingWorkflow] = useState(false)
  const [workflowSearchQuery, setWorkflowSearchQuery] = useState("")
  const [sidebarContextMenu, setSidebarContextMenu] = useState<{
    x: number
    y: number
    scope: "workflow" | "global_workflow"
    workflow: WorkflowFile
    projectPath?: string
  } | null>(null)
  const [globalWorkflows, setGlobalWorkflows] = useState<WorkflowFile[]>([])
  const restoredWorkflowPathRef = useRef<string | null>(null)

  const [resizing, setResizing] = useState(false)

  const resetExecutionState = useExecutionReset({ clearReportPath: true, clearSelectedPastRun: true })
  const { confirmDiscard, unsavedChangesDialog } = useUnsavedChangesDialog()
  const selectedExecutionState = selectedWorkflowPath
    ? (workflowExecutionStates[selectedWorkflowPath] ?? createEmptyWorkflowExecutionState())
    : createEmptyWorkflowExecutionState()
  const selectedRunStatus = selectedExecutionState.runStatus
  const workflowHasActiveRun = (workflowPath: string) => {
    const status = workflowExecutionStates[workflowPath]?.runStatus ?? "idle"
    return status === "starting" || status === "running" || status === "paused" || status === "cancelling"
  }
  const resetExecutionIfSafe = () => {
    if (selectedRunStatus === "starting" || selectedRunStatus === "running" || selectedRunStatus === "paused" || selectedRunStatus === "cancelling") return
    resetExecutionState()
  }

  useEffect(() => {
    window.api.listProjects().then(setProjects)
    window.api.getSelectedProject().then((projectPath) => {
      if (!projectPath) return
      setSelectedProject(projectPath)
    })
  }, [setProjects, setSelectedProject])

  useEffect(() => {
    if (selectedProject) {
      window.api.listProjectWorkflows(selectedProject).then(setWorkflows)
      window.api.scanSkills(selectedProject).then(setSkills)
      window.api.setSelectedProject(selectedProject)
      return
    }

    setWorkflows([])
    setSkills([])
  }, [selectedProject, setSkills, setWorkflows])

  useEffect(() => {
    window.api.listGlobalWorkflows().then(setGlobalWorkflows).catch(() => setGlobalWorkflows([]))
  }, [])

  useEffect(() => {
    if (!selectedWorkflowPath) {
      restoredWorkflowPathRef.current = null
      return
    }
    if (workflowHasMeaningfulContent(currentWorkflow)) {
      return
    }
    if (restoredWorkflowPathRef.current === selectedWorkflowPath) {
      return
    }

    let cancelled = false
    restoredWorkflowPathRef.current = selectedWorkflowPath

    void window.api.loadWorkflow(selectedWorkflowPath).then((loadedWorkflow) => {
      if (cancelled) return
      setCurrentWorkflow(loadedWorkflow)
      setWorkflowSavedSnapshot(workflowSnapshot(loadedWorkflow))
    }).catch((error) => {
      if (cancelled) return
      setSelectedWorkflowPath(null)
      const emptyWorkflow = createEmptyWorkflow()
      setCurrentWorkflow(emptyWorkflow)
      setWorkflowSavedSnapshot(workflowSnapshot(emptyWorkflow))
      toast.error("Could not restore the previously opened workflow", {
        description: String(error),
      })
    })

    return () => {
      cancelled = true
    }
  }, [
    currentWorkflow,
    selectedWorkflowPath,
    setCurrentWorkflow,
    setSelectedWorkflowPath,
    setWorkflowSavedSnapshot,
  ])

  // Auto-expand the selected project
  useEffect(() => {
    if (selectedProject && !expandedProjects.includes(selectedProject)) {
      setExpandedProjects((prev) => [...prev, selectedProject])
    }
  }, [selectedProject]) // eslint-disable-line react-hooks/exhaustive-deps

  // Load workflows for expanded non-selected projects
  useEffect(() => {
    for (const path of expandedProjects) {
      if (path === selectedProject) continue
      if (projectWorkflowsCache[path]) continue
      window.api.listProjectWorkflows(path).then((wfs) => {
        setProjectWorkflowsCache((prev) => ({ ...prev, [path]: wfs }))
      })
    }
  }, [expandedProjects, selectedProject]) // eslint-disable-line react-hooks/exhaustive-deps

  const toggleProjectExpansion = (projectPath: string) => {
    setExpandedProjects((prev) =>
      prev.includes(projectPath)
        ? prev.filter((p) => p !== projectPath)
        : [...prev, projectPath],
    )
  }

  const addProject = async () => {
    if (selectedProject && !(await confirmDiscard("switch projects", workflowDirty))) {
      return
    }

    try {
      const projectPath = await window.api.addProject()
      if (!projectPath) return

      setProjects((prev) => (prev.includes(projectPath) ? prev : [...prev, projectPath]))
      setSelectedProject(projectPath)
      setSelectedWorkflowPath(null)
      const emptyWorkflow = createEmptyWorkflow()
      setCurrentWorkflow(emptyWorkflow)
      setWorkflowSavedSnapshot(workflowSnapshot(emptyWorkflow))
      resetExecutionIfSafe()
      onProjectAdd?.(projectPath)
    } catch (error) {
      toast.error(`Failed to add project: ${String(error)}`)
    }
  }

  const openRemoveProjectDialog = (projectPath: string, event: React.MouseEvent) => {
    event.stopPropagation()
    setPendingRemoveProject(projectPath)
  }

  const commitRemoveProject = async () => {
    const projectPath = pendingRemoveProject
    if (!projectPath) return
    setPendingRemoveProject(null)

    try {
      await window.api.removeProject(projectPath)
      setProjects((prev) => prev.filter((path) => path !== projectPath))
      setExpandedProjects((prev) => prev.filter((p) => p !== projectPath))
      setProjectWorkflowsCache((prev) => {
        const next = { ...prev }
        delete next[projectPath]
        return next
      })
    } catch (error) {
      toast.error(`Failed to remove project: ${String(error)}`)
      return
    }

    if (selectedProject !== projectPath) return

    setSelectedProject(null)
    setWorkflows([])
    setSelectedWorkflowPath(null)
    const emptyWorkflow = createEmptyWorkflow()
    setCurrentWorkflow(emptyWorkflow)
    setWorkflowSavedSnapshot(workflowSnapshot(emptyWorkflow))
    resetExecutionIfSafe()
  }

  const selectProject = async (projectPath: string) => {
    if (selectedProject === projectPath) return

    if (selectedProject !== projectPath) {
      if (!(await confirmDiscard("switch projects", workflowDirty))) {
        return
      }

      setSelectedWorkflowPath(null)
      const emptyWorkflow = createEmptyWorkflow()
      setCurrentWorkflow(emptyWorkflow)
      setWorkflowSavedSnapshot(workflowSnapshot(emptyWorkflow))
      resetExecutionIfSafe()
    }

    setSelectedProject(projectPath)
    setMainView("thread")
  }

  const selectWorkflow = async (workflow: WorkflowFile, projectPath?: string) => {
    if (selectedWorkflowPath === workflow.path) {
      setMainView("thread")
      return
    }
    if (!(await confirmDiscard("open another workflow", workflowDirty))) {
      return
    }

    // Switch active project if clicking a workflow in a non-active project
    if (projectPath && selectedProject !== projectPath) {
      setSelectedProject(projectPath)
    }

    setMainView("thread")
    try {
      const loadedWorkflow = await window.api.loadWorkflow(workflow.path)
      setSelectedWorkflowPath(workflow.path)
      setCurrentWorkflow(loadedWorkflow)
      setWorkflowSavedSnapshot(workflowSnapshot(loadedWorkflow))
      resetExecutionIfSafe()
    } catch (error) {
      toast.error(`Failed to open workflow: ${String(error)}`)
    }
  }

  const createWorkflow = async (projectPath: string) => {
    if (creatingWorkflow) return
    if (!(await confirmDiscard("create a new workflow", workflowDirty))) {
      return
    }

    setCreatingWorkflow(true)
    try {
      const name = "new-workflow"
      const chain = createEmptyWorkflow()
      const filePath = await window.api.createWorkflow(projectPath, name, chain)
      const loadedWorkflow = await window.api.loadWorkflow(filePath)
      const workflowNameFromPath = filePath
        .split(/[\\/]/)
        .pop()
        ?.replace(/\.(chain|yaml|yml)$/i, "") || name

      setMainView("thread")
      setWorkflows((prev) => [{ name: loadedWorkflow.name || workflowNameFromPath, path: filePath, updatedAt: Date.now() }, ...prev])
      setSelectedWorkflowPath(filePath)
      setCurrentWorkflow(loadedWorkflow)
      setWorkflowSavedSnapshot(workflowSnapshot(loadedWorkflow))
      resetExecutionIfSafe()
      onWorkflowCreate?.(filePath)
      // Immediately enter rename mode for the new workflow
      setPendingRenameWorkflow({ name: loadedWorkflow.name || workflowNameFromPath, path: filePath, updatedAt: Date.now() })
    } catch (error) {
      toast.error(`Failed to create workflow: ${String(error)}`)
    } finally {
      setCreatingWorkflow(false)
    }
  }

  const openRenameWorkflowDialog = (workflow: WorkflowFile, event: React.MouseEvent) => {
    event.stopPropagation()
    if (workflowHasActiveRun(workflow.path)) {
      toast.error("Stop the workflow before renaming it")
      return
    }
    setRenameInput(workflow.name)
    setPendingRenameWorkflow(workflow)
  }

  const openRenameWorkflowDialogFromMenu = (workflow: WorkflowFile) => {
    if (workflowHasActiveRun(workflow.path)) {
      toast.error("Stop the workflow before renaming it")
      return
    }
    setRenameInput(workflow.name)
    setPendingRenameWorkflow(workflow)
  }

  const commitRenameWorkflow = async () => {
    const workflow = pendingRenameWorkflow
    if (!workflow) return
    const nextName = renameInput.trim()
    if (!nextName || nextName === workflow.name) {
      setPendingRenameWorkflow(null)
      return
    }
    if (workflowHasActiveRun(workflow.path)) {
      toast.error("Stop the workflow before renaming it")
      setPendingRenameWorkflow(null)
      return
    }

    try {
      const renamedPath = await window.api.renameWorkflow(workflow.path, nextName)
      moveWorkflowExecutionState({
        fromKey: toWorkflowExecutionKey(workflow.path),
        toKey: toWorkflowExecutionKey(renamedPath),
      })

      if (selectedProject) {
        const refreshed = await window.api.listProjectWorkflows(selectedProject)
        setWorkflows(refreshed)
      }

      if (selectedWorkflowPath === workflow.path) {
        setSelectedWorkflowPath(renamedPath)
        const renamedWorkflow = { ...currentWorkflow, name: nextName }
        setCurrentWorkflow(renamedWorkflow)
        setWorkflowSavedSnapshot(workflowSnapshot(renamedWorkflow))
      }

      setPendingRenameWorkflow(null)
      toast.success(`Workflow renamed: ${nextName}`)
    } catch (error) {
      toast.error(`Failed to rename workflow: ${String(error)}`)
    }
  }

  const openDeleteWorkflowDialog = (workflow: WorkflowFile, event: React.MouseEvent) => {
    event.stopPropagation()
    if (workflowHasActiveRun(workflow.path)) {
      toast.error("Stop the workflow before deleting it")
      return
    }
    setPendingDeleteWorkflow(workflow)
  }

  const commitDeleteWorkflow = async () => {
    const workflow = pendingDeleteWorkflow
    if (!workflow) return
    setPendingDeleteWorkflow(null)
    if (workflowHasActiveRun(workflow.path)) {
      toast.error("Stop the workflow before deleting it")
      return
    }

    try {
      await window.api.deleteWorkflow(workflow.path)
      clearWorkflowExecutionState(toWorkflowExecutionKey(workflow.path))

      if (selectedProject) {
        const refreshed = await window.api.listProjectWorkflows(selectedProject)
        setWorkflows(refreshed)
      }

      if (selectedWorkflowPath === workflow.path) {
        setSelectedWorkflowPath(null)
        const emptyWorkflow = createEmptyWorkflow()
        setCurrentWorkflow(emptyWorkflow)
        setWorkflowSavedSnapshot(workflowSnapshot(emptyWorkflow))
        resetExecutionIfSafe()
      }

      toast.success(`Workflow deleted: ${workflow.name}`)
    } catch (error) {
      toast.error(`Failed to delete workflow: ${String(error)}`)
    }
  }

  const createNewWorkflow = async () => {
    if (selectedProject) {
      await createWorkflow(selectedProject)
      return
    }

    const projectPath = await window.api.addProject()
    if (!projectPath) return

    setProjects((prev) => (prev.includes(projectPath) ? prev : [...prev, projectPath]))
    setSelectedProject(projectPath)
    await createWorkflow(projectPath)
  }

  const selectGlobalWorkflow = async (workflow: WorkflowFile) => {
    if (!selectedProject) {
      toast.error("Open a project first to run a global workflow")
      return
    }
    if (selectedWorkflowPath === workflow.path) {
      setMainView("thread")
      return
    }
    if (!(await confirmDiscard("open another workflow", workflowDirty))) {
      return
    }

    setMainView("thread")
    try {
      const loadedWorkflow = await window.api.loadWorkflow(workflow.path)
      setSelectedWorkflowPath(workflow.path)
      setCurrentWorkflow(loadedWorkflow)
      setWorkflowSavedSnapshot(workflowSnapshot(loadedWorkflow))
      resetExecutionIfSafe()
    } catch (error) {
      toast.error(`Failed to open workflow: ${String(error)}`)
    }
  }

  const folderName = (projectPath: string) => projectPath.split("/").pop() || projectPath
  const removingSelectedDirtyProject =
    pendingRemoveProject !== null &&
    pendingRemoveProject === selectedProject &&
    workflowDirty

  const latestRunByWorkflowPath = new Map<string, typeof pastRuns[number]>()
  for (const run of pastRuns) {
    const path = run.workflowPath
    if (!path || latestRunByWorkflowPath.has(path)) continue
    latestRunByWorkflowPath.set(path, run)
  }

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

  const formatRelativeTime = (updatedAt?: number) => {
    if (!updatedAt) return ""
    const deltaMs = Date.now() - updatedAt
    if (deltaMs < 60_000) return "now"
    const minutes = Math.floor(deltaMs / 60_000)
    if (minutes < 60) return `${minutes}m`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours}h`
    const days = Math.floor(hours / 24)
    if (days < 7) return `${days}d`
    const weeks = Math.floor(days / 7)
    return `${weeks}w`
  }

  const startResize = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    event.preventDefault()

    const startX = event.clientX
    const startWidth = sidebarWidth
    setResizing(true)

    const handleMove = (moveEvent: PointerEvent) => {
      const nextWidth = Math.max(240, Math.min(430, startWidth + (moveEvent.clientX - startX)))
      setSidebarWidth(nextWidth)
    }

    const stopResize = () => {
      setResizing(false)
      window.removeEventListener("pointermove", handleMove)
      window.removeEventListener("pointerup", stopResize)
      window.removeEventListener("pointercancel", stopResize)
    }

    window.addEventListener("pointermove", handleMove)
    window.addEventListener("pointerup", stopResize, { once: true })
    window.addEventListener("pointercancel", stopResize, { once: true })
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
          setRenameInput(wf.name)
          setPendingRenameWorkflow(wf)
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

  const handleResizeKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const minWidth = 240
    const maxWidth = 430
    const baseStep = event.shiftKey ? 24 : 12
    const keyStep = (event.key === "PageUp" || event.key === "PageDown") ? baseStep * 2 : baseStep
    let nextWidth = sidebarWidth

    if (event.key === "ArrowLeft" || event.key === "PageUp") {
      nextWidth = sidebarWidth - keyStep
    } else if (event.key === "ArrowRight" || event.key === "PageDown") {
      nextWidth = sidebarWidth + keyStep
    } else if (event.key === "Home") {
      nextWidth = minWidth
    } else if (event.key === "End") {
      nextWidth = maxWidth
    } else {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    setSidebarWidth(Math.max(minWidth, Math.min(maxWidth, nextWidth)))
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
      <div className="px-2 pt-3 pb-1 space-y-0.5">
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
      </div>

      {/* Section header */}
      <div className="px-3 pt-4 pb-2">
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
                  className="flex items-center justify-center h-control-sm w-control-sm rounded-md text-muted-foreground hover:bg-surface-2 hover:text-foreground ui-transition-colors ui-motion-fast"
                  onClick={() => void createNewWorkflow()}
                  aria-label="New workflow"
                >
                  <Plus size={14} />
                </button>
              </TooltipTrigger>
              <TooltipContent>New workflow</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  data-sidebar-item="true"
                  className="flex items-center justify-center h-control-sm w-control-sm rounded-md text-muted-foreground hover:bg-surface-2 hover:text-foreground ui-transition-colors ui-motion-fast"
                  onClick={() => void addProject()}
                  aria-label="Add project"
                >
                  <FolderOpen size={14} />
                </button>
              </TooltipTrigger>
              <TooltipContent>Add project</TooltipContent>
            </Tooltip>
          </div>
        </div>
        <div className="mt-2 h-px bg-hairline" />
      </div>

      {/* Workflow search */}
      {(workflows.length > 3 || Object.values(projectWorkflowsCache).some((wfs) => wfs.length > 3)) && (
        <div className="px-3 pb-2">
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
      <div className="ui-scroll-region flex-1 min-h-0 overflow-y-auto pb-2">
        {projects.length === 0 && (
          <button
            type="button"
            data-sidebar-item="true"
            onClick={() => void addProject()}
            className="mx-2 mt-1 flex items-center gap-2 rounded-md px-2 py-1.5 text-sidebar-item text-muted-foreground hover:bg-surface-2 hover:text-foreground ui-transition-colors ui-motion-fast"
          >
            <FolderOpen size={16} className="flex-shrink-0 opacity-60" />
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
                  <span className="truncate flex-1">{folderName(projectPath)}</span>
                </button>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="ui-icon-button opacity-0 group-hover:opacity-100 hover:bg-status-danger/20 hover:text-status-danger ui-transition-opacity ui-motion-fast"
                      onClick={(event) => openRemoveProjectDialog(projectPath, event)}
                      aria-label="Remove project"
                    >
                      <X size={14} />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Remove project</TooltipContent>
                </Tooltip>
              </div>

              {isExpanded && (
                <div className="mt-1 ml-8 space-y-0.5" role="listbox" aria-label={`${folderName(projectPath)} workflows`}>
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
                    const latestRun = latestRunByWorkflowPath.get(workflow.path)
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
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            aria-current={isSelected ? "page" : undefined}
                            data-sidebar-item="true"
                            data-workflow-path={workflow.path}
                            onClick={() => void selectWorkflow(workflow, projectPath)}
                            onDoubleClick={(event) => openRenameWorkflowDialog(workflow, event)}
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
                              "min-w-0 flex-1 flex items-center gap-2 rounded-md px-1.5 py-1 text-left ui-transition-colors ui-motion-fast focus-visible:outline-none",
                              isSelected
                                ? "hover:bg-transparent"
                                : "hover:bg-surface-2/70",
                            )}
                          >
                            {isRunning ? (
                              <Loader2 size={13} className="text-status-info animate-spin flex-shrink-0" />
                            ) : (
                              <span className={cn("inline-flex h-2.5 w-2.5 rounded-full border bg-transparent flex-shrink-0", statusDotClass)} />
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
                                  onClick={(event) => openRenameWorkflowDialog(workflow, event)}
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
                                  onClick={(event) => openDeleteWorkflowDialog(workflow, event)}
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
                          <div className="px-1.5 pb-1">
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
                            <div className="mt-1 flex items-center justify-between text-sidebar-meta text-muted-foreground">
                              <span className="truncate pr-2">{selectedWorkflowTitle}</span>
                              <span className="tabular-nums">
                                {activeRunCompletedSteps}/{activeRunTotalSteps}
                              </span>
                            </div>
                          </div>
                        )}

                        {!showLiveProgress && isRunOwner && (
                          <div className="px-1.5 pb-1 text-sidebar-meta text-status-info">
                            {runningHint}
                          </div>
                        )}

                        {!showLiveProgress && !isRunOwner && isSelected && latestRun && (
                          <div className="px-1.5 pb-1 text-sidebar-meta text-muted-foreground">
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
          <div className="mt-4 px-2">
            <div className="px-1 pb-1.5 section-kicker text-muted-foreground">Global workflows</div>
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
                openRenameWorkflowDialogFromMenu(sidebarContextMenu.workflow)
                setSidebarContextMenu(null)
              }}
            >
              Rename workflow
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => {
                if (!sidebarContextMenu) return
                const wf = sidebarContextMenu.workflow
                setSidebarContextMenu(null)
                void (async () => {
                  try {
                    const newPath = await window.api.duplicateWorkflow(wf.path)
                    if (sidebarContextMenu.projectPath) {
                      const refreshed = await window.api.listProjectWorkflows(sidebarContextMenu.projectPath)
                      if (sidebarContextMenu.projectPath === selectedProject) {
                        setWorkflows(refreshed)
                      } else {
                        setProjectWorkflowsCache((prev) => ({ ...prev, [sidebarContextMenu.projectPath!]: refreshed }))
                      }
                    }
                    const loaded = await window.api.loadWorkflow(newPath)
                    if (sidebarContextMenu.projectPath && sidebarContextMenu.projectPath !== selectedProject) {
                      setSelectedProject(sidebarContextMenu.projectPath)
                    }
                    setSelectedWorkflowPath(newPath)
                    setCurrentWorkflow(loaded)
                    setWorkflowSavedSnapshot(workflowSnapshot(loaded))
                    setMainView("thread")
                    toast.success("Workflow duplicated")
                  } catch (err) {
                    toast.error("Failed to duplicate workflow", { description: String(err) })
                  }
                })()
              }}
            >
              Duplicate workflow
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => {
                if (!sidebarContextMenu) return
                setPendingDeleteWorkflow(sidebarContextMenu.workflow)
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
      <div className="px-2 pb-2">
        <SidebarNavItem
          icon={Settings}
          label="Settings"
          active={mainView === "settings"}
          onClick={() => setMainView("settings")}
        />
      </div>

      {/* Resize handle */}
      <div
        role="slider"
        aria-label="Sidebar width"
        aria-orientation="horizontal"
        aria-valuemin={240}
        aria-valuemax={430}
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
            ? `Remove "${pendingRemoveProject ? folderName(pendingRemoveProject) : "project"}" from Projects? This will discard unsaved workflow changes. Files on disk will not be deleted.`
            : `Remove "${pendingRemoveProject ? folderName(pendingRemoveProject) : "project"}" from Projects? This will not delete files on disk.`
        }
        confirmLabel="Remove"
        onConfirm={() => void commitRemoveProject()}
      />
      {unsavedChangesDialog}
    </aside>
  )
}
