import { useEffect, useRef } from "react"
import { toast } from "sonner"
import { createWorkflowExecutionController } from "./controller"
import type { WorkflowExecutionController } from "./controller"
import type { ApprovalRequest, WorkflowExecutionState } from "@/lib/workflow-execution"
import type { RunResult } from "@shared/types"

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

  return controller
}
