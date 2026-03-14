import { useCallback, useEffect, useState } from "react"
import { useAtom, useSetAtom } from "jotai"
import {
  currentWorkflowAtom,
  selectedWorkflowPathAtom,
  selectedProjectAtom,
  workflowsAtom,
  runStatusAtom,
  runIdAtom,
  generateDialogOpenAtom,
  inputValueAtom,
  skillsAtom,
  chatPanelOpenAtom,
  desktopRuntimeAtom,
  batchDialogOpenAtom,
  workflowDirtyAtom,
  workflowSavedSnapshotAtom,
  mainViewAtom,
} from "@/lib/store"
import {
  Save,
  Play,
  Pause,
  Square,
  MessageSquare,
  SlidersHorizontal,
  Layers,
  Loader2,
  Eye,
  Pencil,
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
import { validateWorkflow, type ValidationError } from "@/lib/validate-workflow"
import { useToolbarActions } from "@/hooks/useToolbarActions"
import { useUnsavedChangesDialog } from "@/hooks/useUnsavedChangesDialog"
import { workflowSnapshot } from "@/lib/workflow-snapshot"
import type { InputNodeConfig } from "@shared/types"
import { toast } from "sonner"

export function Toolbar({
  onRun,
  onCancel,
}: {
  onRun: () => Promise<void> | void
  onCancel: () => Promise<void> | void
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
  const setGenerateOpen = useSetAtom(generateDialogOpenAtom)
  const [chatOpen, setChatOpen] = useAtom(chatPanelOpenAtom)
  const [, setMainView] = useAtom(mainViewAtom)
  const [desktopRuntime] = useAtom(desktopRuntimeAtom)
  const setBatchOpen = useSetAtom(batchDialogOpenAtom)
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([])
  const [renameDialogOpen, setRenameDialogOpen] = useState(false)
  const [renameInput, setRenameInput] = useState("")
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false)
  const [templateNameInput, setTemplateNameInput] = useState("")
  const { confirmDiscard, unsavedChangesDialog } = useUnsavedChangesDialog()
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
  const settingsShortcutLabel = `${primaryShortcutLabel},`

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

  const handleRunWithValidation = async () => {
    // Show warnings (non-blocking) as toast
    const warnings = workflowValidation.filter((e) => e.severity === "warning")
    if (warnings.length > 0) {
      toast.warning(`${warnings.length} warning(s)`, {
        description: warnings.map((w) => w.message).join(" "),
      })
    }
    setValidationErrors([])
    await onRun()
  }

  const deleteLabel =
    workflowPath
      ? (workflow.name || "").trim() || deriveTitleFromPath(workflowPath)
      : "this workflow"
  const controlGroupClass = "control-cluster flex items-center gap-1 rounded-lg p-1"

  const handlePrimarySave = useCallback(async () => {
    if (!workflowDirty) return
    if (workflowPath) {
      await save()
      return
    }
    await saveAs()
  }, [save, saveAs, workflowDirty, workflowPath])

  const handleActionMenu = async (value: string) => {
    switch (value) {
      case "save_as":
        await saveAs()
        return
      case "import":
        if (!(await confirmDiscard("import another workflow", workflowDirty))) {
          return
        }
        await openFile()
        return
      case "refresh":
        await refreshProjectData()
        return
      case "templates":
        setMainView("templates")
        return
      case "generate":
        setGenerateOpen(true)
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
    const handler = (event: KeyboardEvent) => {
      const usesPrimaryModifier = desktopRuntime.primaryModifierKey === "meta"
        ? event.metaKey
        : event.ctrlKey
      if (!usesPrimaryModifier) return

      const target = event.target as HTMLElement | null
      const tag = target?.tagName
      const isEditable = Boolean(
        target?.isContentEditable ||
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        target?.closest("[contenteditable=true]"),
      )

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
        void handleRunWithValidation()
      }
    }

    window.addEventListener("keydown", handler)
    return () => {
      window.removeEventListener("keydown", handler)
    }
  }, [canRun, desktopRuntime.primaryModifierKey, handlePrimarySave, isRunning, onCancel, onRun, setChatOpen, setMainView, workflowDirty])

  return (
    <>
      <div className="flex items-center gap-2 ui-content-gutter py-2 border-b border-hairline no-drag bg-gradient-to-b from-surface-1/90 to-surface-1/90 backdrop-blur-md overflow-x-auto">
        <div role="group" aria-label="Primary workflow actions" className={controlGroupClass}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => void handlePrimarySave()}
                disabled={!workflowDirty}
              >
                <Save size={14} />
                {workflowDirty ? "Save*" : "Save"}
              </Button>
            </TooltipTrigger>
          <TooltipContent>Save workflow ({primaryShortcutLabel}S)</TooltipContent>
          </Tooltip>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="w-[168px] justify-between">
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
                  Generate workflow
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
              className="gap-1.5"
              onClick={() => setChatOpen(!chatOpen)}
              aria-label="Toggle Agent panel"
            >
              <MessageSquare size={14} />
              Agent
            </Button>
          </TooltipTrigger>
          <TooltipContent>Toggle chat panel ({chatShortcutLabel})</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5"
              onClick={() => setBatchOpen(true)}
              disabled={!hasSkillNodes}
            >
              <Layers size={14} />
              Batch
            </Button>
          </TooltipTrigger>
          <TooltipContent>Run on multiple inputs</TooltipContent>
        </Tooltip>

        <div className="flex-1" />

        {/* Permission mode toggle */}
        {(() => {
          const mode: PermissionMode = workflow.defaults?.permissionMode ?? "edit"
          const setMode = (next: PermissionMode) => {
            setCurrentWorkflow((prev) => ({
              ...prev,
              defaults: { ...prev.defaults, permissionMode: next },
            }))
          }
          return (
            <div
              role="radiogroup"
              aria-label="Permission mode"
              className="flex items-center rounded-lg border border-hairline bg-surface-2/60 p-0.5"
            >
              <button
                type="button"
                role="radio"
                aria-checked={mode === "plan"}
                onClick={() => setMode("plan")}
                className={cn(
                  "flex items-center gap-1 px-2 h-control-sm rounded-md text-body-sm ui-pressable ui-motion-fast",
                  mode === "plan"
                    ? "bg-surface-1 shadow-sm text-foreground font-medium"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Eye size={13} />
                Plan
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={mode === "edit"}
                onClick={() => setMode("edit")}
                className={cn(
                  "flex items-center gap-1 px-2 h-control-sm rounded-md text-body-sm ui-pressable ui-motion-fast",
                  mode === "edit"
                    ? "bg-surface-1 shadow-sm text-foreground font-medium"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Pencil size={13} />
                Edit
              </button>
            </div>
          )
        })()}

        <div
          role="group"
          aria-label="Run controls"
          className={cn(
            "flex items-center gap-1 rounded-lg p-1",
            isRunning
              ? isPaused
                ? "surface-warning-soft shadow-inset-highlight-subtle"
                : "border border-status-info/20 bg-status-info/10 shadow-inset-highlight-subtle"
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
                      className="gap-1.5"
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
                      className="gap-1.5"
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
                  <Button variant="destructive" size="sm" onClick={() => void onCancel()} disabled={isCancelling || isStarting}>
                    {isCancelling ? <Loader2 size={14} className="animate-spin" /> : <Square size={14} />}
                    {isCancelling ? "Stopping..." : isStarting ? "Connecting..." : "Stop"}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{isCancelling ? "Stopping run..." : isStarting ? "Connecting to CLI..." : `Stop run (${runShortcutLabel})`}</TooltipContent>
              </Tooltip>
            </>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => void handleRunWithValidation()}
                  disabled={!canRun}
                >
                  <Play size={14} />
                  Run
                </Button>
              </TooltipTrigger>
              <TooltipContent>Run ({runShortcutLabel})</TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>
      {!isRunning && runDisabledReason && (
        <div className="px-3 py-1 ui-meta-text text-muted-foreground border-b border-hairline bg-surface-1/70">
          {runDisabledReason}
          {hasBlockingErrors && (
            <ul className="mt-1 list-disc list-inside">
              {workflowValidation.filter((e) => e.severity === "error").map((e) => (
                <li key={`${e.nodeId}-${e.field}`}>{e.message}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      <span className="sr-only">
        Keyboard shortcuts: {primaryShortcutLabel} S to save, {runShortcutLabel} to run or stop, {chatShortcutLabel} to toggle chat panel, {settingsShortcutLabel} to open settings.
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
