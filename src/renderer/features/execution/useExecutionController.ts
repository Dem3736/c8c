import { useEffect, useLayoutEffect, useRef } from "react"
import { useAtomValue } from "jotai"
import { toast } from "sonner"
import { createWorkflowExecutionController } from "./controller"
import type { WorkflowExecutionController } from "./controller"
import { DEFAULT_EXECUTION_IPC_TIMEOUT_MS, withIpcTimeout } from "./commands"
import type { ApprovalRequest, WorkflowExecutionState } from "@/lib/workflow-execution"
import { workflowTemplateContextsAtom } from "@/lib/store"
import type { ActiveExecutionSnapshot, RunResult } from "@shared/types"
import { useInboxNotifications } from "@/hooks/useInboxNotifications"

type UpdateValue<T> = T | ((prev: T) => T)

interface UseExecutionControllerArgs {
  workflowExecutionStates: Record<string, WorkflowExecutionState>
  selectedProject: string | null
  commitExecutionState: (workflowKey: string, nextState: WorkflowExecutionState) => void
  updateApprovalRequests: (update: UpdateValue<ApprovalRequest[]>) => void
  setPastRuns: (runs: RunResult[]) => void
}

export function useExecutionController({
  workflowExecutionStates,
  selectedProject,
  commitExecutionState,
  updateApprovalRequests,
  setPastRuns,
}: UseExecutionControllerArgs): WorkflowExecutionController {
  const controllerRef = useRef<WorkflowExecutionController | null>(null)
  const { addNotification } = useInboxNotifications()
  const workflowTemplateContexts = useAtomValue(workflowTemplateContextsAtom)
  const commitExecutionStateRef = useRef(commitExecutionState)
  const updateApprovalRequestsRef = useRef(updateApprovalRequests)
  const setPastRunsRef = useRef(setPastRuns)
  const addNotificationRef = useRef(addNotification)
  const workflowTemplateContextsRef = useRef(workflowTemplateContexts)
  commitExecutionStateRef.current = commitExecutionState
  updateApprovalRequestsRef.current = updateApprovalRequests
  setPastRunsRef.current = setPastRuns
  addNotificationRef.current = addNotification
  workflowTemplateContextsRef.current = workflowTemplateContexts

  if (!controllerRef.current) {
    controllerRef.current = createWorkflowExecutionController({
      commitExecutionState: (workflowKey, nextState) => {
        commitExecutionStateRef.current(workflowKey, nextState)
      },
      updateApprovalRequests: (update) => {
        updateApprovalRequestsRef.current(update)
      },
      setPastRuns: (runs) => {
        setPastRunsRef.current(runs)
      },
      listRuns: (projectPath) => window.api.listRuns(projectPath),
      onRunFailed: (message) => {
        toast.error("Run failed", {
          description: message,
        })
        addNotificationRef.current({
          title: "Run failed",
          description: message,
          level: "error",
          source: "workflow",
        })
      },
      onRunFinished: ({ workflowKey, state }) => {
        if (state.runOutcome === "failed") return
        const templateContext = workflowTemplateContextsRef.current[workflowKey]
        const workflowName = state.workflowName || "Workflow"
        const title = state.runOutcome === "completed"
          ? `Run completed: ${workflowName}`
          : state.runOutcome === "cancelled"
            ? `Run cancelled: ${workflowName}`
            : state.runOutcome === "interrupted"
              ? `Run interrupted: ${workflowName}`
              : `Run finished: ${workflowName}`
        const description = state.runOutcome === "completed"
          ? templateContext?.pack?.recommendedNext?.length
            ? "Saved outputs are ready. Open the workflow to continue the guided path."
            : "Open the workflow to review the result and saved outputs."
          : state.lastError || state.workspace || undefined
        addNotificationRef.current({
          title,
          description,
          level: state.runOutcome === "completed" ? "success" : state.runOutcome === "cancelled" ? "warning" : "error",
          source: "workflow",
          action: state.runWorkflowPath
            ? {
                kind: "open_workflow",
                workflowPath: state.runWorkflowPath,
                label: state.runOutcome === "completed" ? "Open workflow" : "Inspect workflow",
              }
            : undefined,
        })

        if (
          state.runOutcome !== "completed"
          || !state.projectPath
          || !state.workspace
          || !templateContext?.contractOut?.length
        ) {
          return
        }

        controllerRef.current?.updateExecutionForKey(workflowKey, (previous) => ({
          ...previous,
          artifactRecords: [],
          artifactPersistenceStatus: "saving",
          artifactPersistenceError: null,
        }))

        void withIpcTimeout(
          window.api.persistArtifactsFromRun({
            projectPath: state.projectPath,
            workspace: state.workspace,
            factoryId: templateContext.factoryId,
            factoryLabel: templateContext.factoryLabel,
            caseId: templateContext.caseId,
            caseLabel: templateContext.caseLabel,
            sourceArtifactIds: templateContext.sourceArtifactIds,
            templateId: templateContext.templateId,
            templateName: templateContext.templateName,
            workflowPath: templateContext.workflowPath,
            workflowName: state.workflowName,
            contracts: templateContext.contractOut,
          }),
          DEFAULT_EXECUTION_IPC_TIMEOUT_MS,
          "Artifact persistence timed out. Check the main process and try again.",
        ).then((result) => {
          controllerRef.current?.updateExecutionForKey(workflowKey, (previous) => ({
            ...previous,
            artifactRecords: result.artifacts,
            artifactPersistenceStatus: "saved",
            artifactPersistenceError: null,
          }))
        }).catch((error) => {
          const message = error instanceof Error ? error.message : String(error)
          controllerRef.current?.updateExecutionForKey(workflowKey, (previous) => ({
            ...previous,
            artifactPersistenceStatus: "error",
            artifactPersistenceError: message,
          }))
          addNotificationRef.current({
            title: `Artifact persistence failed: ${workflowName}`,
            description: message,
            level: "error",
            source: "workflow",
          })
        })
      },
      onError: (scope, error) => {
        console.error(`[useChainExecution] ${scope} failed:`, error)
      },
    })
  }

  const controller = controllerRef.current

  useLayoutEffect(() => {
    controller.sync({ workflowExecutionStates, selectedProject })
  }, [controller, selectedProject, workflowExecutionStates])

  useEffect(() => {
    const unsubscribe = window.api.onWorkflowEvent((event) => {
      controller.processWorkflowEvent(event)
    })

    return unsubscribe
  }, [controller])

  useEffect(() => {
    controller.refreshPastRuns()
  }, [controller, selectedProject])

  useEffect(() => {
    window.api.getActiveExecutions().then((executions: ActiveExecutionSnapshot[]) => {
      for (const execution of executions) {
        if (execution.kind !== "run") continue
        controller.rehydrateActiveRun(execution)
      }
    }).catch((error) => {
      console.error("[useExecutionController] getActiveExecutions failed:", error)
    })
  }, [controller])

  return controller
}
