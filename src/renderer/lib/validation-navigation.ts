import type { ViewMode } from "@/lib/store"
import type { ValidationError } from "@/lib/validate-workflow"
import type { Workflow } from "@shared/types"

function inputNodeIdForWorkflow(workflow: Workflow): string | null {
  return workflow.nodes.find((node) => node.type === "input")?.id ?? null
}

export function getValidationFieldId(nodeId: string, field: string): string | null {
  const normalizedField = field.replace(/^config\./, "")

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
    default:
      return null
  }
}

export function resolveValidationNavigationTarget(
  workflow: Workflow,
  error: ValidationError,
): { viewMode: ViewMode; nodeId: string | null; fieldId: string | null } {
  if (error.nodeId === "__workflow__") {
    const inputNodeId = inputNodeIdForWorkflow(workflow)
    return {
      viewMode: inputNodeId ? "canvas" : "settings",
      nodeId: inputNodeId,
      fieldId: inputNodeId ? getValidationFieldId(inputNodeId, error.field) : null,
    }
  }

  return {
    viewMode: "canvas",
    nodeId: error.nodeId,
    fieldId: getValidationFieldId(error.nodeId, error.field),
  }
}
