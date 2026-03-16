import type {
  NodeState,
  Workflow,
  WorkflowNode,
  WorkflowRuntimeMeta,
} from "@shared/types"
import { getRuntimeBranchLabel, getRuntimeNodeLabel, getRuntimeStagePresentation } from "@/lib/runtime-flow-labels"

export type RunStripStatus = "idle" | "starting" | "running" | "paused" | "cancelling" | "done" | "error"
export type RunStripTone = "info" | "success" | "warning" | "danger"

export interface RunProgressSummary {
  totalSteps: number
  completedSteps: number
  runningSteps: number
  waitingApprovalSteps: number
  failedSteps: number
  phaseLabel: string
  tone: RunStripTone
  activeStepLabel: string | null
  activeStepKind: string | null
  branchLabel: string | null
}

function isStepNodeType(nodeType: string) {
  return nodeType !== "input" && nodeType !== "output"
}

function buildBranchNodeLabel(
  nodeId: string,
  workflow: Workflow,
  runtimeMeta: WorkflowRuntimeMeta,
) {
  const meta = runtimeMeta[nodeId]
  if (!meta) return nodeId
  const templateNode = workflow.nodes.find((node) => node.id === meta.templateId)
  const templateLabel = templateNode
    ? getRuntimeNodeLabel(templateNode, { fallbackId: templateNode.id })
    : meta.templateId
  return `${templateLabel} · ${getRuntimeBranchLabel(meta.subtaskKey)}`
}

function resolveNodeLabel(
  nodeId: string,
  workflow: Workflow,
  runtimeNodes: WorkflowNode[],
  runtimeMeta: WorkflowRuntimeMeta,
) {
  if (runtimeMeta[nodeId]) {
    return buildBranchNodeLabel(nodeId, workflow, runtimeMeta)
  }

  const node = runtimeNodes.find((candidate) => candidate.id === nodeId)
    || workflow.nodes.find((candidate) => candidate.id === nodeId)
  return node ? getRuntimeNodeLabel(node, { fallbackId: node.id }) : nodeId
}

function resolveNodeKind(
  nodeId: string,
  workflow: Workflow,
  runtimeNodes: WorkflowNode[],
  runtimeMeta: WorkflowRuntimeMeta,
) {
  const templateNodeId = runtimeMeta[nodeId]?.templateId || nodeId
  const node = workflow.nodes.find((candidate) => candidate.id === templateNodeId)
    || runtimeNodes.find((candidate) => candidate.id === templateNodeId)
    || workflow.nodes.find((candidate) => candidate.id === nodeId)
    || runtimeNodes.find((candidate) => candidate.id === nodeId)
  return node ? getRuntimeStagePresentation(node, { fallbackId: node.id }).kind : null
}

export function formatElapsedTime(startedAt: number | null, now = Date.now()) {
  if (!startedAt) return ""
  const delta = Math.max(0, Math.floor((now - startedAt) / 1000))
  const minutes = Math.floor(delta / 60)
  const seconds = delta % 60
  return minutes > 0
    ? `${minutes}m ${String(seconds).padStart(2, "0")}s`
    : `${seconds}s`
}

export function buildRunProgressSummary({
  workflow,
  runtimeNodes,
  runtimeMeta,
  nodeStates,
  runStatus,
  activeNodeId,
}: {
  workflow: Workflow
  runtimeNodes: WorkflowNode[]
  runtimeMeta: WorkflowRuntimeMeta
  nodeStates: Record<string, NodeState>
  runStatus: RunStripStatus
  activeNodeId: string | null
}): RunProgressSummary {
  const graphNodes = runtimeNodes.length > 0 ? runtimeNodes : workflow.nodes
  const stepNodeIds = new Set<string>()

  for (const node of graphNodes) {
    if (isStepNodeType(node.type)) {
      stepNodeIds.add(node.id)
    }
  }
  for (const nodeId of Object.keys(nodeStates)) {
    if (nodeId.includes("::")) {
      stepNodeIds.add(nodeId)
      continue
    }
    const node = graphNodes.find((candidate) => candidate.id === nodeId) || workflow.nodes.find((candidate) => candidate.id === nodeId)
    if (node && isStepNodeType(node.type)) {
      stepNodeIds.add(nodeId)
    }
  }

  const orderedStepIds = Array.from(stepNodeIds)
  const totalSteps = orderedStepIds.length
  let completedSteps = 0
  let runningSteps = 0
  let waitingApprovalSteps = 0
  let waitingHumanSteps = 0
  let failedSteps = 0

  for (const nodeId of orderedStepIds) {
    const status = nodeStates[nodeId]?.status || "pending"
    if (status === "completed" || status === "skipped") completedSteps += 1
    if (status === "running") runningSteps += 1
    if (status === "waiting_approval") waitingApprovalSteps += 1
    if (status === "waiting_human") waitingHumanSteps += 1
    if (status === "failed") failedSteps += 1
  }

  const branchNodeIds = orderedStepIds.filter((nodeId) => nodeId.includes("::"))
  const runningBranches = branchNodeIds.filter((nodeId) => nodeStates[nodeId]?.status === "running").length
  const completedBranches = branchNodeIds.filter((nodeId) => {
    const status = nodeStates[nodeId]?.status
    return status === "completed" || status === "failed" || status === "skipped"
  }).length

  const fallbackActiveNodeId = activeNodeId
    || orderedStepIds.find((nodeId) => nodeStates[nodeId]?.status === "waiting_human")
    || orderedStepIds.find((nodeId) => nodeStates[nodeId]?.status === "waiting_approval")
    || orderedStepIds.find((nodeId) => nodeStates[nodeId]?.status === "failed")
    || orderedStepIds.find((nodeId) => nodeStates[nodeId]?.status === "running")
    || null

  let phaseLabel = "Idle"
  let tone: RunStripTone = "info"

  if (runStatus === "starting") {
    phaseLabel = "Connecting"
  } else if (runStatus === "cancelling") {
    phaseLabel = "Stopping"
    tone = "warning"
  } else if (runStatus === "paused") {
    phaseLabel = "Paused"
    tone = "warning"
  } else if (runStatus === "running") {
    if (waitingHumanSteps > 0) {
      phaseLabel = "Waiting for input"
      tone = "warning"
    } else if (waitingApprovalSteps > 0) {
      phaseLabel = "Waiting for approval"
      tone = "warning"
    } else if (failedSteps > 0) {
      phaseLabel = "Needs attention"
      tone = "danger"
    } else {
      phaseLabel = "Running"
    }
  } else if (runStatus === "done") {
    phaseLabel = failedSteps > 0 ? "Finished with issues" : "Completed"
    tone = failedSteps > 0 ? "warning" : "success"
  } else if (runStatus === "error") {
    phaseLabel = "Failed"
    tone = "danger"
  }

  let branchLabel: string | null = null
  if (branchNodeIds.length > 0) {
    if (runStatus === "running" || runStatus === "starting" || runStatus === "paused" || runStatus === "cancelling") {
      branchLabel = runningBranches > 0
        ? `${runningBranches} branch${runningBranches === 1 ? "" : "es"} active`
        : `${completedBranches}/${branchNodeIds.length} branches complete`
    } else {
      branchLabel = `${completedBranches}/${branchNodeIds.length} branches complete`
    }
  }

  return {
    totalSteps,
    completedSteps,
    runningSteps,
    waitingApprovalSteps: waitingApprovalSteps + waitingHumanSteps,
    failedSteps,
    phaseLabel,
    tone,
    activeStepLabel: fallbackActiveNodeId
      ? resolveNodeLabel(fallbackActiveNodeId, workflow, runtimeNodes, runtimeMeta)
      : null,
    activeStepKind: fallbackActiveNodeId
      ? resolveNodeKind(fallbackActiveNodeId, workflow, runtimeNodes, runtimeMeta)
      : null,
    branchLabel,
  }
}
