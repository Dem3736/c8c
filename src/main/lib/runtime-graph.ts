import type {
  Workflow,
  WorkflowNode,
  WorkflowEdge,
  SplitterNodeConfig,
  EvaluatorNodeConfig,
} from "@shared/types"

export interface Subtask {
  key: string
  content: string
}

export interface RuntimeNodeMeta {
  subtaskContent: string
  subtaskKey: string
  branchIndex: number
  totalBranches: number
  splitterId: string
  templateId: string
}

export interface RuntimeWorkflow extends Workflow {
  runtimeMeta: Record<string, RuntimeNodeMeta>
}

/**
 * Collapses a previous splitter expansion, restoring the original template
 * nodes and edges from the original workflow definition.
 * Returns the set of removed clone node IDs (for state cleanup by caller).
 */
export function collapseSplitterExpansion(
  runtimeWorkflow: RuntimeWorkflow,
  originalWorkflow: Workflow,
  splitterId: string,
): Set<string> {
  const removedIds = new Set<string>()

  // Check if the splitter has been expanded (outgoing edges point to clones)
  const splitterOutEdges = runtimeWorkflow.edges.filter(
    (e) => e.source === splitterId && e.type === "default",
  )
  if (splitterOutEdges.length === 0) return removedIds
  if (!splitterOutEdges[0].target.includes("::")) return removedIds

  // BFS to find all runtime clone nodes and the merger
  let mergerId: string | undefined
  const queue = splitterOutEdges.map((e) => e.target)

  while (queue.length > 0) {
    const id = queue.shift()!
    if (removedIds.has(id) || id === mergerId) continue
    const node = runtimeWorkflow.nodes.find((n) => n.id === id)
    if (!node) continue
    if (node.type === "merger") {
      mergerId = id
      continue
    }
    removedIds.add(id)
    for (const edge of runtimeWorkflow.edges) {
      if (edge.source === id) queue.push(edge.target)
    }
  }

  if (!mergerId || removedIds.size === 0) return removedIds

  // Remove clone nodes and edges touching them
  runtimeWorkflow.nodes = runtimeWorkflow.nodes.filter((n) => !removedIds.has(n.id))
  runtimeWorkflow.edges = runtimeWorkflow.edges.filter(
    (e) => !removedIds.has(e.source) && !removedIds.has(e.target),
  )

  // Clean up runtime metadata for clones
  for (const id of removedIds) {
    delete runtimeWorkflow.runtimeMeta[id]
  }

  // Restore original template nodes from the original workflow via BFS
  const origSplitterOut = originalWorkflow.edges.filter(
    (e) => e.source === splitterId && e.type === "default",
  )
  const origTemplateIds = new Set<string>()
  const origQueue = origSplitterOut.map((e) => e.target)

  while (origQueue.length > 0) {
    const id = origQueue.shift()!
    if (origTemplateIds.has(id)) continue
    const node = originalWorkflow.nodes.find((n) => n.id === id)
    if (!node) continue
    if (node.type === "merger") continue
    origTemplateIds.add(id)
    for (const edge of originalWorkflow.edges) {
      if (edge.source === id) origQueue.push(edge.target)
    }
  }

  // Add original template nodes back
  for (const tplId of origTemplateIds) {
    const origNode = originalWorkflow.nodes.find((n) => n.id === tplId)
    if (origNode && !runtimeWorkflow.nodes.some((n) => n.id === tplId)) {
      runtimeWorkflow.nodes.push({ ...origNode })
    }
  }

  // Restore original edges (splitter→template, template→template, template→merger)
  for (const origEdge of originalWorkflow.edges) {
    if (
      (origEdge.source === splitterId && origTemplateIds.has(origEdge.target)) ||
      (origTemplateIds.has(origEdge.source) && origTemplateIds.has(origEdge.target)) ||
      (origTemplateIds.has(origEdge.source) && origEdge.target === mergerId)
    ) {
      if (!runtimeWorkflow.edges.some((e) => e.id === origEdge.id)) {
        runtimeWorkflow.edges.push({ ...origEdge })
      }
    }
  }

  return removedIds
}

export function expandSplitter(
  workflow: Workflow,
  splitterId: string,
  subtasks: Subtask[],
): RuntimeWorkflow {
  const splitterNode = workflow.nodes.find((n) => n.id === splitterId)
  if (!splitterNode || splitterNode.type !== "splitter") {
    throw new Error(`Node "${splitterId}" is not a splitter`)
  }

  const config = splitterNode.config as SplitterNodeConfig
  const maxBranches = config.maxBranches || 8

  const limitedSubtasks = subtasks.slice(0, maxBranches)

  // Find all outgoing default edges from splitter
  const splitterOutEdges = workflow.edges.filter(
    (e) => e.source === splitterId && e.type === "default",
  )
  if (splitterOutEdges.length === 0) {
    throw new Error(`Splitter "${splitterId}" has no outgoing default edge`)
  }

  // BFS to discover all template nodes between splitter and merger
  const templateIds = new Set<string>()
  let mergerId: string | undefined
  const queue = splitterOutEdges.map((e) => e.target)

  while (queue.length > 0) {
    const nodeId = queue.shift()!
    if (templateIds.has(nodeId) || nodeId === mergerId) continue
    const node = workflow.nodes.find((n) => n.id === nodeId)
    if (!node) continue
    if (node.type === "merger") {
      mergerId = nodeId
      continue
    }
    templateIds.add(nodeId)
    for (const edge of workflow.edges) {
      if (edge.source === nodeId) queue.push(edge.target)
    }
  }

  if (!mergerId) {
    throw new Error(`No merger found downstream of splitter "${splitterId}"`)
  }
  if (templateIds.size === 0) {
    throw new Error(`No template nodes found between splitter "${splitterId}" and merger`)
  }

  const resolvedTemplateIds = Array.from(templateIds).filter((tplId) =>
    workflow.nodes.some((node) => node.id === tplId),
  )
  if (resolvedTemplateIds.length === 0) {
    throw new Error(`Splitter "${splitterId}" expansion failed: no resolvable template nodes`)
  }

  // Internal edges: both endpoints in template set
  const runtimeTemplateIds = new Set(resolvedTemplateIds)
  const internalEdges = workflow.edges.filter(
    (e) => runtimeTemplateIds.has(e.source) && runtimeTemplateIds.has(e.target),
  )
  // Entry points: template nodes directly reached from splitter
  const entryIds = new Set(
    splitterOutEdges.map((e) => e.target).filter((id) => runtimeTemplateIds.has(id)),
  )
  // Exit edges: template nodes with edges to merger (preserve edge type)
  const exitEdges = workflow.edges.filter(
    (e) => runtimeTemplateIds.has(e.source) && e.target === mergerId,
  )

  // Build runtime nodes and edges
  const runtimeMeta: Record<string, RuntimeNodeMeta> = {}
  const runtimeNodes: WorkflowNode[] = []
  const runtimeEdges: WorkflowEdge[] = []

  for (let i = 0; i < limitedSubtasks.length; i++) {
    const subtask = limitedSubtasks[i]
    const suffix = `::${subtask.key}`

    // Clone all template nodes
    for (const tplId of resolvedTemplateIds) {
      const tplNode = workflow.nodes.find((n) => n.id === tplId)
      if (!tplNode) continue
      const runtimeId = tplId + suffix

      // Remap evaluator retryFrom to cloned node ID within this branch
      let clonedConfig = tplNode.config
      if (tplNode.type === "evaluator") {
        const evalConfig = tplNode.config as EvaluatorNodeConfig
        if (evalConfig.retryFrom && runtimeTemplateIds.has(evalConfig.retryFrom)) {
          clonedConfig = { ...evalConfig, retryFrom: evalConfig.retryFrom + suffix }
        }
      }

      runtimeNodes.push({
        ...tplNode,
        id: runtimeId,
        config: clonedConfig,
        position: {
          x: tplNode.position.x,
          y: tplNode.position.y + i * 100,
        },
      } as WorkflowNode)

      // Store runtimeMeta for entry-point nodes
      if (entryIds.has(tplId)) {
        runtimeMeta[runtimeId] = {
          subtaskContent: subtask.content,
          subtaskKey: subtask.key,
          branchIndex: i,
          totalBranches: limitedSubtasks.length,
          splitterId,
          templateId: tplId,
        }
      }
    }

    // Clone internal edges
    for (const edge of internalEdges) {
      runtimeEdges.push({
        ...edge,
        id: `e-${edge.source}${suffix}-${edge.target}${suffix}`,
        source: edge.source + suffix,
        target: edge.target + suffix,
      })
    }

    // Entry edges: splitter → cloned entry points
    for (const entryId of entryIds) {
      const runtimeId = entryId + suffix
      runtimeEdges.push({
        id: `e-${splitterId}-${runtimeId}`,
        source: splitterId,
        target: runtimeId,
        type: "default",
      })
    }

    // Exit edges: cloned exit points → merger (preserve original edge type)
    for (const exitEdge of exitEdges) {
      const runtimeId = exitEdge.source + suffix
      runtimeEdges.push({
        id: `e-${runtimeId}-${mergerId}`,
        source: runtimeId,
        target: mergerId,
        type: exitEdge.type,
      })
    }
  }

  // Remove all original template nodes and edges touching them
  const newNodes = workflow.nodes
    .filter((n) => !runtimeTemplateIds.has(n.id))
    .concat(runtimeNodes)

  const newEdges = workflow.edges
    .filter((e) => !runtimeTemplateIds.has(e.source) && !runtimeTemplateIds.has(e.target))
    .concat(runtimeEdges)

  return {
    ...workflow,
    nodes: newNodes,
    edges: newEdges,
    runtimeMeta,
  }
}
