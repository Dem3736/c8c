import type { Workflow, DiscoveredSkill } from "@shared/types"
import { validateWorkflow } from "./graph-engine"

interface ValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
}

/**
 * Extended workflow validation with skill ref checks, reachability, and structural checks.
 */
export function validateWorkflowExtended(
  workflow: Workflow,
  availableSkills?: DiscoveredSkill[],
): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  // 1. Basic graph validation
  const basicErrors = validateWorkflow(workflow)
  errors.push(...basicErrors)

  // 2. Skill ref existence check
  if (availableSkills) {
    const skillRefs = new Set(
      availableSkills.map((s) => `${s.category}/${s.name}`),
    )
    const skillNames = new Set(availableSkills.map((s) => s.name))

    for (const node of workflow.nodes) {
      if (node.type === "skill" && node.config.skillRef) {
        const ref = node.config.skillRef
        if (!skillRefs.has(ref) && !skillNames.has(ref)) {
          warnings.push(
            `Skill "${ref}" (node "${node.id}") not found in available skills — will be auto-scaffolded`,
          )
        }
      }
    }
  }

  // 3. BFS reachability from input nodes
  const inputNodes = workflow.nodes.filter((n) => n.type === "input")
  if (inputNodes.length > 0) {
    const adjacency = new Map<string, string[]>()
    for (const edge of workflow.edges) {
      if (!adjacency.has(edge.source)) adjacency.set(edge.source, [])
      adjacency.get(edge.source)!.push(edge.target)
    }

    const reachable = new Set<string>()
    const queue = inputNodes.map((n) => n.id)
    while (queue.length > 0) {
      const current = queue.shift()!
      if (reachable.has(current)) continue
      reachable.add(current)
      const neighbors = adjacency.get(current) || []
      for (const neighbor of neighbors) {
        if (!reachable.has(neighbor)) queue.push(neighbor)
      }
    }

    for (const node of workflow.nodes) {
      if (!reachable.has(node.id) && node.type !== "input") {
        warnings.push(`Node "${node.id}" is not reachable from any input node`)
      }
    }
  }

  // 4. Evaluator consistency
  for (const node of workflow.nodes) {
    if (node.type === "evaluator") {
      const config = node.config
      if (config.retryFrom) {
        const retryTarget = workflow.nodes.find((n) => n.id === config.retryFrom)
        if (!retryTarget) {
          errors.push(
            `Evaluator "${node.id}" retryFrom references nonexistent node "${config.retryFrom}"`,
          )
        }
      }

      const outgoing = workflow.edges.filter((e) => e.source === node.id)
      const hasPass = outgoing.some((e) => e.type === "pass")
      const hasFail = outgoing.some((e) => e.type === "fail")

      if (!hasPass) {
        warnings.push(`Evaluator "${node.id}" has no "pass" edge`)
      }
      if (!hasFail && config.maxRetries > 0) {
        warnings.push(
          `Evaluator "${node.id}" has maxRetries=${config.maxRetries} but no "fail" edge`,
        )
      }
    }
  }

  // 5. Splitter/merger pairing check
  const splitters = workflow.nodes.filter((n) => n.type === "splitter")
  const mergers = workflow.nodes.filter((n) => n.type === "merger")
  if (splitters.length > 0 && mergers.length === 0) {
    warnings.push("Workflow has splitter(s) but no merger — parallel branches won't converge")
  }
  if (mergers.length > splitters.length) {
    warnings.push("More mergers than splitters — some mergers may never receive all inputs")
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  }
}
