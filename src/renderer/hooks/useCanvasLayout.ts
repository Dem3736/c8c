import { useMemo } from "react"
import { useAtom } from "jotai"
import dagre from "@dagrejs/dagre"
import {
  currentWorkflowAtom,
  validationErrorsAtom,
  canvasManualPositionsAtom,
} from "@/lib/store"
import {
  activeNodeIdAtom,
  nodeStatesAtom,
  runtimeEdgesAtom,
  runtimeMetaAtom,
  runtimeNodesAtom,
} from "@/features/execution"
import type {
  ApprovalNodeConfig,
  HumanNodeConfig,
  InputNodeConfig,
  Workflow,
  WorkflowNode,
  WorkflowEdge,
  NodeState,
  NodeStatus,
  SkillNodeConfig,
  EvaluatorNodeConfig,
  SplitterNodeConfig,
  MergerNodeConfig,
} from "@shared/types"
import { type Node, type Edge, MarkerType } from "@xyflow/react"
import { getWorkflowNodeLabel } from "@/lib/workflow-labels"
import { formatCost, formatTokens } from "@/components/output/OutputSections"
import { NODE_LABELS } from "@/lib/node-ui-config"

const NODE_WIDTH = 232
const NODE_HEIGHT = 84
const RANK_SEP = 104
const NODE_SEP = 54

function formatMergerStrategy(strategy?: string): string {
  if (!strategy) return "Concatenate"
  const normalized = strategy.replace(/_/g, " ")
  return normalized.charAt(0).toUpperCase() + normalized.slice(1)
}

export interface CanvasNodeData {
  label: string
  subtitle: string
  nodeType: string
  nodeTypeLabel: string
  status: NodeStatus | null
  isActive: boolean
  isBranch?: boolean
  isTerminal: boolean
  hasValidationErrors?: boolean
  permissionModeOverride?: "plan" | "edit"
  metricsLine?: string
  metricsDetail?: {
    tokens_in: number
    tokens_out: number
    cost_usd: number
    latency_ms: number
    model_id?: string
  }
  [key: string]: unknown
}

export interface CanvasEdgeData {
  edgeType: string
  isActive: boolean
  [key: string]: unknown
}

export function computeLayout(
  workflow: Workflow,
  nodeStates: Record<string, NodeState>,
  activeNodeId?: string | null,
  runtimeNodes?: WorkflowNode[],
  runtimeEdges?: WorkflowEdge[],
  runtimeMeta?: Record<string, { subtaskKey: string; branchIndex: number; totalBranches: number }>,
): { nodes: Node<CanvasNodeData>[]; edges: Edge<CanvasEdgeData>[] } {
  // Use runtime graph when available (expanded by splitter fan-out)
  const hasRuntimeGraph = Boolean(
    runtimeNodes && runtimeNodes.length > 0
    && runtimeEdges && runtimeEdges.length > 0,
  )
  const effectiveNodes = hasRuntimeGraph ? runtimeNodes! : workflow.nodes
  const candidateEdges = hasRuntimeGraph ? runtimeEdges! : workflow.edges

  if (!effectiveNodes?.length) {
    return { nodes: [], edges: [] }
  }

  const effectiveNodeIds = new Set(effectiveNodes.map((node) => node.id))
  // Drop edges that reference missing nodes to avoid dagre ghost nodes and layout crashes.
  const effectiveEdges = candidateEdges.filter(
    (edge) => effectiveNodeIds.has(edge.source) && effectiveNodeIds.has(edge.target),
  )

  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({ rankdir: "LR", ranksep: RANK_SEP, nodesep: NODE_SEP, marginx: 20, marginy: 20 })

  for (const node of effectiveNodes) {
    g.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT })
  }
  for (const edge of effectiveEdges) {
    g.setEdge(edge.source, edge.target)
  }

  dagre.layout(g)

  const nodes: Node<CanvasNodeData>[] = effectiveNodes.map((node) => {
    const pos = g.node(node.id)
    const x = typeof pos?.x === "number" ? pos.x : 0
    const y = typeof pos?.y === "number" ? pos.y : 0
    const state = nodeStates[node.id]
    const meta = runtimeMeta?.[node.id]
    const nodeTypeLabel = NODE_LABELS[node.type] || node.type
    const isTerminal = node.type === "input" || node.type === "output"

    let label = getWorkflowNodeLabel(node)
    let subtitle = ""

    if (meta) {
      // Runtime branch node — show subtask key
      label = "skillRef" in node.config ? (node.config as SkillNodeConfig).skillRef || label : label
      subtitle = `Branch ${meta.branchIndex + 1}/${meta.totalBranches} · ${meta.subtaskKey}`
    } else if (node.type === "skill" && "skillRef" in node.config) {
      const cfg = node.config as SkillNodeConfig
      const prompt = cfg.prompt || ""
      subtitle = prompt.length > 52 ? `${prompt.slice(0, 52)}...` : prompt
    } else if (node.type === "evaluator" && "threshold" in node.config) {
      const cfg = node.config as EvaluatorNodeConfig
      label = NODE_LABELS.evaluator
      subtitle = `Threshold ${cfg.threshold}/10 · ${cfg.maxRetries} retries`
    } else if (node.type === "splitter") {
      const cfg = node.config as SplitterNodeConfig
      label = NODE_LABELS.splitter
      subtitle = `Decompose to max ${cfg.maxBranches || 8} branches`
    } else if (node.type === "merger") {
      const cfg = node.config as MergerNodeConfig
      label = NODE_LABELS.merger
      subtitle = formatMergerStrategy(cfg.strategy)
    } else if (node.type === "approval") {
      const cfg = node.config as ApprovalNodeConfig
      label = NODE_LABELS.approval
      subtitle = cfg.message || "Manual approval gate"
    } else if (node.type === "human") {
      const cfg = node.config as HumanNodeConfig
      label = cfg.staticRequest?.title || NODE_LABELS.human
      subtitle = cfg.mode === "approval"
        ? "Human approval gate"
        : cfg.staticRequest?.instructions || "Structured human input"
    } else if (node.type === "input") {
      const cfg = node.config as InputNodeConfig
      const typeParts: string[] = []
      if (cfg.inputType && cfg.inputType !== "auto") {
        typeParts.push(cfg.inputType === "url" ? "URL" : cfg.inputType.charAt(0).toUpperCase() + cfg.inputType.slice(1))
      }
      if (cfg.required === false) typeParts.push("optional")
      if (typeParts.length > 0) {
        label = `Input (${typeParts.join(", ")})`
      }
      subtitle = cfg.placeholder || (cfg.defaultValue ? "Has default value" : "")
    }

    // Build metrics line and detail for separate rendering on canvas node
    let metricsLine: string | undefined
    let metricsDetail: CanvasNodeData["metricsDetail"] | undefined
    if (state?.metrics) {
      const m = state.metrics
      const parts: string[] = []
      const totalTokens = m.tokens_in + m.tokens_out
      if (totalTokens > 0) {
        parts.push(`${formatTokens(totalTokens)} tokens`)
      }
      if (m.cost_usd > 0) {
        parts.push(formatCost(m.cost_usd))
      }
      if (state.startedAt && state.completedAt) {
        const dur = (state.completedAt - state.startedAt) / 1000
        parts.push(`${dur.toFixed(1)}s`)
      }
      if (parts.length > 0) {
        metricsLine = parts.join(" · ")
      }
      metricsDetail = {
        tokens_in: m.tokens_in,
        tokens_out: m.tokens_out,
        cost_usd: m.cost_usd,
        latency_ms: m.latency_ms,
        model_id: state.meta?.model_id,
      }
    }

    return {
      id: node.id,
      type: node.type,
      position: {
        x: x - NODE_WIDTH / 2,
        y: y - NODE_HEIGHT / 2,
      },
      data: {
        label,
        subtitle,
        nodeType: node.type,
        nodeTypeLabel,
        status: state?.status || null,
        isActive: node.id === activeNodeId,
        isBranch: !!meta,
        isTerminal,
        permissionModeOverride: node.type === "skill"
          ? (node.config as SkillNodeConfig).permissionMode
          : undefined,
        metricsLine,
        metricsDetail,
      },
    }
  })

  const edges: Edge<CanvasEdgeData>[] = effectiveEdges.map((edge) => {
    const edgeType = edge.type === "pass" || edge.type === "fail" ? edge.type : "default"
    const sourceStatus = nodeStates[edge.source]?.status
    const targetStatus = nodeStates[edge.target]?.status
    const isActive =
      (edgeType === "pass" && (sourceStatus === "running" || targetStatus === "running"))
      || (edgeType === "fail" && (sourceStatus === "failed" || targetStatus === "failed"))

    const markerColor =
      edgeType === "pass"
        ? "hsl(var(--status-success))"
        : edgeType === "fail"
          ? "hsl(var(--status-danger))"
          : "hsl(var(--hairline))"

    return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      type: "workflow",
      data: { edgeType, isActive },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: 14,
        height: 14,
        color: markerColor,
      },
    }
  })

  return { nodes, edges }
}

export function useCanvasLayout() {
  const [workflow] = useAtom(currentWorkflowAtom)
  const [nodeStates] = useAtom(nodeStatesAtom)
  const [activeNodeId] = useAtom(activeNodeIdAtom)
  const [runtimeNodes] = useAtom(runtimeNodesAtom)
  const [runtimeEdges] = useAtom(runtimeEdgesAtom)
  const [runtimeMeta] = useAtom(runtimeMetaAtom)
  const [validationErrors] = useAtom(validationErrorsAtom)
  const [manualPositions] = useAtom(canvasManualPositionsAtom)

  const layout = useMemo(
    () => computeLayout(workflow, nodeStates, activeNodeId, runtimeNodes, runtimeEdges, runtimeMeta),
    [workflow, nodeStates, activeNodeId, runtimeNodes, runtimeEdges, runtimeMeta],
  )

  // Apply manual positions over Dagre, then inject validation flags
  const finalNodes = useMemo(() => {
    const hasManual = Object.keys(manualPositions).length > 0
    const hasValidation = Object.keys(validationErrors).length > 0
    if (!hasManual && !hasValidation) return layout.nodes
    return layout.nodes.map((node) => {
      let result = node
      const manual = manualPositions[node.id]
      if (manual) {
        result = { ...result, position: manual }
      }
      const errors = validationErrors[node.id]
      if (errors?.length) {
        result = { ...result, data: { ...result.data, hasValidationErrors: errors.some((e) => e.severity === "error") } }
      }
      return result
    })
  }, [layout.nodes, manualPositions, validationErrors])

  return { ...layout, nodes: finalNodes }
}
