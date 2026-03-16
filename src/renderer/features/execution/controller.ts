import {
  createCancelledExecutionState,
  createEmptyWorkflowExecutionState,
  createExecutionStartState,
  reduceWorkflowExecutionEvent,
  toWorkflowExecutionKey,
  type ApprovalRequest,
  type WorkflowExecutionState,
} from "@/lib/workflow-execution"
import type { ActiveWorkflowRun, RunResult, Workflow, WorkflowEvent } from "@shared/types"

type UpdateValue<T> = T | ((prev: T) => T)

interface WorkflowExecutionControllerDeps {
  commitExecutionState: (workflowKey: string, nextState: WorkflowExecutionState) => void
  updateApprovalRequests: (update: UpdateValue<ApprovalRequest[]>) => void
  setPastRuns: (runs: RunResult[]) => void
  listRuns: (projectPath: string) => Promise<RunResult[]>
  onRunFailed: (message: string) => void
  onRunFinished?: (state: WorkflowExecutionState) => void
  onError: (scope: string, error: unknown) => void
}

interface SyncExecutionControllerArgs {
  workflowExecutionStates: Record<string, WorkflowExecutionState>
  selectedProject: string | null
}

export class WorkflowExecutionController {
  private workflowExecutionStates: Record<string, WorkflowExecutionState> = {}
  private selectedProject: string | null = null
  private readonly runWorkflowKeys = new Map<string, string>()
  private readonly bufferedEvents = new Map<string, WorkflowEvent[]>()
  private readonly previousExecutionSnapshots = new Map<string, WorkflowExecutionState>()
  private readonly workflowSnapshots = new Map<string, Workflow>()
  private listRunsRequestId = 0

  constructor(private readonly deps: WorkflowExecutionControllerDeps) {}

  sync({ workflowExecutionStates, selectedProject }: SyncExecutionControllerArgs) {
    this.workflowExecutionStates = workflowExecutionStates
    this.selectedProject = selectedProject
  }

  getExecutionState(workflowKey: string): WorkflowExecutionState {
    return this.workflowExecutionStates[workflowKey] ?? createEmptyWorkflowExecutionState()
  }

  updateExecutionForKey(
    workflowKey: string,
    update: WorkflowExecutionState | ((previous: WorkflowExecutionState) => WorkflowExecutionState),
  ) {
    const previousState = this.getExecutionState(workflowKey)
    const nextState = typeof update === "function"
      ? update(previousState)
      : update

    this.workflowExecutionStates = {
      ...this.workflowExecutionStates,
      [workflowKey]: nextState,
    }

    this.deps.commitExecutionState(workflowKey, nextState)
  }

  refreshPastRuns() {
    if (!this.selectedProject) return

    const requestId = ++this.listRunsRequestId
    this.deps.listRuns(this.selectedProject).then((runs) => {
      if (this.listRunsRequestId !== requestId) return
      this.deps.setPastRuns(runs)
    }).catch((error) => {
      if (this.listRunsRequestId !== requestId) return
      this.deps.onError("listRuns", error)
    })
  }

  beginExecution(
    targetWorkflow: Workflow,
    workflowPathForRun: string | null,
    projectPathForRun: string | null,
  ) {
    const workflowKey = toWorkflowExecutionKey(workflowPathForRun)
    const previousState = this.getExecutionState(workflowKey)
    this.previousExecutionSnapshots.set(workflowKey, previousState)
    this.workflowSnapshots.set(workflowKey, structuredClone(targetWorkflow))
    this.updateExecutionForKey(workflowKey, (previous) =>
      createExecutionStartState(previous, targetWorkflow, workflowPathForRun, projectPathForRun),
    )
    return workflowKey
  }

  rollbackExecutionStart(workflowKey: string) {
    const previousState = this.previousExecutionSnapshots.get(workflowKey) ?? createEmptyWorkflowExecutionState()
    this.previousExecutionSnapshots.delete(workflowKey)
    this.workflowSnapshots.delete(workflowKey)
    this.updateExecutionForKey(workflowKey, previousState)
  }

  finishStartWithRunId(startedRunId: string, workflowKey: string) {
    this.runWorkflowKeys.set(startedRunId, workflowKey)
    this.previousExecutionSnapshots.delete(workflowKey)
    this.updateExecutionForKey(workflowKey, (previous) => ({
      ...previous,
      runId: startedRunId,
    }))

    const bufferedEvents = this.bufferedEvents.get(startedRunId) ?? []
    this.bufferedEvents.delete(startedRunId)
    for (const event of bufferedEvents) {
      this.processWorkflowEvent(event)
    }
  }

  rehydrateActiveRun(snapshot: ActiveWorkflowRun) {
    const workflowKey = toWorkflowExecutionKey(snapshot.workflowPath)
    this.runWorkflowKeys.set(snapshot.runId, workflowKey)
    this.workflowSnapshots.set(workflowKey, {
      version: 1,
      name: snapshot.workflowName,
      nodes: snapshot.runtimeNodes,
      edges: snapshot.runtimeEdges,
    } as Workflow)
    this.updateExecutionForKey(workflowKey, (previous) => ({
      ...previous,
      runStatus: snapshot.status === "paused" ? "paused" : "running",
      runOutcome: null,
      runStartedAt: snapshot.startedAt,
      lastUpdatedAt: snapshot.updatedAt,
      completedAt: null,
      runId: snapshot.runId,
      runWorkflowPath: snapshot.workflowPath,
      workflowName: snapshot.workflowName,
      projectPath: snapshot.projectPath,
      workflowSnapshot: {
        version: 1,
        name: snapshot.workflowName,
        nodes: snapshot.runtimeNodes,
        edges: snapshot.runtimeEdges,
      } as Workflow,
      nodeStates: snapshot.nodeStates,
      activeNodeId: Object.entries(snapshot.nodeStates).find(([, nodeState]) => nodeState.status === "running")?.[0] ?? null,
      workspace: snapshot.workspace,
      runtimeNodes: snapshot.runtimeNodes,
      runtimeEdges: snapshot.runtimeEdges,
      runtimeMeta: snapshot.runtimeMeta,
      lastError: previous.lastError,
    }))
  }

  processWorkflowEvent(event: WorkflowEvent) {
    const workflowKey = this.resolveWorkflowKeyForRun(event.runId)
    if (!workflowKey) {
      const buffered = this.bufferedEvents.get(event.runId) ?? []
      buffered.push(event)
      this.bufferedEvents.set(event.runId, buffered)
      return
    }

    const workflowSnapshot = this.workflowSnapshots.get(workflowKey)
    const previousState = this.getExecutionState(workflowKey)
    const transition = reduceWorkflowExecutionEvent(previousState, event, workflowSnapshot)
    this.updateExecutionForKey(workflowKey, transition.nextState)

    if (transition.effects.approvalRequest) {
      this.deps.updateApprovalRequests((previous) => [
        ...previous.filter((request) => !(
          request.runId === transition.effects.approvalRequest?.runId
          && request.nodeId === transition.effects.approvalRequest?.nodeId
        )),
        transition.effects.approvalRequest!,
      ])
    }

    if (transition.effects.runFailedMessage) {
      this.deps.onRunFailed(transition.effects.runFailedMessage)
    }

    if (transition.effects.runFinished) {
      this.deps.onRunFinished?.(transition.nextState)
      this.clearRunTracking(event.runId)
      this.previousExecutionSnapshots.delete(workflowKey)
      this.workflowSnapshots.delete(workflowKey)
      this.refreshPastRuns()
    }
  }

  cancelExecution(workflowKey: string, runIdToClear: string | null | undefined) {
    this.clearRunTracking(runIdToClear)
    this.previousExecutionSnapshots.delete(workflowKey)
    this.workflowSnapshots.delete(workflowKey)
    this.updateExecutionForKey(workflowKey, createCancelledExecutionState)
  }

  private clearRunTracking(runIdToClear: string | null | undefined) {
    if (!runIdToClear) return
    this.runWorkflowKeys.delete(runIdToClear)
    this.bufferedEvents.delete(runIdToClear)
    this.removeApprovalRequestsForRun(runIdToClear)
  }

  private resolveWorkflowKeyForRun(runId: string): string | null {
    const mappedWorkflowKey = this.runWorkflowKeys.get(runId)
    if (mappedWorkflowKey && this.workflowExecutionStates[mappedWorkflowKey]?.runId === runId) {
      return mappedWorkflowKey
    }

    const matchingWorkflowEntry = Object.entries(this.workflowExecutionStates)
      .find(([, state]) => state.runId === runId)
    if (!matchingWorkflowEntry) {
      return mappedWorkflowKey ?? null
    }

    const [resolvedWorkflowKey] = matchingWorkflowEntry
    if (mappedWorkflowKey && mappedWorkflowKey !== resolvedWorkflowKey) {
      this.moveTrackedWorkflowKey(mappedWorkflowKey, resolvedWorkflowKey)
    }
    this.runWorkflowKeys.set(runId, resolvedWorkflowKey)
    return resolvedWorkflowKey
  }

  private moveTrackedWorkflowKey(fromKey: string, toKey: string) {
    if (fromKey === toKey) return

    const workflowSnapshot = this.workflowSnapshots.get(fromKey)
    if (workflowSnapshot) {
      this.workflowSnapshots.set(toKey, workflowSnapshot)
      this.workflowSnapshots.delete(fromKey)
    }

    const previousSnapshot = this.previousExecutionSnapshots.get(fromKey)
    if (previousSnapshot) {
      this.previousExecutionSnapshots.set(toKey, previousSnapshot)
      this.previousExecutionSnapshots.delete(fromKey)
    }
  }

  private removeApprovalRequestsForRun(runIdToClear: string | null | undefined) {
    if (!runIdToClear) return
    this.deps.updateApprovalRequests((previous) =>
      previous.filter((request) => request.runId !== runIdToClear),
    )
  }
}

export function createWorkflowExecutionController(deps: WorkflowExecutionControllerDeps) {
  return new WorkflowExecutionController(deps)
}
