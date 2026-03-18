import type { ViewMode } from "@/lib/store"
import type { ValidationError } from "@/lib/validate-workflow"
import type { Workflow, WorkflowNode } from "@shared/types"

function inputNodeIdForWorkflow(workflow: Workflow): string | null {
  return workflow.nodes.find((node) => node.type === "input")?.id ?? null
}

export type ValidationNavigationSurface = "canvas" | "list"

function getCanvasValidationFieldId(nodeId: string, normalizedField: string): string | null {
  switch (normalizedField) {
    case "skillRef":
      return `insp-skill-ref-${nodeId}`
    case "prompt":
      return `insp-prompt-${nodeId}`
    case "outputMode":
      return `insp-output-mode-${nodeId}`
    case "maxTurns":
      return `insp-max-turns-${nodeId}`
    case "permissionMode":
      return `insp-perm-mode-${nodeId}`
    case "criteria":
      return `insp-criteria-${nodeId}`
    case "threshold":
      return `insp-threshold-${nodeId}`
    case "maxRetries":
      return `insp-max-retries-${nodeId}`
    case "retryFrom":
      return `insp-retry-from-${nodeId}`
    case "strategy":
      return `insp-split-strategy-${nodeId}`
    case "maxBranches":
      return `insp-max-branches-${nodeId}`
    case "message":
      return `insp-approval-message-${nodeId}`
    case "show_content":
      return `insp-approval-show-content-${nodeId}`
    case "allow_edit":
      return `insp-approval-allow-edit-${nodeId}`
    case "timeout_minutes":
      return `insp-approval-timeout-${nodeId}`
    case "timeout_action":
      return `insp-approval-timeout-action-${nodeId}`
    case "inputType":
      return `insp-input-type-${nodeId}`
    case "required":
      return `insp-input-required-${nodeId}`
    case "defaultValue":
      return `insp-input-default-${nodeId}`
    case "placeholder":
      return `insp-input-placeholder-${nodeId}`
    case "title":
      return `insp-output-title-${nodeId}`
    case "format":
      return `insp-output-format-${nodeId}`
    case "mode":
      return `insp-human-mode-${nodeId}`
    case "requestSource":
      return `insp-human-source-${nodeId}`
    case "staticRequest":
      return `insp-human-title-${nodeId}`
    case "allowRevisions":
      return `insp-human-revisions-${nodeId}`
    case "defaults.model":
      return `insp-workflow-model-${nodeId}`
    case "defaults.provider":
      return `insp-workflow-provider-${nodeId}`
    default:
      return null
  }
}

function getCanvasValidationFieldIdForNodeType(
  nodeId: string,
  normalizedField: string,
  nodeType: WorkflowNode["type"] | null,
): string | null {
  switch (normalizedField) {
    case "prompt":
      return nodeType === "merger" ? `insp-merge-prompt-${nodeId}` : `insp-prompt-${nodeId}`
    case "strategy":
      if (nodeType === "splitter") return `insp-split-strategy-${nodeId}`
      if (nodeType === "merger") return `insp-merger-strategy-${nodeId}`
      return null
    case "staticRequest":
      return `insp-human-title-${nodeId}`
    default:
      return getCanvasValidationFieldId(nodeId, normalizedField)
  }
}

function getListValidationFieldId(
  nodeId: string,
  normalizedField: string,
  nodeType: WorkflowNode["type"] | null,
): string | null {
  switch (normalizedField) {
    case "skillRef":
      return `skill-ref-${nodeId}`
    case "prompt":
      return nodeType === "merger" ? `merge-prompt-${nodeId}` : `prompt-${nodeId}`
    case "outputMode":
      return `skill-output-mode-${nodeId}`
    case "maxTurns":
      return `skill-max-turns-${nodeId}`
    case "criteria":
      return `criteria-${nodeId}`
    case "threshold":
      return `threshold-${nodeId}`
    case "maxRetries":
      return `max-retries-${nodeId}`
    case "strategy":
      if (nodeType === "splitter") return `split-strategy-${nodeId}`
      if (nodeType === "merger") return `merger-strategy-${nodeId}`
      return null
    case "maxBranches":
      return `max-branches-${nodeId}`
    case "message":
      return `approval-message-${nodeId}`
    case "show_content":
      return `approval-show-content-${nodeId}`
    case "allow_edit":
      return `approval-allow-edit-${nodeId}`
    case "timeout_minutes":
      return `approval-timeout-${nodeId}`
    case "timeout_action":
      return `approval-timeout-action-${nodeId}`
    case "inputType":
      return `input-type-${nodeId}`
    case "required":
      return `input-required-${nodeId}`
    case "defaultValue":
      return `input-default-${nodeId}`
    case "placeholder":
      return nodeType === "input" ? `input-placeholder-${nodeId}` : null
    case "title":
      return nodeType === "output" ? `output-title-${nodeId}` : null
    case "format":
      return `output-format-${nodeId}`
    case "mode":
      return `human-mode-${nodeId}`
    case "requestSource":
      return `human-source-${nodeId}`
    case "staticRequest":
      return `human-title-${nodeId}`
    case "allowRevisions":
      return `human-allow-revisions-${nodeId}`
    case "defaults.model":
      return `workflow-model-${nodeId}`
    case "defaults.provider":
      return `workflow-provider-${nodeId}`
    default:
      return null
  }
}

export function getValidationFieldId(
  nodeId: string,
  field: string,
  surface: ValidationNavigationSurface = "canvas",
  nodeType: WorkflowNode["type"] | null = null,
): string | null {
  const normalizedField = field.replace(/^config\./, "")

  return surface === "list"
    ? getListValidationFieldId(nodeId, normalizedField, nodeType)
    : getCanvasValidationFieldIdForNodeType(nodeId, normalizedField, nodeType)
}

export function resolveValidationNavigationTarget(
  workflow: Workflow,
  error: ValidationError,
  preferredViewMode: ViewMode = "canvas",
): { viewMode: ViewMode; nodeId: string | null; fieldId: string | null } {
  const preferredSurface: ValidationNavigationSurface = preferredViewMode === "list" ? "list" : "canvas"

  if (error.nodeId === "__workflow__") {
    const inputNodeId = inputNodeIdForWorkflow(workflow)
    const preferredFieldId = inputNodeId
      ? getValidationFieldId(inputNodeId, error.field, preferredSurface, "input")
      : null
    if (preferredViewMode === "list" && inputNodeId && preferredFieldId) {
      return {
        viewMode: "list",
        nodeId: inputNodeId,
        fieldId: preferredFieldId,
      }
    }
    return {
      viewMode: inputNodeId ? "canvas" : "settings",
      nodeId: inputNodeId,
      fieldId: inputNodeId ? getValidationFieldId(inputNodeId, error.field, "canvas", "input") : null,
    }
  }

  const node = workflow.nodes.find((candidate) => candidate.id === error.nodeId) || null
  const preferredFieldId = getValidationFieldId(error.nodeId, error.field, preferredSurface, node?.type ?? null)
  if (preferredViewMode === "list" && preferredFieldId) {
    return {
      viewMode: "list",
      nodeId: error.nodeId,
      fieldId: preferredFieldId,
    }
  }

  return {
    viewMode: "canvas",
    nodeId: error.nodeId,
    fieldId: getValidationFieldId(error.nodeId, error.field, "canvas", node?.type ?? null),
  }
}
