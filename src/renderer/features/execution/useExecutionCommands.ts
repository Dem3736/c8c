import { useCallback } from "react"
import { toast } from "sonner"
import type { WebSearchBackend } from "@/lib/web-search-backend"
import {
  assembleInputWithAttachments,
  isRunInFlight,
  toWorkflowExecutionKey,
  type ExecutionRunStatus,
} from "@/lib/workflow-execution"
import type { InputAttachment, PermissionMode, ProviderId, RunResult, Workflow } from "@shared/types"
import {
  prepareWorkflowForExecution,
  resolveContinuationWorkflow,
  resolveExecutionInput,
  resolveExecutionStartResult,
} from "./commands"
import type { WorkflowExecutionController } from "./controller"

interface UseExecutionCommandsArgs {
  controller: WorkflowExecutionController
  runStatus: ExecutionRunStatus
  runId: string | null
  workflow: Workflow
  inputValue: string
  attachments: InputAttachment[]
  selectedProject: string | null
  selectedWorkflowPath: string | null
  workspace: string | null
  webSearchBackend: WebSearchBackend
  defaultProvider: ProviderId
  setActiveExecutionProvider: (provider: ProviderId) => void
  setCurrentWorkflow: (workflow: Workflow) => void
  setSelectedWorkflowPath: (workflowPath: string | null) => void
}

export function useExecutionCommands({
  controller,
  runStatus,
  runId,
  workflow,
  inputValue,
  attachments,
  selectedProject,
  selectedWorkflowPath,
  workspace,
  webSearchBackend,
  defaultProvider,
  setActiveExecutionProvider,
  setCurrentWorkflow,
  setSelectedWorkflowPath,
}: UseExecutionCommandsArgs) {
  const run = useCallback(async (executionMode: PermissionMode = "edit") => {
    if (isRunInFlight(runStatus)) return
    if (!workflow.nodes.length) return

    const resolvedInput = resolveExecutionInput(workflow, inputValue)
    if (!resolvedInput.valid) return

    const assembledValue = await assembleInputWithAttachments(
      resolvedInput.value,
      attachments,
      selectedProject,
      {
        readFileContent: window.api.readFileContent,
        loadRunResult: window.api.loadRunResult,
      },
    )

    const { workflowForRun, workflowForExecution } = prepareWorkflowForExecution(
      workflow,
      webSearchBackend,
      executionMode,
    )
    const workflowKey = controller.beginExecution(
      workflowForRun,
      selectedWorkflowPath ?? null,
      selectedProject ?? null,
    )
    setActiveExecutionProvider(workflowForRun.defaults?.provider || defaultProvider)

    try {
      const result = await window.api.runChain(
        workflowForExecution,
        { type: resolvedInput.type, value: assembledValue },
        selectedProject ?? undefined,
        selectedWorkflowPath ?? undefined,
        webSearchBackend,
      )

      const { startedRunId, errorMessage } = resolveExecutionStartResult(
        result,
        "No active window is available for execution.",
      )

      if (!startedRunId) {
        toast.error("Could not start run", {
          description: errorMessage || undefined,
        })
        controller.rollbackExecutionStart(workflowKey)
        return
      }
      controller.finishStartWithRunId(startedRunId, workflowKey)
    } catch (error) {
      console.error("[useChainExecution] runChain failed:", error)
      toast.error("Could not start run", {
        description: String(error),
      })
      controller.rollbackExecutionStart(workflowKey)
    }
  }, [
    attachments,
    controller,
    defaultProvider,
    inputValue,
    runStatus,
    selectedProject,
    selectedWorkflowPath,
    setActiveExecutionProvider,
    webSearchBackend,
    workflow,
  ])

  const cancel = useCallback(async () => {
    if (!isRunInFlight(runStatus)) return
    const executionKey = toWorkflowExecutionKey(selectedWorkflowPath ?? null)

    controller.updateExecutionForKey(executionKey, (previous) => ({
      ...previous,
      runStatus: "cancelling",
    }))

    if (runId) {
      try {
        await window.api.cancelRun(runId)
      } catch (error) {
        console.error("[useChainExecution] cancelRun failed:", error)
        toast.error("Could not cancel run", {
          description: String(error),
        })
        controller.updateExecutionForKey(executionKey, (previous) => ({
          ...previous,
          runStatus: "running",
        }))
        return
      }
    }

    controller.cancelExecution(executionKey, runId)
  }, [controller, runId, runStatus, selectedWorkflowPath])

  const rerunFrom = useCallback(async (fromNodeId: string) => {
    if (isRunInFlight(runStatus)) return
    if (!workspace || !workflow.nodes.length) return

    const workflowKeyForRun = toWorkflowExecutionKey(selectedWorkflowPath ?? null)
    const workflowForRun = controller.getExecutionState(workflowKeyForRun).workflowSnapshot ?? workflow
    const workflowKey = controller.beginExecution(workflowForRun, selectedWorkflowPath ?? null, selectedProject ?? null)
    setActiveExecutionProvider(workflowForRun.defaults?.provider || defaultProvider)
    const { workflowForExecution } = prepareWorkflowForExecution(
      workflowForRun,
      webSearchBackend,
    )

    try {
      const result = await window.api.rerunFrom(
        fromNodeId,
        workflowForExecution,
        workspace,
        selectedProject ?? undefined,
        selectedWorkflowPath ?? undefined,
        webSearchBackend,
      )

      const { startedRunId, errorMessage } = resolveExecutionStartResult(result, "")
      if (startedRunId) {
        controller.finishStartWithRunId(startedRunId, workflowKey)
        return
      }

      if (errorMessage) {
        toast.error("Could not restart from selected node", {
          description: errorMessage,
        })
        controller.rollbackExecutionStart(workflowKey)
        return
      }
      toast.error("Could not restart from selected node")
    } catch (error) {
      console.error("[useChainExecution] rerunFrom failed:", error)
      toast.error("Could not restart from selected node", {
        description: String(error),
      })
    }

    controller.rollbackExecutionStart(workflowKey)
  }, [
    controller,
    defaultProvider,
    runStatus,
    selectedProject,
    selectedWorkflowPath,
    setActiveExecutionProvider,
    webSearchBackend,
    workflow,
    workspace,
  ])

  const continueRun = useCallback(async (runToContinue: RunResult) => {
    if (isRunInFlight(runStatus)) return
    if (!runToContinue.workspace) {
      toast.error("Could not continue run", {
        description: "Run workspace is missing.",
      })
      return
    }

    let workflowForRun = workflow
    let workflowPathForRun = selectedWorkflowPath ?? null

    try {
      const resolvedContinuation = await resolveContinuationWorkflow(
        runToContinue,
        workflow,
        selectedWorkflowPath,
        (workflowPath) => window.api.loadWorkflow(workflowPath),
        (loadedWorkflow, workflowPath) => {
          setCurrentWorkflow(loadedWorkflow)
          setSelectedWorkflowPath(workflowPath)
        },
      )
      workflowForRun = resolvedContinuation.workflowForRun
      workflowPathForRun = resolvedContinuation.workflowPathForRun
    } catch (error) {
      toast.error("Could not continue run", {
        description: `Failed to load workflow file: ${String(error)}`,
      })
      return
    }

    if (!workflowForRun.nodes.length) {
      toast.error("Could not continue run", {
        description: "Workflow has no steps.",
      })
      return
    }

    const workflowKey = controller.beginExecution(workflowForRun, workflowPathForRun, selectedProject ?? null)
    setActiveExecutionProvider(workflowForRun.defaults?.provider || defaultProvider)
    controller.updateExecutionForKey(workflowKey, (previous) => ({
      ...previous,
      workspace: runToContinue.workspace,
    }))

    const { workflowForExecution } = prepareWorkflowForExecution(
      workflowForRun,
      webSearchBackend,
    )

    try {
      const result = await window.api.continueRun(
        workflowForExecution,
        runToContinue.workspace,
        selectedProject ?? undefined,
        workflowPathForRun ?? undefined,
        webSearchBackend,
      )

      const { startedRunId, errorMessage } = resolveExecutionStartResult(
        result,
        "No active window is available for execution.",
      )

      if (startedRunId) {
        controller.finishStartWithRunId(startedRunId, workflowKey)
        return
      }

      toast.error("Could not continue run", {
        description: errorMessage || undefined,
      })
    } catch (error) {
      console.error("[useChainExecution] continueRun failed:", error)
      toast.error("Could not continue run", {
        description: String(error),
      })
    }

    controller.rollbackExecutionStart(workflowKey)
  }, [
    controller,
    defaultProvider,
    runStatus,
    selectedProject,
    selectedWorkflowPath,
    setCurrentWorkflow,
    setActiveExecutionProvider,
    setSelectedWorkflowPath,
    webSearchBackend,
    workflow,
  ])

  return {
    run,
    cancel,
    rerunFrom,
    continueRun,
  }
}
