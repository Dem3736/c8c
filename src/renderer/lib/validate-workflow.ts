import type { Workflow } from "@shared/types"

export interface ValidationError {
  nodeId: string
  field: string
  message: string
  severity: "error" | "warning"
}

export function validateWorkflow(workflow: Workflow): ValidationError[] {
  const errors: ValidationError[] = []

  for (const node of workflow.nodes) {
    if (node.type === "skill") {
      if (!node.config.skillRef?.trim()) {
        errors.push({
          nodeId: node.id,
          field: "skillRef",
          message: "Skill reference is required.",
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
