import type { ProviderId, Workflow } from "@shared/types"
import {
  modelLooksCompatible,
  resolveWorkflowProvider,
} from "@shared/provider-metadata"

export interface ValidationError {
  nodeId: string
  field: string
  message: string
  severity: "error" | "warning"
}

export function validateWorkflow(workflow: Workflow, defaultProvider: ProviderId = "claude"): ValidationError[] {
  const errors: ValidationError[] = []
  const workflowProvider = resolveWorkflowProvider(workflow, defaultProvider)

  for (const node of workflow.nodes) {
    if (node.type === "skill") {
      const hasSkillRef = !!node.config.skillRef?.trim()
      const hasPrompt = !!node.config.prompt?.trim()
      if (!hasSkillRef && !hasPrompt) {
        errors.push({
          nodeId: node.id,
          field: "prompt",
          message: "Add a prompt or select a skill reference.",
          severity: "error",
        })
      }
    }

    if (node.type === "evaluator") {
      if (!node.config.criteria?.trim()) {
        errors.push({
          nodeId: node.id,
          field: "criteria",
          message: "Evaluation criteria is required.",
          severity: "error",
        })
      }
    }

    if (node.type === "splitter") {
      if (!node.config.strategy?.trim()) {
        errors.push({
          nodeId: node.id,
          field: "strategy",
          message: "Splitter strategy is required.",
          severity: "error",
        })
      }
    }
  }

  if (workflow.defaults?.model?.trim() && !modelLooksCompatible(workflowProvider, workflow.defaults.model)) {
    errors.push({
      nodeId: "__workflow__",
      field: "defaults.model",
      message: `Default model "${workflow.defaults.model}" does not match provider "${workflowProvider}".`,
      severity: "error",
    })
  }

  // Check for disconnected nodes (no incoming or outgoing edges, except input/output)
  const nodesWithIncoming = new Set(workflow.edges.map((e) => e.target))
  const nodesWithOutgoing = new Set(workflow.edges.map((e) => e.source))

  for (const node of workflow.nodes) {
    if (node.type === "input" || node.type === "output") continue
    const hasIncoming = nodesWithIncoming.has(node.id)
    const hasOutgoing = nodesWithOutgoing.has(node.id)
    if (!hasIncoming && !hasOutgoing) {
      errors.push({
        nodeId: node.id,
        field: "connections",
        message: "Node is disconnected — no incoming or outgoing edges.",
        severity: "warning",
      })
    }
  }

  // Check for duplicate edges
  const edgeKeys = new Set<string>()
  for (const edge of workflow.edges) {
    const key = `${edge.source}->${edge.target}:${edge.type}`
    if (edgeKeys.has(key)) {
      errors.push({
        nodeId: edge.source,
        field: "edges",
        message: `Duplicate edge to ${edge.target}.`,
        severity: "warning",
      })
    }
    edgeKeys.add(key)
  }

  return errors
}
