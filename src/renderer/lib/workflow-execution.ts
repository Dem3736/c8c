import type {
  ArtifactRecord,
  EvaluationResult,
  InputAttachment,
  LoadedRunResult,
  NodeState,
  RunResult,
  RunStatus,
  Workflow,
  WorkflowEdge,
  WorkflowEvent,
  WorkflowNode,
  WorkflowRuntimeMeta,
} from "@shared/types"

export type { EvalCriterion, EvaluationResult } from "@shared/types"

export type ExecutionRunStatus = "idle" | "starting" | "running" | "paused" | "cancelling" | "done" | "error"
export type ArtifactPersistenceStatus = "idle" | "saving" | "saved" | "error"

export interface WorkflowExecutionState {
  runStatus: ExecutionRunStatus
  runOutcome: RunStatus | null
  runStartedAt: number | null
  completedAt: number | null
  lastUpdatedAt: number | null
  runId: string | null
  runWorkflowPath: string | null
  workflowName: string
  projectPath: string | null
  lastError: string | null
  workflowSnapshot: Workflow | null
  nodeStates: Record<string, NodeState>
  activeNodeId: string | null
  inspectedNodeId: string | null
  evalResults: Record<string, EvaluationResult[]>
  finalContent: string
  reportPath: string | null
  workspace: string | null
  selectedPastRun: RunResult | null
  runtimeNodes: WorkflowNode[]
  runtimeEdges: WorkflowEdge[]
  runtimeMeta: WorkflowRuntimeMeta
  artifactRecords: ArtifactRecord[]
  artifactPersistenceStatus: ArtifactPersistenceStatus
  artifactPersistenceError: string | null
}

export interface ApprovalRequest {
  runId: string
  nodeId: string
  content: string
  message?: string
  allowEdit: boolean
}

export interface WorkflowExecutionEventEffects {
  approvalRequest?: ApprovalRequest
  refreshPastRuns?: boolean
  runFinished?: boolean
  runFailedMessage?: string
}

export interface WorkflowExecutionTransition {
  nextState: WorkflowExecutionState
  effects: WorkflowExecutionEventEffects
}

export interface WorkflowInputAttachmentApi {
  readFileContent: (path: string, projectPath: string) => Promise<{ content: string; truncated?: boolean }>
  loadRunResult: (workspace: string) => Promise<LoadedRunResult | null>
}

export const DRAFT_WORKFLOW_EXECUTION_KEY = "__draft__"

export function createEmptyWorkflowExecutionState(): WorkflowExecutionState {
  return {
    runStatus: "idle",
    runOutcome: null,
    runStartedAt: null,
    completedAt: null,
    lastUpdatedAt: null,
    runId: null,
    runWorkflowPath: null,
    workflowName: "",
    projectPath: null,
    lastError: null,
    workflowSnapshot: null,
    nodeStates: {},
    activeNodeId: null,
    inspectedNodeId: null,
    evalResults: {},
    finalContent: "",
    reportPath: null,
    workspace: null,
    selectedPastRun: null,
    runtimeNodes: [],
    runtimeEdges: [],
    runtimeMeta: {},
    artifactRecords: [],
    artifactPersistenceStatus: "idle",
    artifactPersistenceError: null,
  }
}

export function toWorkflowExecutionKey(workflowPath: string | null): string {
  return workflowPath?.trim() || DRAFT_WORKFLOW_EXECUTION_KEY
}

export function isRunInFlight(status: WorkflowExecutionState["runStatus"]): boolean {
  return status === "starting" || status === "running" || status === "paused" || status === "cancelling"
}

function createPendingNodeState(): NodeState {
  return { status: "pending", attempts: 0, log: [] }
}

function getNodeState(previousState: WorkflowExecutionState, nodeId: string): NodeState {
  return previousState.nodeStates[nodeId] ?? createPendingNodeState()
}

export function createExecutionStartState(
  previousState: WorkflowExecutionState,
  workflow: Workflow,
  workflowPath: string | null,
  projectPath: string | null,
  startedAt = Date.now(),
): WorkflowExecutionState {
  const nodeStates: Record<string, NodeState> = {}
  for (const node of workflow.nodes) {
    nodeStates[node.id] = createPendingNodeState()
  }

  return {
    ...previousState,
    runStatus: "starting",
    runOutcome: null,
    runStartedAt: startedAt,
    completedAt: null,
    runId: null,
    runWorkflowPath: workflowPath,
    workflowName: workflow.name?.trim() || "Untitled workflow",
    projectPath,
    lastError: null,
    workflowSnapshot: structuredClone(workflow),
    nodeStates,
    activeNodeId: null,
    inspectedNodeId: null,
    evalResults: {},
    finalContent: "",
    reportPath: null,
    runtimeNodes: [],
    runtimeEdges: [],
    runtimeMeta: {},
    artifactRecords: [],
    artifactPersistenceStatus: "idle",
    artifactPersistenceError: null,
  }
}

export function createCancelledExecutionState(
  previousState: WorkflowExecutionState,
  completedAt = Date.now(),
): WorkflowExecutionState {
  const nodeStates = { ...previousState.nodeStates }
  for (const [nodeId, nodeState] of Object.entries(nodeStates)) {
    if (nodeState.status === "running" || nodeState.status === "queued" || nodeState.status === "waiting_approval") {
      nodeStates[nodeId] = { ...nodeState, status: "skipped" }
    } else if (nodeState.status === "waiting_human") {
      nodeStates[nodeId] = { ...nodeState, status: "skipped" }
    }
  }

  return {
    ...previousState,
    runStatus: "done",
    runOutcome: "cancelled",
    runStartedAt: null,
    completedAt,
    runId: null,
    runWorkflowPath: null,
    activeNodeId: null,
    nodeStates,
  }
}

export function reduceWorkflowExecutionEvent(
  previousState: WorkflowExecutionState,
  event: WorkflowEvent,
  workflowSnapshot?: Workflow | null,
  completedAt = Date.now(),
): WorkflowExecutionTransition {
  switch (event.type) {
    case "node-start":
      return {
        nextState: {
          ...previousState,
          runStatus: previousState.runStatus === "cancelling" ? "cancelling" : "running",
          activeNodeId: event.nodeId,
          nodeStates: {
            ...previousState.nodeStates,
            [event.nodeId]: {
              ...getNodeState(previousState, event.nodeId),
              status: "running",
            },
          },
        },
        effects: {},
      }

    case "node-log":
      return {
        nextState: {
          ...previousState,
          nodeStates: {
            ...previousState.nodeStates,
            [event.nodeId]: {
              ...getNodeState(previousState, event.nodeId),
              log: [...getNodeState(previousState, event.nodeId).log, event.entry],
            },
          },
        },
        effects: {},
      }

    case "node-done": {
      const isOutputNode = workflowSnapshot?.nodes.some((node) => node.id === event.nodeId && node.type === "output") ?? false
      return {
        nextState: {
          ...previousState,
          finalContent: isOutputNode && event.output?.content ? event.output.content : previousState.finalContent,
          nodeStates: {
            ...previousState.nodeStates,
            [event.nodeId]: {
              ...getNodeState(previousState, event.nodeId),
              status: "completed",
              output: event.output,
            },
          },
        },
        effects: {},
      }
    }

    case "node-error":
      if (event.nodeId === "__global") {
        return {
          nextState: {
            ...previousState,
            runStatus: "error",
            activeNodeId: null,
            lastError: event.error || "Workflow execution failed.",
          },
          effects: {
            runFailedMessage: event.error || "Workflow execution failed.",
          },
        }
      }

      return {
        nextState: {
          ...previousState,
          lastError: event.error || previousState.lastError,
          nodeStates: {
            ...previousState.nodeStates,
            [event.nodeId]: {
              ...getNodeState(previousState, event.nodeId),
              status: "failed",
              error: event.error,
            },
          },
        },
        effects: {},
      }

    case "eval-result":
      return {
        nextState: {
          ...previousState,
          evalResults: {
            ...previousState.evalResults,
            [event.nodeId]: [
              ...(previousState.evalResults[event.nodeId] || []),
              {
                attempt: event.attempt,
                score: event.score,
                reason: event.reason,
                passed: event.passed,
                fix_instructions: event.fix_instructions,
                criteria: event.criteria,
              },
            ],
          },
        },
        effects: {},
      }

    case "nodes-expanded": {
      const graphNodeIds = new Set(event.nodes.map((node) => node.id))
      const nodeStates = { ...previousState.nodeStates }

      for (const nodeId of Object.keys(nodeStates)) {
        if (!graphNodeIds.has(nodeId)) {
          delete nodeStates[nodeId]
        }
      }

      for (const nodeId of event.newNodeIds) {
        if (!nodeStates[nodeId]) {
          nodeStates[nodeId] = createPendingNodeState()
        }
      }

      return {
        nextState: {
          ...previousState,
          nodeStates,
          runtimeNodes: event.nodes,
          runtimeEdges: event.edges,
          runtimeMeta: event.runtimeMeta,
        },
        effects: {},
      }
    }

    case "approval-requested":
      return {
        nextState: {
          ...previousState,
          nodeStates: {
            ...previousState.nodeStates,
            [event.nodeId]: {
              ...getNodeState(previousState, event.nodeId),
              status: "waiting_approval",
            },
          },
        },
        effects: {
          approvalRequest: {
            runId: event.runId,
            nodeId: event.nodeId,
            content: event.content,
            message: event.message,
            allowEdit: event.allowEdit,
          },
        },
      }

    case "human-task-created":
      return {
        nextState: {
          ...previousState,
          nodeStates: {
            ...previousState.nodeStates,
            [event.nodeId]: {
              ...getNodeState(previousState, event.nodeId),
              status: "waiting_human",
              humanTask: {
                taskId: event.taskId,
                status: "open",
              },
            },
          },
        },
        effects: {},
      }

    case "human-task-resolved":
      return {
        nextState: {
          ...previousState,
          nodeStates: {
            ...previousState.nodeStates,
            [event.nodeId]: {
              ...getNodeState(previousState, event.nodeId),
              humanTask: {
                taskId: event.taskId,
                status: event.resolution === "submitted" ? "answered" : event.resolution,
              },
            },
          },
        },
        effects: {},
      }

    case "run-done":
      return {
        nextState: {
          ...previousState,
          runStatus: event.status === "completed" || event.status === "cancelled" || event.status === "blocked" ? "done" : "error",
          runOutcome: event.status,
          runStartedAt: null,
          completedAt,
          runId: null,
          runWorkflowPath: null,
          activeNodeId: null,
          reportPath: event.reportPath || previousState.reportPath,
          workspace: event.workspace || previousState.workspace,
        },
        effects: {
          refreshPastRuns: true,
          runFinished: true,
        },
      }
  }
}

export async function assembleInputWithAttachments(
  baseValue: string,
  attachments: InputAttachment[],
  selectedProject: string | null,
  api: WorkflowInputAttachmentApi,
): Promise<string> {
  if (attachments.length === 0) return baseValue

  const sections = await Promise.all(
    attachments.map(async (attachment) => {
      if (attachment.kind === "file") {
        if (!selectedProject) {
          return `## Attached File: ${attachment.name}\n\n[Cannot read file: no project selected]`
        }
        try {
          const result = await api.readFileContent(attachment.path, selectedProject)
          return `## Attached File: ${attachment.name}\nPath: ${attachment.path}\n\`\`\`\n${result.content}${result.truncated ? "\n[truncated]" : ""}\n\`\`\``
        } catch {
          return `## Attached File: ${attachment.name}\n\n[Could not read file]`
        }
      }

      if (attachment.kind === "run") {
        try {
          const result = await api.loadRunResult(attachment.workspace)
          return `## Previous Run Output: ${attachment.workflowName}\nRun workspace: ${attachment.workspace}\n\n${result?.reportContent || "[No output available]"}`
        } catch {
          return `## Previous Run Output: ${attachment.workflowName}\n\n[Could not load run output]`
        }
      }

      return `## ${attachment.label}\n\n${attachment.content}`
    }),
  )

  return [baseValue, "\n---\n# Attachments\n", ...sections].join("\n\n")
}
