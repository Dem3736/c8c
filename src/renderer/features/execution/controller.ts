import {
  createCancelledExecutionState,
  createEmptyWorkflowExecutionState,
  createExecutionStartState,
  reduceWorkflowExecutionEvent,
  toWorkflowExecutionKey,
  type ApprovalRequest,
  type ExecutionRunStatus,
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
  onRunFinished?: (args: { workflowKey: string; state: WorkflowExecutionState }) => void
  onError: (scope: string, error: unknown) => void
}

interface SyncExecutionControllerArgs {
  workflowExecutionStates: Record<string, WorkflowExecutionState>
  selectedProject: string | null
}

interface BufferedWorkflowEvents {
  events: WorkflowEvent[]
  lastUpdatedAt: number
}

interface PendingExecutionStart {
  startAttemptId: number
  cancelled: boolean
}

export interface ExecutionStartHandle {
  workflowKey: string
  startAttemptId: number
}

export interface FinishExecutionStartResult {
  accepted: boolean
  shouldCancelRun: boolean
}

const BUFFERED_EVENT_TTL_MS = 60_000
const MAX_BUFFERED_RUNS = 100
const MAX_BUFFERED_EVENTS_PER_RUN = 500

export class WorkflowExecutionController {
  private workflowExecutionStates: Record<string, WorkflowExecutionState> = {}
  private selectedProject: string | null = null
  private readonly runWorkflowKeys = new Map<string, string>()
  private readonly bufferedEvents = new Map<string, BufferedWorkflowEvents>()
  private readonly previousExecutionSnapshots = new Map<string, WorkflowExecutionState>()
  private readonly workflowSnapshots = new Map<string, Workflow>()
  private readonly pendingStarts = new Map<string, PendingExecutionStart>()
  private nextStartAttemptId = 0
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
  ): ExecutionStartHandle {
    const workflowKey = toWorkflowExecutionKey(workflowPathForRun)
    const previousState = this.getExecutionState(workflowKey)
    const startAttemptId = ++this.nextStartAttemptId
    this.pendingStarts.set(workflowKey, {
      startAttemptId,
      cancelled: false,
    })
    this.previousExecutionSnapshots.set(workflowKey, previousState)
    this.workflowSnapshots.set(workflowKey, structuredClone(targetWorkflow))
    this.updateExecutionForKey(workflowKey, (previous) =>
      createExecutionStartState(previous, targetWorkflow, workflowPathForRun, projectPathForRun),
    )
    return {
      workflowKey,
      startAttemptId,
    }
  }

  rollbackExecutionStart(startHandle: ExecutionStartHandle): boolean {
    const pendingStart = this.pendingStarts.get(startHandle.workflowKey)
    if (!pendingStart || pendingStart.startAttemptId !== startHandle.startAttemptId) {
      return false
    }

    this.pendingStarts.delete(startHandle.workflowKey)
    if (pendingStart.cancelled) {
      return false
    }

    const previousState = this.previousExecutionSnapshots.get(startHandle.workflowKey) ?? createEmptyWorkflowExecutionState()
    this.previousExecutionSnapshots.delete(startHandle.workflowKey)
    this.workflowSnapshots.delete(startHandle.workflowKey)
    this.updateExecutionForKey(startHandle.workflowKey, previousState)
    return true
  }

  finishStartWithRunId(
    startedRunId: string,
    startHandle: ExecutionStartHandle,
  ): FinishExecutionStartResult {
    const pendingStart = this.pendingStarts.get(startHandle.workflowKey)
    if (!pendingStart || pendingStart.startAttemptId !== startHandle.startAttemptId) {
      return {
        accepted: false,
        shouldCancelRun: true,
      }
    }

    this.pendingStarts.delete(startHandle.workflowKey)
    if (pendingStart.cancelled) {
      return {
        accepted: false,
        shouldCancelRun: true,
      }
    }

    this.runWorkflowKeys.set(startedRunId, startHandle.workflowKey)
    this.previousExecutionSnapshots.delete(startHandle.workflowKey)
    this.updateExecutionForKey(startHandle.workflowKey, (previous) => ({
      ...previous,
      runId: startedRunId,
    }))

    const bufferedEvents = this.bufferedEvents.get(startedRunId)?.events ?? []
    this.bufferedEvents.delete(startedRunId)
    for (const event of bufferedEvents) {
      this.processWorkflowEvent(event)
    }

    return {
      accepted: true,
      shouldCancelRun: false,
    }
  }

  rollbackCancellation(
    workflowKey: string,
    fallbackRunStatus: ExecutionRunStatus,
    runIdToRestore?: string | null,
  ) {
    this.updateExecutionForKey(workflowKey, (previous) => {
      if (previous.runStatus !== "cancelling") {
        return previous
      }
      if (runIdToRestore && previous.runId && previous.runId !== runIdToRestore) {
        return previous
      }
      return {
        ...previous,
        runStatus: fallbackRunStatus,
      }
    })
  }

  rehydrateActiveRun(snapshot: ActiveWorkflowRun) {
    const workflowKey = toWorkflowExecutionKey(snapshot.workflowPath)
    this.pendingStarts.delete(workflowKey)
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
      this.bufferWorkflowEvent(event)
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
      this.deps.onRunFinished?.({ workflowKey, state: transition.nextState })
      this.pendingStarts.delete(workflowKey)
      this.clearRunTracking(event.runId)
      this.previousExecutionSnapshots.delete(workflowKey)
      this.workflowSnapshots.delete(workflowKey)
      this.refreshPastRuns()
    }
  }

  cancelExecution(workflowKey: string, runIdToClear: string | null | undefined) {
    if (!runIdToClear) {
      const pendingStart = this.pendingStarts.get(workflowKey)
      if (pendingStart) {
        this.pendingStarts.set(workflowKey, {
          ...pendingStart,
          cancelled: true,
        })
      }
    }

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
      if (mappedWorkflowKey) {
        this.runWorkflowKeys.delete(runId)
      }
      return null
    }

    const [resolvedWorkflowKey] = matchingWorkflowEntry
    if (mappedWorkflowKey && mappedWorkflowKey !== resolvedWorkflowKey) {
      this.moveTrackedWorkflowKey(mappedWorkflowKey, resolvedWorkflowKey)
    }
    this.runWorkflowKeys.set(runId, resolvedWorkflowKey)
    return resolvedWorkflowKey
  }

  private bufferWorkflowEvent(event: WorkflowEvent) {
    this.pruneBufferedEvents()

    const existing = this.bufferedEvents.get(event.runId)
    const events = existing ? [...existing.events] : []
    if (events.length >= MAX_BUFFERED_EVENTS_PER_RUN) {
      events.shift()
    }
    events.push(event)
    this.bufferedEvents.set(event.runId, {
      events,
      lastUpdatedAt: Date.now(),
    })

    while (this.bufferedEvents.size > MAX_BUFFERED_RUNS) {
      const oldestRunId = this.bufferedEvents.keys().next().value
      if (!oldestRunId) break
      this.bufferedEvents.delete(oldestRunId)
    }
  }

  private pruneBufferedEvents(now = Date.now()) {
    for (const [runId, buffered] of this.bufferedEvents.entries()) {
      if (now - buffered.lastUpdatedAt > BUFFERED_EVENT_TTL_MS) {
        this.bufferedEvents.delete(runId)
      }
    }
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
