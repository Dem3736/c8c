import { useCallback, useEffect, useMemo, useRef, useState, type Ref } from "react"
import { useAtom, useAtomValue, useSetAtom } from "jotai"
import type { InputNodeConfig, PermissionMode } from "@shared/types"
import { toast } from "sonner"
import { runIdAtom, runStatusAtom } from "@/features/execution"
import {
  WorkflowPrimaryActions,
  type ToolbarActionMenuValue,
} from "@/components/toolbar/WorkflowPrimaryActions"
import {
  WorkflowRunControls,
  type WorkflowValidationGroup,
} from "@/components/toolbar/WorkflowRunControls"
import { WorkflowRunBlocker } from "@/components/toolbar/WorkflowRunBlocker"
import { WorkflowToolbarDialogs } from "@/components/toolbar/WorkflowToolbarDialogs"
import { useBlankWorkflowCreation } from "@/hooks/useBlankWorkflowCreation"
import { useToolbarActions } from "@/hooks/useToolbarActions"
import { useUnsavedChangesDialog } from "@/hooks/useUnsavedChangesDialog"
import { useWorkflowCreateNavigation } from "@/hooks/useWorkflowCreateNavigation"
import { resolveWorkflowInput } from "@/lib/input-type"
import {
  consumeShortcut,
  isEditableKeyboardTarget,
  isShortcutConsumed,
  matchesPrimaryShortcut,
} from "@/lib/keyboard-shortcuts"
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
  selectedNodeIdAtom,
  validationNavigationTargetAtom,
  viewModeAtom,
} from "@/lib/store"
import {
  canUndoAtom,
  canRedoAtom,
  performRedo,
  performUndo,
  redoStackAtom,
  undoStackAtom,
} from "@/lib/undo-manager"
import { resolveValidationNavigationTarget } from "@/lib/validation-navigation"
import { validateWorkflow } from "@/lib/validate-workflow"
import { getWorkflowNodeLabel } from "@/lib/workflow-labels"
import { workflowSnapshot } from "@/lib/workflow-snapshot"

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
  const [viewMode, setViewMode] = useAtom(viewModeAtom)
  const [desktopRuntime] = useAtom(desktopRuntimeAtom)
  const [sidebarOpen] = useAtom(projectSidebarOpenAtom)
  const [workflowReviewMode] = useAtom(workflowReviewModeAtom)
  const setSelectedNodeId = useSetAtom(selectedNodeIdAtom)
  const setValidationNavigationTarget = useSetAtom(validationNavigationTargetAtom)
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
  const [saveFlash, setSaveFlash] = useState<"saved" | "imported" | "exported" | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [runControlPending, setRunControlPending] = useState<"pause" | "resume" | null>(null)
  const flashTimerRef = useRef<number | null>(null)
  const { confirmDiscard, unsavedChangesDialog } = useUnsavedChangesDialog()
  const { openWorkflowCreate } = useWorkflowCreateNavigation()
  const { createBlankWorkflow, creatingBlankWorkflow } = useBlankWorkflowCreation({ confirmDiscard })
  const {
    refreshProjectData,
    deriveTitleFromPath,
    save,
    saveAs,
    exportCopy,
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
      toast.error("Flow name cannot be empty")
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
      toast.error("Library name cannot be empty")
      return
    }
    try {
      const filePath = await window.api.saveAsTemplate(name, workflow)
      setTemplateDialogOpen(false)
      toast.success("Saved to library", { description: filePath })
    } catch (err) {
      toast.error("Failed to save to library", { description: String(err) })
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

  const hasSkillNodes = workflow.nodes.some((node) => node.type === "skill")
  const inputNode = workflow.nodes.find((node) => node.type === "input")
  const inputConfig = (inputNode?.config || {}) as InputNodeConfig
  const inputValidation = resolveWorkflowInput(inputValue, {
    inputType: inputConfig.inputType,
    required: inputConfig.required,
    defaultValue: inputConfig.defaultValue,
  })
  const workflowValidation = validateWorkflow(workflow)
  const hasBlockingErrors = workflowValidation.some((issue) => issue.severity === "error")
  const blockingValidationCount = workflowValidation.filter((issue) => issue.severity === "error").length
  const warningValidationCount = workflowValidation.filter((issue) => issue.severity === "warning").length
  const groupedValidationIssues = useMemo<WorkflowValidationGroup[]>(() => {
    const groups = new Map<string, { label: string; issues: typeof workflowValidation }>()

    for (const issue of workflowValidation) {
      const existing = groups.get(issue.nodeId)
      if (existing) {
        existing.issues.push(issue)
        continue
      }

      const label = issue.nodeId === "__workflow__"
        ? "Workflow defaults"
        : (() => {
            const node = workflow.nodes.find((candidate) => candidate.id === issue.nodeId)
            return node ? getWorkflowNodeLabel(node) : issue.nodeId
          })()

      groups.set(issue.nodeId, { label, issues: [issue] })
    }

    return [...groups.entries()].map(([nodeId, group]) => ({
      nodeId,
      label: group.label,
      issues: group.issues,
    }))
  }, [workflow, workflowValidation])
  const canRun = hasSkillNodes && inputValidation.valid && !hasBlockingErrors
  const runDisabledReason = !hasSkillNodes
    ? "Add at least one skill step to run."
    : !inputValidation.valid
      ? (inputValidation.message || "Input is required")
      : hasBlockingErrors
        ? `${blockingValidationCount} validation error(s) — fix before running.`
        : null
  const saveDisabledReason = isRunning
    ? "Cannot save while a run is in progress."
    : isSaving
      ? "Save in progress."
      : !workflowDirty
        ? "No unsaved changes."
        : null
  const batchDisabledReason = hasSkillNodes ? null : "Add at least one skill step to enable batch runs."
  const hasRunMenuActions = canRun || hasSkillNodes

  const handleRunWithValidation = useCallback(async (mode: PermissionMode = "edit") => {
    const warnings = workflowValidation.filter((issue) => issue.severity === "warning")
    if (warnings.length > 0) {
      toast.warning(`${warnings.length} warning(s)`, {
        description: warnings.map((warning) => warning.message).join(" "),
      })
    }
    await onRun(mode)
  }, [onRun, workflowValidation])

  const navigateToValidationIssue = useCallback((issue: (typeof workflowValidation)[number]) => {
    const target = resolveValidationNavigationTarget(workflow, issue, viewMode)
    setViewMode(target.viewMode)
    setSelectedNodeId(target.nodeId)
    setValidationNavigationTarget(
      target.fieldId
        ? {
            nodeId: target.nodeId,
            fieldId: target.fieldId,
            requestId: Date.now(),
          }
        : null,
    )
  }, [setSelectedNodeId, setValidationNavigationTarget, setViewMode, viewMode, workflow])

  const revealRunBlocker = useCallback(() => {
    if (!runDisabledReason) return
    const firstBlockingIssue = workflowValidation.find((issue) => issue.severity === "error") || null
    toast.warning("Run blocked", {
      description: firstBlockingIssue?.message || runDisabledReason,
    })
    if (firstBlockingIssue) {
      navigateToValidationIssue(firstBlockingIssue)
    }
  }, [navigateToValidationIssue, runDisabledReason, workflowValidation])

  const deleteLabel = workflowPath ? (workflow.name || "").trim() || deriveTitleFromPath(workflowPath) : "this flow"
  const controlGroupClass = "control-cluster flex items-center gap-1 rounded-lg p-1"
  const macToolbarLeadingInset = desktopRuntime.platform === "macos" && desktopRuntime.titlebarHeight > 0 && !sidebarOpen
    ? 108
    : 0

  const flashToolbarStatus = useCallback((status: "saved" | "imported" | "exported") => {
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
    if (!workflowDirty || isSaving) return

    setIsSaving(true)
    try {
      if (workflowPath) {
        const saved = await save()
        if (saved) flashToolbarStatus("saved")
        return
      }

      const saved = await saveAs()
      if (saved) flashToolbarStatus("saved")
    } finally {
      setIsSaving(false)
    }
  }, [flashToolbarStatus, isSaving, save, saveAs, workflowDirty, workflowPath])

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

  const toggleChatPanel = useCallback(() => {
    setChatOpen((open) => !open)
  }, [setChatOpen])

  const handleResumeRun = useCallback(async () => {
    if (!runId || runControlPending) return

    setRunControlPending("resume")
    try {
      const resumed = await window.api.resumeRun(runId)
      if (!resumed) {
        toast.error("Could not resume run")
        return
      }
      setRunStatus("running")
      toast.success("Flow resumed")
    } catch (error) {
      toast.error("Could not resume run", {
        description: String(error),
      })
    } finally {
      setRunControlPending(null)
    }
  }, [runControlPending, runId, setRunStatus])

  const handlePauseRun = useCallback(async () => {
    if (!runId || runControlPending) return

    setRunControlPending("pause")
    try {
      const paused = await window.api.pauseRun(runId)
      if (!paused) {
        toast.error("Could not pause run")
        return
      }
      setRunStatus("paused")
      toast.success("Paused", {
        description: "The current step will finish before the flow stops.",
      })
    } catch (error) {
      toast.error("Could not pause run", {
        description: String(error),
      })
    } finally {
      setRunControlPending(null)
    }
  }, [runControlPending, runId, setRunStatus])

  const handleActionMenu = async (value: ToolbarActionMenuValue) => {
    switch (value) {
      case "save_as":
        if (await saveAs()) {
          flashToolbarStatus("saved")
        }
        return
      case "export_copy":
        if (await exportCopy()) {
          flashToolbarStatus("exported")
        }
        return
      case "import":
        if (!(await confirmDiscard("import another flow", workflowDirty))) {
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
      case "blank":
        await createBlankWorkflow()
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
            toast.success("Flow duplicated")
          } catch (err) {
            toast.error("Failed to duplicate flow", { description: String(err) })
          }
        }
        return
      case "rename":
        openRenameDialog()
        return
      case "delete":
        if (workflowPath) {
          if (runStatus === "running" || runStatus === "starting" || runStatus === "cancelling" || runStatus === "paused") {
            toast.error("Stop the flow before deleting it")
            return
          }
          setDeleteDialogOpen(true)
        }
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
      if (event.defaultPrevented || isShortcutConsumed(event)) return

      const isEditable = isEditableKeyboardTarget(event.target as HTMLElement | null)

      if (matchesPrimaryShortcut(event, { key: "k", primaryModifierKey: desktopRuntime.primaryModifierKey, shift: true })) {
        event.preventDefault()
        toggleChatPanel()
        return
      }

      if (matchesPrimaryShortcut(event, { key: ",", primaryModifierKey: desktopRuntime.primaryModifierKey })) {
        event.preventDefault()
        setMainView("settings")
        return
      }

      if (matchesPrimaryShortcut(event, { key: "s", primaryModifierKey: desktopRuntime.primaryModifierKey })) {
        if (isEditable) return
        event.preventDefault()
        if (workflowDirty) {
          void handlePrimarySave()
        }
        return
      }

      if (isEditable || !matchesPrimaryShortcut(event, { key: "Enter", primaryModifierKey: desktopRuntime.primaryModifierKey })) return
      if (isRunning) {
        consumeShortcut(event)
        void onCancel()
      } else if (canRun) {
        consumeShortcut(event)
        void handleRunWithValidation("edit")
      } else {
        consumeShortcut(event)
        revealRunBlocker()
      }
    }

    window.addEventListener("keydown", handler)
    return () => {
      window.removeEventListener("keydown", handler)
    }
  }, [
    canRun,
    desktopRuntime.primaryModifierKey,
    handlePrimarySave,
    handleRunWithValidation,
    isRunning,
    onCancel,
    revealRunBlocker,
    setMainView,
    toggleChatPanel,
    workflowDirty,
  ])

  return (
    <>
      <div className="border-b border-hairline bg-gradient-to-b from-surface-1/96 to-surface-1/84 shadow-[0_1px_0_hsl(var(--hairline)/0.7),0_2px_6px_hsl(var(--foreground)/0.04)] backdrop-blur-md">
        <div
          className="flex items-center gap-2 ui-content-gutter py-2 no-drag overflow-x-auto"
          style={macToolbarLeadingInset > 0
            ? { paddingLeft: `calc(var(--content-gutter) + ${macToolbarLeadingInset}px)` }
            : undefined}
        >
          <WorkflowPrimaryActions
            controlGroupClass={controlGroupClass}
            canUndo={canUndo}
            canRedo={canRedo}
            isRunning={isRunning}
            isSaving={isSaving}
            saveDisabledReason={saveDisabledReason}
            saveFlash={saveFlash}
            primaryShortcutLabel={primaryShortcutLabel}
            redoShortcutLabel={redoShortcutLabel}
            chatOpen={chatOpen}
            chatShortcutLabel={chatShortcutLabel}
            creatingBlankWorkflow={creatingBlankWorkflow}
            hasSelectedProject={Boolean(selectedProject)}
            hasWorkflowPath={Boolean(workflowPath)}
            agentToggleRef={agentToggleRef}
            onUndo={handleUndo}
            onRedo={handleRedo}
            onSave={() => void handlePrimarySave()}
            onActionMenuSelect={(value) => void handleActionMenu(value)}
            onToggleChat={toggleChatPanel}
          />

          <WorkflowRunControls
            controlGroupClass={controlGroupClass}
            isRunning={isRunning}
            isPaused={isPaused}
            isCancelling={isCancelling}
            isStarting={isStarting}
            runControlPending={runControlPending}
            runShortcutLabel={runShortcutLabel}
            workflowValidation={workflowValidation}
            hasBlockingErrors={hasBlockingErrors}
            blockingValidationCount={blockingValidationCount}
            warningValidationCount={warningValidationCount}
            groupedValidationIssues={groupedValidationIssues}
            canRun={canRun}
            runDisabledReason={runDisabledReason}
            hasRunMenuActions={hasRunMenuActions}
            batchDisabledReason={batchDisabledReason}
            hasSkillNodes={hasSkillNodes}
            onPause={() => void handlePauseRun()}
            onResume={() => void handleResumeRun()}
            onCancel={() => void onCancel()}
            onRun={(mode) => void handleRunWithValidation(mode)}
            onNavigateToValidationIssue={navigateToValidationIssue}
            onOpenBatch={() => setBatchOpen(true)}
          />
        </div>
      </div>

      <WorkflowRunBlocker
        isRunning={isRunning}
        workflowReviewMode={workflowReviewMode}
        runDisabledReason={runDisabledReason}
        workflowValidation={workflowValidation}
        hasBlockingErrors={hasBlockingErrors}
        onNavigateToValidationIssue={navigateToValidationIssue}
      />

      <span className="sr-only">
        Keyboard shortcuts: {primaryShortcutLabel} Z to undo, {redoShortcutLabel} to redo, {primaryShortcutLabel} S to save, {runShortcutLabel} to run or stop, {chatShortcutLabel} to toggle Agent panel, {sidebarShortcutLabel} to show or hide the sidebar, {settingsShortcutLabel} to open settings, question mark to open shortcuts help.
      </span>

      <WorkflowToolbarDialogs
        renameDialogOpen={renameDialogOpen}
        onRenameDialogOpenChange={setRenameDialogOpen}
        renameInput={renameInput}
        onRenameInputChange={setRenameInput}
        onCommitRename={() => void commitRename()}
        deleteDialogOpen={deleteDialogOpen}
        onDeleteDialogOpenChange={setDeleteDialogOpen}
        deleteLabel={deleteLabel}
        workflowDirty={workflowDirty}
        onCommitDelete={() => void commitDelete()}
        templateDialogOpen={templateDialogOpen}
        onTemplateDialogOpenChange={setTemplateDialogOpen}
        templateNameInput={templateNameInput}
        onTemplateNameInputChange={setTemplateNameInput}
        onCommitSaveAsTemplate={() => void commitSaveAsTemplate()}
      />

      {unsavedChangesDialog}
    </>
  )
}
