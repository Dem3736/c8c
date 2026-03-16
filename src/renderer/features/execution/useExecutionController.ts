import { useEffect, useRef } from "react"
import { useAtomValue } from "jotai"
import { toast } from "sonner"
import { createWorkflowExecutionController } from "./controller"
import type { WorkflowExecutionController } from "./controller"
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
  const workflowTemplateContextsRef = useRef(workflowTemplateContexts)
  workflowTemplateContextsRef.current = workflowTemplateContexts

  if (!controllerRef.current) {
    controllerRef.current = createWorkflowExecutionController({
      commitExecutionState,
      updateApprovalRequests,
      setPastRuns,
      listRuns: (projectPath) => window.api.listRuns(projectPath),
      onRunFailed: (message) => {
        toast.error("Run failed", {
          description: message,
        })
        addNotification({
          title: "Run failed",
          description: message,
          level: "error",
          source: "workflow",
        })
      },
      onRunFinished: ({ workflowKey, state }) => {
        if (state.runOutcome === "failed") return
        const workflowName = state.workflowName || "Workflow"
        const title = state.runOutcome === "completed"
          ? `Run completed: ${workflowName}`
          : state.runOutcome === "cancelled"
            ? `Run cancelled: ${workflowName}`
            : state.runOutcome === "interrupted"
              ? `Run interrupted: ${workflowName}`
              : `Run finished: ${workflowName}`
        const description = state.lastError
          || state.reportPath
          || state.workspace
          || undefined
        addNotification({
          title,
          description,
          level: state.runOutcome === "completed" ? "success" : state.runOutcome === "cancelled" ? "warning" : "error",
          source: "workflow",
        })

        const templateContext = workflowTemplateContextsRef.current[workflowKey]
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

        void window.api.persistArtifactsFromRun({
          projectPath: state.projectPath,
          workspace: state.workspace,
          caseId: templateContext.caseId,
          caseLabel: templateContext.caseLabel,
          sourceArtifactIds: templateContext.sourceArtifactIds,
          templateId: templateContext.templateId,
          templateName: templateContext.templateName,
          workflowPath: templateContext.workflowPath,
          workflowName: state.workflowName,
          contracts: templateContext.contractOut,
        }).then((result) => {
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
          addNotification({
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
  controller.sync({ workflowExecutionStates, selectedProject })

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
