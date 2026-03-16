import { useCallback, useEffect, useRef, useState, type Ref } from "react"
import { useAtom, useAtomValue, useSetAtom } from "jotai"
import {
  currentWorkflowAtom,
  selectedWorkflowPathAtom,
  selectedProjectAtom,
  workflowsAtom,
  inputValueAtom,
  skillsAtom,
  chatPanelOpenAtom,
  desktopRuntimeAtom,
  batchDialogOpenAtom,
  workflowDirtyAtom,
  workflowSavedSnapshotAtom,
  mainViewAtom,
  projectSidebarOpenAtom,
  workflowReviewModeAtom,
} from "@/lib/store"
import { runIdAtom, runStatusAtom } from "@/features/execution"
import {
  Save,
  Play,
  Pause,
  Square,
  Undo2,
  Redo2,
  ChevronDown,
  MessageSquare,
  SlidersHorizontal,
  Layers,
  Loader2,
  Eye,
} from "lucide-react"
import type { PermissionMode } from "@shared/types"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import {
  CanvasDialogBody,
  CanvasDialogContent,
  CanvasDialogFooter,
  CanvasDialogHeader,
  Dialog,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/cn"
import {
  resolveWorkflowInput,
} from "@/lib/input-type"
import { validateWorkflow } from "@/lib/validate-workflow"
import { useToolbarActions } from "@/hooks/useToolbarActions"
import { useUnsavedChangesDialog } from "@/hooks/useUnsavedChangesDialog"
import { useWorkflowCreateNavigation } from "@/hooks/useWorkflowCreateNavigation"
import { workflowSnapshot } from "@/lib/workflow-snapshot"
import type { InputNodeConfig } from "@shared/types"
import { toast } from "sonner"
import {
  canUndoAtom,
  canRedoAtom,
  performRedo,
  performUndo,
  redoStackAtom,
  undoStackAtom,
} from "@/lib/undo-manager"

export function Toolbar({
  onRun,
  onCancel,
  agentToggleRef,
}: {
  onRun: (mode?: PermissionMode) => Promise<void> | void
  onCancel: () => Promise<void> | void
  agentToggleRef?: Ref<HTMLButtonElement>
}) {
  const [workflow] = useAtom(currentWorkflowAtom)
  const [workflowPath] = useAtom(selectedWorkflowPathAtom)
  const [selectedProject] = useAtom(selectedProjectAtom)
  const [inputValue] = useAtom(inputValueAtom)
  const [workflowDirty] = useAtom(workflowDirtyAtom)
  const [, setWorkflows] = useAtom(workflowsAtom)
  const [, setSkills] = useAtom(skillsAtom)
  const [, setCurrentWorkflow] = useAtom(currentWorkflowAtom)
  const [, setSelectedWorkflowPath] = useAtom(selectedWorkflowPathAtom)
  const [, setWorkflowSavedSnapshot] = useAtom(workflowSavedSnapshotAtom)
  const [runStatus, setRunStatus] = useAtom(runStatusAtom)
  const [runId] = useAtom(runIdAtom)
  const [chatOpen, setChatOpen] = useAtom(chatPanelOpenAtom)
  const [, setMainView] = useAtom(mainViewAtom)
  const [desktopRuntime] = useAtom(desktopRuntimeAtom)
  const [sidebarOpen] = useAtom(projectSidebarOpenAtom)
  const [workflowReviewMode] = useAtom(workflowReviewModeAtom)
  const setBatchOpen = useSetAtom(batchDialogOpenAtom)
  const [undoStack, setUndoStack] = useAtom(undoStackAtom)
  const [redoStack, setRedoStack] = useAtom(redoStackAtom)
  const canUndo = useAtomValue(canUndoAtom)
  const canRedo = useAtomValue(canRedoAtom)
  const [renameDialogOpen, setRenameDialogOpen] = useState(false)
  const [renameInput, setRenameInput] = useState("")
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false)
  const [templateNameInput, setTemplateNameInput] = useState("")
  const [saveFlash, setSaveFlash] = useState<"saved" | "imported" | null>(null)
  const flashTimerRef = useRef<number | null>(null)
  const { confirmDiscard, unsavedChangesDialog } = useUnsavedChangesDialog()
  const { openWorkflowCreate } = useWorkflowCreateNavigation()
  const {
    refreshProjectData,
    deriveTitleFromPath,
    save,
    saveAs,
    openFile,
    renameWorkflow,
    deleteWorkflow,
  } = useToolbarActions({
    workflow,
    workflowPath,
    selectedProject,
    setWorkflows,
    setSkills,
    setCurrentWorkflow,
    setSelectedWorkflowPath,
    setWorkflowSavedSnapshot,
  })

  const openRenameDialog = () => {
    if (!workflowPath) return
    const currentName = (workflow.name || "").trim() || deriveTitleFromPath(workflowPath)
    setRenameInput(currentName)
    setRenameDialogOpen(true)
  }

  const commitRename = async () => {
    if (!workflowPath) return
    if (!renameInput.trim()) {
      toast.error("Workflow name cannot be empty")
      return
    }
    await renameWorkflow(renameInput)
    setRenameDialogOpen(false)
  }

  const openTemplateDialog = () => {
    setTemplateNameInput((workflow.name || "").trim())
    setTemplateDialogOpen(true)
  }

  const commitSaveAsTemplate = async () => {
    const name = templateNameInput.trim()
    if (!name) {
      toast.error("Template name cannot be empty")
      return
    }
    try {
      const filePath = await window.api.saveAsTemplate(name, workflow)
      setTemplateDialogOpen(false)
      toast.success("Saved as template", { description: filePath })
    } catch (err) {
      toast.error("Failed to save template", { description: String(err) })
    }
  }

  const commitDelete = async () => {
    if (!workflowPath) return
    setDeleteDialogOpen(false)
    await deleteWorkflow()
  }

  const isRunning = runStatus === "running" || runStatus === "starting" || runStatus === "cancelling" || runStatus === "paused"
  const isStarting = runStatus === "starting"
  const isCancelling = runStatus === "cancelling"
  const isPaused = runStatus === "paused"
  const primaryShortcutLabel = desktopRuntime.primaryModifierLabel
  const runShortcutLabel = `${primaryShortcutLabel}↵`
  const chatShortcutLabel = `${primaryShortcutLabel}⇧K`
  const sidebarShortcutLabel = `${primaryShortcutLabel}B`
  const settingsShortcutLabel = `${primaryShortcutLabel},`
  const redoShortcutLabel = `${primaryShortcutLabel}⇧Z`

  // Has at least one skill node
  const hasSkillNodes = workflow.nodes.some((n) => n.type === "skill")
  const inputNode = workflow.nodes.find((n) => n.type === "input")
  const inputConfig = (inputNode?.config || {}) as InputNodeConfig
  const inputValidation = resolveWorkflowInput(inputValue, {
    inputType: inputConfig.inputType,
    required: inputConfig.required,
    defaultValue: inputConfig.defaultValue,
  })
  const workflowValidation = validateWorkflow(workflow)
  const hasBlockingErrors = workflowValidation.some((e) => e.severity === "error")
  const canRun = hasSkillNodes && inputValidation.valid && !hasBlockingErrors
  const runDisabledReason = !hasSkillNodes
    ? "Add at least one skill step to run."
    : !inputValidation.valid
      ? (inputValidation.message || "Input is required")
      : hasBlockingErrors
        ? `${workflowValidation.filter((e) => e.severity === "error").length} validation error(s) — fix before running.`
        : null
  const saveDisabledReason = isRunning
    ? "Cannot save while a run is in progress."
    : !workflowDirty
      ? "No unsaved changes."
      : null
  const batchDisabledReason = hasSkillNodes ? null : "Add at least one skill step to enable batch runs."
  const hasRunMenuActions = canRun || hasSkillNodes

  const handleRunWithValidation = async (mode: PermissionMode = "edit") => {
    // Show warnings (non-blocking) as toast
    const warnings = workflowValidation.filter((e) => e.severity === "warning")
    if (warnings.length > 0) {
      toast.warning(`${warnings.length} warning(s)`, {
        description: warnings.map((w) => w.message).join(" "),
      })
    }
    await onRun(mode)
  }

  const deleteLabel =
    workflowPath
      ? (workflow.name || "").trim() || deriveTitleFromPath(workflowPath)
      : "this workflow"
  const controlGroupClass = "control-cluster flex items-center gap-1 rounded-lg p-1"
  const macToolbarLeadingInset = desktopRuntime.platform === "macos" && desktopRuntime.titlebarHeight > 0 && !sidebarOpen
    ? 108
    : 0

  const flashToolbarStatus = useCallback((status: "saved" | "imported") => {
    setSaveFlash(status)
    if (flashTimerRef.current) {
      window.clearTimeout(flashTimerRef.current)
    }
    flashTimerRef.current = window.setTimeout(() => {
      setSaveFlash(null)
      flashTimerRef.current = null
    }, 1800)
  }, [])

  const handlePrimarySave = useCallback(async () => {
    if (!workflowDirty) return
    if (workflowPath) {
      const saved = await save()
      if (saved) flashToolbarStatus("saved")
      return
    }
    const saved = await saveAs()
    if (saved) flashToolbarStatus("saved")
  }, [flashToolbarStatus, save, saveAs, workflowDirty, workflowPath])

  const handleUndo = useCallback(() => {
    const restored = performUndo(workflow, undoStack, setUndoStack, setRedoStack)
    if (restored) {
      setCurrentWorkflow(restored)
    }
  }, [setCurrentWorkflow, setRedoStack, setUndoStack, undoStack, workflow])

  const handleRedo = useCallback(() => {
    const restored = performRedo(workflow, redoStack, setUndoStack, setRedoStack)
    if (restored) {
      setCurrentWorkflow(restored)
    }
  }, [redoStack, setCurrentWorkflow, setRedoStack, setUndoStack, workflow])

  const handleActionMenu = async (value: string) => {
    switch (value) {
      case "save_as":
        if (await saveAs()) {
          flashToolbarStatus("saved")
        }
        return
      case "import":
        if (!(await confirmDiscard("import another workflow", workflowDirty))) {
          return
        }
        if (await openFile()) {
          flashToolbarStatus("imported")
        }
        return
      case "refresh":
        await refreshProjectData()
        return
      case "templates":
        setMainView("templates")
        return
      case "generate":
        openWorkflowCreate()
        return
      case "save_as_template":
        openTemplateDialog()
        return
      case "duplicate":
        if (workflowPath) {
          try {
            const newPath = await window.api.duplicateWorkflow(workflowPath)
            const loadedWorkflow = await window.api.loadWorkflow(newPath)
            setSelectedWorkflowPath(newPath)
            setCurrentWorkflow(loadedWorkflow)
            setWorkflowSavedSnapshot(workflowSnapshot(loadedWorkflow))
            await refreshProjectData()
            toast.success("Workflow duplicated")
          } catch (err) {
            toast.error("Failed to duplicate workflow", { description: String(err) })
          }
        }
        return
      case "rename":
        openRenameDialog()
        return
      case "delete":
        if (workflowPath) setDeleteDialogOpen(true)
        return
      default:
        return
    }
  }

  useEffect(() => {
    return () => {
      if (flashTimerRef.current) {
        window.clearTimeout(flashTimerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const tag = target?.tagName
      const isEditable = Boolean(
        target?.isContentEditable ||
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        target?.closest("[contenteditable=true]"),
      )

      const usesPrimaryModifier = desktopRuntime.primaryModifierKey === "meta"
        ? event.metaKey
        : event.ctrlKey
      if (!usesPrimaryModifier) return

      const key = event.key.toLowerCase()
      if (key === "k" && event.shiftKey) {
        event.preventDefault()
        setChatOpen((open) => !open)
        return
      }

      if (event.key === ",") {
        event.preventDefault()
        setMainView("settings")
        return
      }

      if (key === "s") {
        if (isEditable) return
        event.preventDefault()
        if (workflowDirty) {
          void handlePrimarySave()
        }
        return
      }

      if (event.key !== "Enter" || isEditable) return
      event.preventDefault()
      if (isRunning) {
        void onCancel()
      } else if (canRun) {
        void handleRunWithValidation("edit")
      }
    }

    window.addEventListener("keydown", handler)
    return () => {
      window.removeEventListener("keydown", handler)
    }
  }, [canRun, desktopRuntime.primaryModifierKey, handlePrimarySave, isRunning, onCancel, onRun, setChatOpen, setMainView, workflowDirty])

  return (
    <>
      <div className="border-b border-hairline bg-gradient-to-b from-surface-1/96 to-surface-1/84 shadow-[0_1px_0_hsl(var(--hairline)/0.7),0_2px_6px_hsl(var(--foreground)/0.04)] backdrop-blur-md">
        <div
          className="flex items-center gap-2 ui-content-gutter py-2 no-drag overflow-x-auto"
          style={macToolbarLeadingInset > 0
            ? { paddingLeft: `calc(var(--content-gutter) + ${macToolbarLeadingInset}px)` }
            : undefined}
        >
          <div role="group" aria-label="Primary workflow actions" className={controlGroupClass}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleUndo}
                disabled={!canUndo || isRunning}
                aria-label="Undo"
                title={
                  isRunning
                    ? "Undo is unavailable while a run is in progress."
                    : !canUndo
                      ? "Nothing to undo yet."
                      : undefined
                }
              >
                <Undo2 size={14} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {isRunning
                ? "Undo is unavailable while a run is in progress."
                : canUndo
                  ? `Undo (${primaryShortcutLabel}Z)`
                  : "Nothing to undo yet."}
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleRedo}
                disabled={!canRedo || isRunning}
                aria-label="Redo"
                title={
                  isRunning
                    ? "Redo is unavailable while a run is in progress."
                    : !canRedo
                      ? "Nothing to redo yet."
                      : undefined
                }
              >
                <Redo2 size={14} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {isRunning
                ? "Redo is unavailable while a run is in progress."
                : canRedo
                  ? `Redo (${redoShortcutLabel})`
                  : "Nothing to redo yet."}
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                onClick={() => void handlePrimarySave()}
                disabled={!workflowDirty || isRunning}
                aria-label={saveFlash === "saved" ? "Saved" : "Save workflow"}
                title={saveDisabledReason || undefined}
              >
                <Save size={14} />
              </Button>
            </TooltipTrigger>
          <TooltipContent>
            {saveDisabledReason || `Save workflow (${primaryShortcutLabel}S)`}
          </TooltipContent>
          </Tooltip>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="w-[168px] justify-between" disabled={isRunning}>
                <span className="inline-flex min-w-0 flex-1 items-center gap-2">
                  <SlidersHorizontal size={14} />
                  <span className="truncate">Actions</span>
                </span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuGroup>
                <DropdownMenuLabel>File</DropdownMenuLabel>
                <DropdownMenuItem onSelect={() => void handleActionMenu("save_as")}>
                  Save as...
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => void handleActionMenu("save_as_template")}>
                  Save as template
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => void handleActionMenu("import")}>
                  Import workflow...
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={!selectedProject}
                  onSelect={() => void handleActionMenu("refresh")}
                >
                  Refresh project data
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuLabel>Create</DropdownMenuLabel>
                <DropdownMenuItem onSelect={() => void handleActionMenu("templates")}>
                  Browse templates
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => void handleActionMenu("generate")}>
                  Create with Agent
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuLabel>Workflow</DropdownMenuLabel>
                <DropdownMenuItem
                  disabled={!workflowPath}
                  onSelect={() => void handleActionMenu("duplicate")}
                >
                  Duplicate workflow
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={!workflowPath}
                  onSelect={() => void handleActionMenu("rename")}
                >
                  Rename workflow
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={!workflowPath}
                  onSelect={() => void handleActionMenu("delete")}
                >
                  Delete workflow
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>

          </div>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={chatOpen ? "default" : "ghost"}
                size="sm"
                ref={agentToggleRef}
                className="gap-1.5"
                onClick={() => setChatOpen(!chatOpen)}
                aria-label="Toggle Agent panel"
              >
                <MessageSquare size={14} />
                Agent
              </Button>
            </TooltipTrigger>
            <TooltipContent>Toggle Agent panel ({chatShortcutLabel})</TooltipContent>
          </Tooltip>

          <div
            role="status"
            aria-live="polite"
            data-visible={saveFlash ? "true" : "false"}
            className="ui-inline-presence ui-meta-text min-w-[4.25rem] text-status-success"
          >
            {saveFlash === "saved" ? "Saved" : saveFlash === "imported" ? "Imported" : ""}
          </div>

          <div className="flex-1" />

          <div
            role="group"
            aria-label="Run controls"
            className={cn(
              "flex items-center gap-1 rounded-lg p-1 ui-transition-surface ui-motion-fast",
              isRunning
                ? isPaused
                  ? "surface-warning-soft shadow-inset-highlight-subtle"
                  : "surface-info-soft shadow-inset-highlight-subtle"
                : controlGroupClass,
            )}
          >
            {isRunning ? (
              <>
                {isPaused ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="ui-fade-slide-in-trailing gap-1.5"
                        onClick={() => {
                          if (runId) {
                            void window.api.resumeRun(runId)
                            setRunStatus("running")
                          }
                        }}
                      >
                        <Play size={14} />
                        Resume
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Resume run</TooltipContent>
                  </Tooltip>
                ) : (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="ui-fade-slide-in-trailing gap-1.5"
                        onClick={() => {
                          if (runId) {
                            void window.api.pauseRun(runId)
                            setRunStatus("paused")
                          }
                        }}
                        disabled={isCancelling || isStarting}
                      >
                        <Pause size={14} />
                        Pause
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Pause run (running nodes will finish)</TooltipContent>
                  </Tooltip>
                )}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="destructive"
                      size="sm"
                      className="ui-fade-slide-in-trailing"
                      onClick={() => void onCancel()}
                      disabled={isCancelling || isStarting}
                    >
                      {isCancelling ? <Loader2 size={14} className="animate-spin" /> : <Square size={14} />}
                      {isCancelling ? "Stopping..." : isStarting ? "Connecting..." : "Stop"}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{isCancelling ? "Stopping run..." : isStarting ? "Connecting to CLI..." : `Stop run (${runShortcutLabel})`}</TooltipContent>
                </Tooltip>
              </>
            ) : (
              <div className="flex items-center gap-0.5 rounded-lg control-cluster p-0.5">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="default"
                      size="sm"
                      onClick={() => void handleRunWithValidation("edit")}
                      disabled={!canRun}
                      className="min-w-[5.75rem] gap-1.5 rounded-md pr-3 shadow-[inset_0_1px_0_hsl(var(--primary-foreground)/0.2),0_0_0_1px_hsl(var(--hairline)/0.22)]"
                      title={runDisabledReason || undefined}
                    >
                      <Play size={14} />
                      Run
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{runDisabledReason || `Run in edit mode (${runShortcutLabel})`}</TooltipContent>
                </Tooltip>

                <DropdownMenu>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={!hasRunMenuActions}
                          className="relative w-8 rounded-md border border-transparent px-0 text-muted-foreground hover:border-hairline/80 hover:bg-surface-1/90 hover:text-foreground before:absolute before:left-0 before:top-1/2 before:h-4 before:w-px before:-translate-y-1/2 before:bg-hairline/70"
                          aria-label="Choose run mode"
                          title={!hasRunMenuActions ? batchDisabledReason || undefined : undefined}
                        >
                          <ChevronDown size={14} />
                        </Button>
                      </DropdownMenuTrigger>
                    </TooltipTrigger>
                    <TooltipContent>{hasRunMenuActions ? "More run options" : batchDisabledReason}</TooltipContent>
                  </Tooltip>
                  <DropdownMenuContent align="end">
                    <DropdownMenuLabel>Run options</DropdownMenuLabel>
                    <DropdownMenuItem
                      disabled={!canRun}
                      onSelect={() => void handleRunWithValidation("plan")}
                      className="items-start gap-3 py-2"
                    >
                      <span className="mt-0.5 inline-flex h-6 w-6 flex-none items-center justify-center rounded-md border border-hairline bg-surface-2 text-muted-foreground ui-elevation-inset">
                        <Eye size={13} />
                      </span>
                      <span className="flex min-w-0 flex-col">
                        <span className="text-body-sm font-medium text-foreground">Run in plan mode</span>
                        <span className="ui-meta-text text-muted-foreground">
                          {canRun ? "Read-only analysis without file edits" : (runDisabledReason || "Unavailable")}
                        </span>
                      </span>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={!hasSkillNodes}
                      onSelect={() => setBatchOpen(true)}
                      className="items-start gap-3 py-2"
                    >
                      <span className="mt-0.5 inline-flex h-6 w-6 flex-none items-center justify-center rounded-md border border-hairline bg-surface-2 text-muted-foreground ui-elevation-inset">
                        <Layers size={13} />
                      </span>
                      <span className="flex min-w-0 flex-col">
                        <span className="text-body-sm font-medium text-foreground">Batch run</span>
                        <span className="ui-meta-text text-muted-foreground">
                          {batchDisabledReason || "Run the workflow on multiple inputs"}
                        </span>
                      </span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )}
          </div>
        </div>
      </div>
      <div
        data-open={!isRunning && !workflowReviewMode && Boolean(runDisabledReason) ? "true" : "false"}
        className={cn(
          "ui-collapsible",
          !isRunning && !workflowReviewMode && runDisabledReason && "border-b border-hairline",
        )}
      >
        <div className="ui-collapsible-inner">
          <div className="px-3 py-1 ui-meta-text text-muted-foreground bg-surface-1/70">
            {runDisabledReason || ""}
            {hasBlockingErrors && (
              <ul className="mt-1 list-disc list-inside">
                {workflowValidation.filter((e) => e.severity === "error").map((e) => (
                  <li key={`${e.nodeId}-${e.field}`}>{e.message}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
      <span className="sr-only">
        Keyboard shortcuts: {primaryShortcutLabel} Z to undo, {redoShortcutLabel} to redo, {primaryShortcutLabel} S to save, {runShortcutLabel} to run or stop, {chatShortcutLabel} to toggle Agent panel, {sidebarShortcutLabel} to show or hide the sidebar, {settingsShortcutLabel} to open settings, question mark to open shortcuts help.
      </span>

      {/* Rename dialog — replaces window.prompt for accessibility */}
      <Dialog open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
        <CanvasDialogContent showCloseButton={false}>
          <CanvasDialogHeader>
            <DialogTitle>Rename workflow</DialogTitle>
            <DialogDescription>Enter a new name for this workflow.</DialogDescription>
          </CanvasDialogHeader>
          <CanvasDialogBody>
            <Input
              value={renameInput}
              onChange={(e) => setRenameInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void commitRename()}
              autoFocus
            />
          </CanvasDialogBody>
          <CanvasDialogFooter>
            <DialogClose asChild>
              <Button variant="ghost" size="sm">Cancel</Button>
            </DialogClose>
            <Button size="sm" onClick={() => void commitRename()}>Rename</Button>
          </CanvasDialogFooter>
        </CanvasDialogContent>
      </Dialog>

      {/* Delete confirmation dialog — replaces window.confirm for accessibility */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <CanvasDialogContent showCloseButton={false}>
          <CanvasDialogHeader>
            <DialogTitle>Delete workflow</DialogTitle>
            <DialogDescription>
              Delete &ldquo;{deleteLabel}&rdquo;? The workflow file will be permanently removed.
            </DialogDescription>
          </CanvasDialogHeader>
          <CanvasDialogFooter>
            <DialogClose asChild>
              <Button variant="ghost" size="sm">Cancel</Button>
            </DialogClose>
            <Button variant="destructive" size="sm" onClick={() => void commitDelete()}>
              Delete
            </Button>
          </CanvasDialogFooter>
        </CanvasDialogContent>
      </Dialog>
      {/* Save as template dialog */}
      <Dialog open={templateDialogOpen} onOpenChange={setTemplateDialogOpen}>
        <CanvasDialogContent showCloseButton={false}>
          <CanvasDialogHeader>
            <DialogTitle>Save as template</DialogTitle>
            <DialogDescription>Enter a name for this template.</DialogDescription>
          </CanvasDialogHeader>
          <CanvasDialogBody>
            <Input
              value={templateNameInput}
              onChange={(e) => setTemplateNameInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void commitSaveAsTemplate()}
              placeholder="Template name"
              autoFocus
            />
          </CanvasDialogBody>
          <CanvasDialogFooter>
            <DialogClose asChild>
              <Button variant="ghost" size="sm">Cancel</Button>
            </DialogClose>
            <Button size="sm" onClick={() => void commitSaveAsTemplate()}>Save</Button>
          </CanvasDialogFooter>
        </CanvasDialogContent>
      </Dialog>
      {unsavedChangesDialog}
    </>
  )
}
