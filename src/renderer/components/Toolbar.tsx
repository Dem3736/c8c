import { useEffect, useState } from "react"
import { useAtom, useSetAtom } from "jotai"
import {
  currentWorkflowAtom,
  selectedWorkflowPathAtom,
  selectedProjectAtom,
  workflowsAtom,
  runStatusAtom,
  templateBrowserOpenAtom,
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
import { useChainExecution } from "@/hooks/useChainExecution"
import {
  Save,
  Play,
  Square,
  MessageSquare,
  SlidersHorizontal,
  Layers,
} from "lucide-react"
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
import { useToolbarActions } from "@/hooks/useToolbarActions"
import { useUnsavedChangesDialog } from "@/hooks/useUnsavedChangesDialog"
import type { InputNodeConfig } from "@shared/types"
import { toast } from "sonner"

export function Toolbar() {
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
  const [runStatus] = useAtom(runStatusAtom)
  const setTemplateBrowserOpen = useSetAtom(templateBrowserOpenAtom)
  const setGenerateOpen = useSetAtom(generateDialogOpenAtom)
  const [chatOpen, setChatOpen] = useAtom(chatPanelOpenAtom)
  const [, setMainView] = useAtom(mainViewAtom)
  const [desktopRuntime] = useAtom(desktopRuntimeAtom)
  const setBatchOpen = useSetAtom(batchDialogOpenAtom)
  const { run, cancel } = useChainExecution()

  const [renameDialogOpen, setRenameDialogOpen] = useState(false)
  const [renameInput, setRenameInput] = useState("")
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
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

  const commitDelete = async () => {
    if (!workflowPath) return
    setDeleteDialogOpen(false)
    await deleteWorkflow()
  }

  const isRunning = runStatus === "running"
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
  const canRun = hasSkillNodes && inputValidation.valid
  const runDisabledReason = !hasSkillNodes
    ? "Add at least one skill step to run."
    : !inputValidation.valid
      ? (inputValidation.message || "Input is required")
      : null

  const deleteLabel =
    workflowPath
      ? (workflow.name || "").trim() || deriveTitleFromPath(workflowPath)
      : "this workflow"
  const controlGroupClass = "control-cluster flex items-center gap-1 rounded-lg p-1"

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
        setTemplateBrowserOpen(true)
        return
      case "generate":
        setGenerateOpen(true)
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
        if (workflowPath && workflowDirty) {
          void save()
        }
        return
      }

      if (event.key !== "Enter" || isEditable) return
      event.preventDefault()
      if (isRunning) {
        void cancel()
      } else if (canRun) {
        void run()
      }
    }

    window.addEventListener("keydown", handler)
    return () => {
      window.removeEventListener("keydown", handler)
    }
  }, [canRun, cancel, desktopRuntime.primaryModifierKey, isRunning, run, save, setChatOpen, setMainView, workflowDirty, workflowPath])

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
                onClick={save}
                disabled={!workflowPath || !workflowDirty}
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

        <div
          role="group"
          aria-label="Run controls"
          className={cn(
            "flex items-center gap-1 rounded-lg p-1",
            isRunning
              ? "border border-destructive/20 bg-destructive/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.24)]"
              : controlGroupClass,
          )}
        >
          {isRunning ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="destructive" size="sm" onClick={cancel}>
                  <Square size={14} />
                  Stop
                </Button>
              </TooltipTrigger>
              <TooltipContent>Stop run ({runShortcutLabel})</TooltipContent>
            </Tooltip>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="default"
                  size="sm"
                  className="!text-primary-foreground [-webkit-text-fill-color:hsl(var(--primary-foreground))]"
                  onClick={run}
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
      {unsavedChangesDialog}
    </>
  )
}
