import { getRuntimeStagePresentation } from "@/lib/runtime-flow-labels"
import type { ArtifactRecord, HumanTaskSnapshot, Workflow } from "@shared/types"
import {
  deriveBlockedTaskLatestResultText,
  deriveBlockedTaskReasonText,
  deriveBlockedTaskStatusText,
} from "./workflow-blocked-copy"

export interface WorkflowBlockedResumeSummary {
  workLabel: string
  currentStepLabel: string | null
  statusText: string
  reasonText: string
  attachText: string
  latestResultText: string | null
  primaryArtifact: ArtifactRecord | null
  primaryActionLabel: string
}

function formatArtifactList(artifacts: ArtifactRecord[]) {
  if (artifacts.length === 0) return "saved results"
  if (artifacts.length === 1) return artifacts[0].title
  if (artifacts.length === 2) return `${artifacts[0].title} and ${artifacts[1].title}`
  return `${artifacts[0].title}, ${artifacts[1].title}, +${artifacts.length - 2} more`
}

function sortArtifactsByRecency(artifacts: ArtifactRecord[]) {
  return [...artifacts].sort((left, right) => right.updatedAt - left.updatedAt)
}

function deriveCurrentStepLabel(workflow: Workflow, nodeId: string) {
  const node = workflow.nodes.find((candidate) => candidate.id === nodeId)
  if (!node) return null
  return getRuntimeStagePresentation(node, { fallbackId: node.id }).title
}

export function deriveWorkflowBlockedResumeSummary({
  workflow,
  task,
  sourceArtifacts,
}: {
  workflow: Workflow
  task: HumanTaskSnapshot
  sourceArtifacts: ArtifactRecord[]
}): WorkflowBlockedResumeSummary {
  const orderedSourceArtifacts = sortArtifactsByRecency(sourceArtifacts)
  const currentStepLabel = deriveCurrentStepLabel(workflow, task.nodeId)
  const primaryArtifact = orderedSourceArtifacts[0] || null
  const workLabel = primaryArtifact?.caseLabel
    || primaryArtifact?.workflowName
    || task.workflowName
    || task.title
    || "Saved work"

  return {
    workLabel,
    currentStepLabel,
    statusText: deriveBlockedTaskStatusText(task, currentStepLabel),
    reasonText: deriveBlockedTaskReasonText({
      ...task,
      summary: task.summary || task.request.summary,
      instructions: task.instructions || task.request.instructions,
    }, currentStepLabel),
    attachText: orderedSourceArtifacts.length > 0
      ? formatArtifactList(orderedSourceArtifacts)
      : "Saved work context is already tied to this step.",
    latestResultText: deriveBlockedTaskLatestResultText(primaryArtifact),
    primaryArtifact,
    primaryActionLabel: task.kind === "approval" ? "Open approval" : "Provide input",
  }
}
