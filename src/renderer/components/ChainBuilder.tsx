import { Fragment, useEffect, useMemo, useRef, useState } from "react"
import { useAtom } from "jotai"
import { cn } from "@/lib/cn"
import { useWorkflowWithUndo } from "@/hooks/useWorkflowWithUndo"
import {
  selectedNodeIdAtom,
  skillPickerOpenAtom,
  type WorkflowNode,
  type DiscoveredSkill,
} from "@/lib/store"
import { activeNodeIdAtom, inspectedNodeIdAtom, nodeStatesAtom, runtimeMetaAtom } from "@/features/execution"
import type {
  ApprovalNodeConfig,
  EvaluatorNodeConfig,
  HumanNodeConfig,
  InputNodeConfig,
  PersistedRunSnapshot,
  SplitterNodeConfig,
  MergerNodeConfig,
  OutputNodeConfig,
  SkillNodeConfig,
  NodeState,
  WorkflowRuntimeMeta,
} from "@shared/types"
import { NodeCard, type RuntimeBranchSummary } from "./NodeCard"
import { SkillPicker } from "./SkillPicker"
import { Plus, BarChart3, GitFork, ArrowDown as ArrowDownIcon, ArrowRight as ArrowRightIcon, Hand } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { getRuntimeBranchDetail, getRuntimeBranchLabel } from "@/lib/runtime-flow-labels"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { CursorMenu } from "@/components/ui/cursor-menu"
import {
  CanvasDialogBody,
  CanvasDialogContent,
  CanvasDialogFooter,
  CanvasDialogHeader,
  Dialog,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from "@/components/ui/dialog"
import { toast } from "sonner"
import { cloneWorkflow } from "@/lib/workflow-graph-utils"
import {
  addApprovalNodeToWorkflow,
  addEvaluatorNodeToWorkflow,
  addFanOutPatternToWorkflow,
  addHumanNodeToWorkflow,
  addSkillNodeToWorkflow,
  isLinearChainReorderSafe,
  moveMiddleNodeBeforeTarget,
  moveMiddleNodeByDirection,
  removeNodeAndRewireWorkflow,
} from "@/lib/workflow-mutations"

interface ChainBuilderProps {
  compact?: boolean
  mode?: "edit" | "outline" | "monitor"
  onStageSelect?: (payload: { nodeId: string; preferredTab: "nodes" | "log" | "result" }) => void
  reviewSnapshot?: PersistedRunSnapshot | null
}

const STATUS_PRIORITY: Record<string, number> = {
  waiting_approval: 0,
  waiting_human: 0,
  failed: 1,
  running: 2,
  queued: 3,
  pending: 4,
  completed: 5,
  skipped: 6,
}

function buildRuntimeBranchSummary(
  branchIds: string[],
  nodeStates: Record<string, NodeState>,
  runtimeMeta: WorkflowRuntimeMeta,
): RuntimeBranchSummary | null {
  if (branchIds.length === 0) return null

  let running = 0
  let completed = 0
  let failed = 0
  let waitingApproval = 0
  let pending = 0

  for (const branchId of branchIds) {
    const status = nodeStates[branchId]?.status || "pending"
    if (status === "running") running += 1
    else if (status === "waiting_approval" || status === "waiting_human") waitingApproval += 1
    else if (status === "failed") failed += 1
    else if (status === "completed" || status === "skipped") completed += 1
    else pending += 1
  }

  const previews = branchIds
    .map((branchId) => ({
      id: branchId,
      label: runtimeMeta[branchId]?.subtaskKey
        ? getRuntimeBranchLabel(runtimeMeta[branchId].subtaskKey)
        : branchId.split("::").pop() || branchId,
      detail: getRuntimeBranchDetail(runtimeMeta[branchId]),
      status: nodeStates[branchId]?.status || "pending",
    }))
    .sort((left, right) => {
      const priorityDelta = (STATUS_PRIORITY[left.status] ?? 99) - (STATUS_PRIORITY[right.status] ?? 99)
      if (priorityDelta !== 0) return priorityDelta
      return left.label.localeCompare(right.label)
    })
    .slice(0, 4)

  return {
    total: branchIds.length,
    running,
    completed,
    failed,
    waitingApproval,
    pending,
    previews,
  }
}

function buildAggregateBranchState(
  branchIds: string[],
  summary: RuntimeBranchSummary,
  nodeStates: Record<string, NodeState>,
): NodeState {
  const status = summary.waitingApproval > 0
    ? "waiting_human"
    : summary.failed > 0
      ? "failed"
      : summary.running > 0
        ? "running"
        : summary.completed === summary.total && summary.total > 0
          ? "completed"
          : summary.completed > 0
            ? "running"
            : summary.pending > 0
              ? "pending"
              : "pending"

  let totalTokensIn = 0
  let totalTokensOut = 0
  let totalCostUsd = 0
  let totalLatencyMs = 0
  let sawMetrics = false
  let startedAt: number | undefined
  let completedAt: number | undefined
  let error: string | undefined

  for (const branchId of branchIds) {
    const state = nodeStates[branchId]
    if (!state) continue
    if (!error && state.error) {
      error = state.error
    }
    if (typeof state.startedAt === "number") {
      startedAt = typeof startedAt === "number" ? Math.min(startedAt, state.startedAt) : state.startedAt
    }
    if (typeof state.completedAt === "number") {
      completedAt = typeof completedAt === "number" ? Math.max(completedAt, state.completedAt) : state.completedAt
    }
    if (state.metrics) {
      sawMetrics = true
      totalTokensIn += state.metrics.tokens_in || 0
      totalTokensOut += state.metrics.tokens_out || 0
      totalCostUsd += state.metrics.cost_usd || 0
      totalLatencyMs += state.metrics.latency_ms || 0
    }
  }

  return {
    status,
    attempts: 0,
    error,
    log: [],
    startedAt,
    completedAt,
    metrics: sawMetrics
      ? {
        tokens_in: totalTokensIn,
        tokens_out: totalTokensOut,
        cost_usd: totalCostUsd,
        latency_ms: totalLatencyMs,
      }
      : undefined,
  }
}

export function ChainBuilder({
  compact = false,
  mode = "edit",
  onStageSelect,
  reviewSnapshot = null,
}: ChainBuilderProps = {}) {
  const { workflow, setWorkflow, setWorkflowDirect } = useWorkflowWithUndo()
  const [nodeStates] = useAtom(nodeStatesAtom)
  const [activeNodeId] = useAtom(activeNodeIdAtom)
  const [runtimeMeta] = useAtom(runtimeMetaAtom)
  const [builderSelectedNodeId, setBuilderSelectedNodeId] = useAtom(selectedNodeIdAtom)
  const [inspectedNodeId, setInspectedNodeId] = useAtom(inspectedNodeIdAtom)
  const [, setPickerOpen] = useAtom(skillPickerOpenAtom)
  const [pendingRemoveId, setPendingRemoveId] = useState<string | null>(null)
  const isReorderSafe = isLinearChainReorderSafe(workflow)
  const [draggedNodeId, setDraggedNodeId] = useState<string | null>(null)
  const [dragOverNodeId, setDragOverNodeId] = useState<string | null>(null)
  const undoToastIdRef = useRef<string | number | null>(null)
  const stepRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const [chainContextMenu, setChainContextMenu] = useState<{
    x: number
    y: number
    nodeId: string
  } | null>(null)
  const flowCardMode = mode === "outline" || mode === "monitor"
  const runtimeMode = mode === "monitor"
  const displayNodeStates = reviewSnapshot?.nodeStates ?? nodeStates
  const displayRuntimeMeta = reviewSnapshot?.runtimeMeta ?? runtimeMeta

  useEffect(() => {
    return () => {
      if (undoToastIdRef.current != null) {
        toast.dismiss(undoToastIdRef.current)
      }
    }
  }, [])

  // Order nodes: input first, then middle nodes in array order, then output last
  const orderedNodes = useMemo(() => {
    const inputNodes = workflow.nodes.filter((n) => n.type === "input")
    const outputNodes = workflow.nodes.filter((n) => n.type === "output")
    const middleNodes = workflow.nodes.filter(
      (n) => n.type !== "input" && n.type !== "output",
    )
    return [...inputNodes, ...middleNodes, ...outputNodes]
  }, [workflow.nodes])
  const hasSkillNodes = workflow.nodes.some((n) => n.type === "skill")
  const runtimeBranchIds = useMemo(() => Object.keys(displayRuntimeMeta || {}), [displayRuntimeMeta])
  const runtimeBranchSummariesByTemplate = useMemo(() => {
    const branchIdsByTemplate = new Map<string, string[]>()
    for (const [branchId, meta] of Object.entries(displayRuntimeMeta || {})) {
      if (!meta?.templateId) continue
      const existing = branchIdsByTemplate.get(meta.templateId)
      if (existing) {
        existing.push(branchId)
      } else {
        branchIdsByTemplate.set(meta.templateId, [branchId])
      }
    }

    const summaries = new Map<string, RuntimeBranchSummary>()
    for (const [templateId, branchIds] of branchIdsByTemplate.entries()) {
      const summary = buildRuntimeBranchSummary(branchIds, displayNodeStates, displayRuntimeMeta || {})
      if (summary) summaries.set(templateId, summary)
    }
    return summaries
  }, [displayNodeStates, displayRuntimeMeta])
  const aggregateBranchStatesByTemplate = useMemo(() => {
    const aggregateStates = new Map<string, NodeState>()
    for (const [templateId, summary] of runtimeBranchSummariesByTemplate.entries()) {
      const branchIds = Object.entries(displayRuntimeMeta || {})
        .filter(([, meta]) => meta.templateId === templateId)
        .map(([branchId]) => branchId)
      if (branchIds.length === 0) continue
      aggregateStates.set(templateId, buildAggregateBranchState(branchIds, summary, displayNodeStates))
    }
    return aggregateStates
  }, [displayNodeStates, displayRuntimeMeta, runtimeBranchSummariesByTemplate])
  const singleSplitterBranchSummary = useMemo(() => {
    const splitterCount = workflow.nodes.filter((node) => node.type === "splitter").length
    if (splitterCount !== 1) return null
    return buildRuntimeBranchSummary(runtimeBranchIds, displayNodeStates, displayRuntimeMeta || {})
  }, [displayNodeStates, displayRuntimeMeta, runtimeBranchIds, workflow.nodes])
  const resolvedActiveNodeId = activeNodeId && displayRuntimeMeta[activeNodeId]?.templateId
    ? displayRuntimeMeta[activeNodeId].templateId
    : activeNodeId
  const selectedNodeId = flowCardMode ? inspectedNodeId : builderSelectedNodeId
  const resolvedSelectedNodeId = selectedNodeId && displayRuntimeMeta[selectedNodeId]?.templateId
    ? displayRuntimeMeta[selectedNodeId].templateId
    : selectedNodeId
  const contextNode = chainContextMenu
    ? workflow.nodes.find((node) => node.id === chainContextMenu.nodeId) || null
    : null

  const setSelectedNode = (nodeId: string) => {
    if (flowCardMode) {
      setInspectedNodeId(nodeId)
      return
    }
    setBuilderSelectedNodeId(nodeId)
  }

  const getNodePresentation = (node: WorkflowNode) => {
    const directState = displayNodeStates[node.id]
    const aggregateState = aggregateBranchStatesByTemplate.get(node.id)
    const effectiveState = flowCardMode
      ? aggregateState && (!directState || directState.status === "pending" || directState.status === "queued")
        ? aggregateState
        : directState
      : directState
    const runtimeBranchSummary = flowCardMode
      ? node.type === "splitter"
        ? singleSplitterBranchSummary
        : runtimeBranchSummariesByTemplate.get(node.id) ?? null
      : null

    return { effectiveState, runtimeBranchSummary }
  }

  const orderedMonitorStages = useMemo(() => {
    if (!runtimeMode) return []
    return orderedNodes.map((node) => {
      const presentation = getNodePresentation(node)
      return {
        node,
        status: presentation.effectiveState?.status || "pending",
      }
    })
  }, [orderedNodes, runtimeMode, aggregateBranchStatesByTemplate, displayNodeStates, runtimeBranchSummariesByTemplate, singleSplitterBranchSummary])

  const monitorCurrentStage = useMemo(() => {
    if (!runtimeMode) return null
    return orderedMonitorStages.find((entry) =>
      entry.status === "running"
      || entry.status === "waiting_approval"
      || entry.status === "waiting_human"
      || entry.status === "failed",
    ) || null
  }, [orderedMonitorStages, runtimeMode])

  const monitorNextStage = useMemo(() => {
    if (!runtimeMode) return null
    return orderedMonitorStages.find((entry) =>
      entry.status === "queued" || entry.status === "pending",
    ) || null
  }, [orderedMonitorStages, runtimeMode])

  const monitorLatestCompletedStage = useMemo(() => {
    if (!runtimeMode) return null
    return [...orderedMonitorStages].reverse().find((entry) =>
      entry.status === "completed" || entry.status === "skipped",
    ) || null
  }, [orderedMonitorStages, runtimeMode])

  const monitorFocusNodeId = useMemo(() => {
    if (!runtimeMode) return null
    return monitorCurrentStage?.node.id
      || monitorNextStage?.node.id
      || monitorLatestCompletedStage?.node.id
      || null
  }, [monitorCurrentStage, monitorLatestCompletedStage, monitorNextStage, runtimeMode])

  const monitorCounts = useMemo(() => {
    if (!runtimeMode) {
      return { completed: 0, pending: 0, blocked: 0 }
    }
    return {
      completed: orderedMonitorStages.filter((entry) => entry.status === "completed" || entry.status === "skipped").length,
      pending: orderedMonitorStages.filter((entry) => entry.status === "pending" || entry.status === "queued").length,
      blocked: orderedMonitorStages.filter((entry) =>
        entry.status === "failed" || entry.status === "waiting_approval" || entry.status === "waiting_human",
      ).length,
    }
  }, [orderedMonitorStages, runtimeMode])

  useEffect(() => {
    if (!runtimeMode || !monitorFocusNodeId) return
    const step = stepRefs.current[monitorFocusNodeId]
    step?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" })
  }, [monitorFocusNodeId, runtimeMode])

  useEffect(() => {
    if (!runtimeMode || !monitorFocusNodeId) return

    const selectedMonitorStatus = orderedMonitorStages.find((entry) => entry.node.id === resolvedSelectedNodeId)?.status || null
    const shouldResyncSelection = !resolvedSelectedNodeId
      || (
        monitorCurrentStage !== null
        && resolvedSelectedNodeId !== monitorCurrentStage.node.id
        && (selectedMonitorStatus === "pending" || selectedMonitorStatus === "queued")
      )

    if (shouldResyncSelection) {
      setInspectedNodeId(monitorFocusNodeId)
    }
  }, [monitorCurrentStage, monitorFocusNodeId, orderedMonitorStages, resolvedSelectedNodeId, runtimeMode, setInspectedNodeId])

  const getNodeDisplayLabel = (nodeId: string) => {
    const node = workflow.nodes.find((n) => n.id === nodeId)
    if (!node) return nodeId
    if (node.type === "skill") {
      return node.config.skillRef || "Skill"
    }
    if (node.type === "evaluator") return "Evaluator"
    if (node.type === "splitter") return "Split work"
    if (node.type === "merger") return "Merger"
    if (node.type === "approval") return "Approval"
    if (node.type === "human") return "Human"
    if (node.type === "input") return "Input"
    if (node.type === "output") return "Output"
    return nodeId
  }

  const getAddedNodes = (previous: typeof workflow, next: typeof workflow) => {
    const previousIds = new Set(previous.nodes.map((node) => node.id))
    return next.nodes.filter((node) => !previousIds.has(node.id))
  }

  const selectFirstNewNode = (previous: typeof workflow, next: typeof workflow) => {
    return getAddedNodes(previous, next)[0]?.id ?? null
  }

  const confirmRemove = (nodeId: string) => {
    const node = workflow.nodes.find((n) => n.id === nodeId)
    if (!node || node.type === "input" || node.type === "output") return
    setPendingRemoveId(nodeId)
  }

  const executeRemove = () => {
    if (!pendingRemoveId) return
    const nodeId = pendingRemoveId
    setPendingRemoveId(null)

    const previousWorkflow = cloneWorkflow(workflow)

    setWorkflow((prev) => removeNodeAndRewireWorkflow(prev, nodeId))

    if (undoToastIdRef.current != null) {
      toast.dismiss(undoToastIdRef.current)
    }

    undoToastIdRef.current = toast.success("Node removed", {
      duration: Infinity,
      action: {
        label: "Undo",
        onClick: () => setWorkflowDirect(previousWorkflow),
      },
    })
  }

  const moveNode = (nodeId: string, direction: "up" | "down") => {
    if (!isReorderSafe) {
      toast.warning("Reordering is unavailable once the workflow branches. Use Canvas to restructure branching flows.", {
        duration: 8000,
      })
      return
    }
    setWorkflow((prev) => moveMiddleNodeByDirection(prev, nodeId, direction))
  }

  const updateNodeConfig = (
    nodeId: string,
    config: InputNodeConfig | OutputNodeConfig | SkillNodeConfig | EvaluatorNodeConfig | SplitterNodeConfig | MergerNodeConfig | ApprovalNodeConfig | HumanNodeConfig,
  ) => {
    setWorkflow((prev) => ({
      ...prev,
      nodes: prev.nodes.map((n) => (n.id === nodeId ? { ...n, config } as typeof n : n)),
    }), { coalesceKey: `node-config:${nodeId}` })
  }

  const addNode = (skill: DiscoveredSkill) => {
    let nextSelectedId: string | null = null
    setWorkflow((prev) => {
      const next = addSkillNodeToWorkflow(prev, skill)
      nextSelectedId = selectFirstNewNode(prev, next)
      return next
    })
    if (nextSelectedId) {
      setSelectedNode(nextSelectedId)
    }
  }

  const addEvaluator = () => {
    let nextSelectedId: string | null = null
    setWorkflow((prev) => {
      const next = addEvaluatorNodeToWorkflow(prev)
      nextSelectedId = selectFirstNewNode(prev, next)
      return next
    })
    if (nextSelectedId) {
      setSelectedNode(nextSelectedId)
    }
  }

  const addFanOut = () => {
    let nextSelectedId: string | null = null
    setWorkflow((prev) => {
      const next = addFanOutPatternToWorkflow(prev)
      const addedNodes = getAddedNodes(prev, next)
      nextSelectedId = addedNodes.find((node) => node.type === "skill")?.id ?? addedNodes[0]?.id ?? null
      return next
    })
    if (nextSelectedId) {
      setSelectedNode(nextSelectedId)
    }
    toast.info("Created split -> branch -> merge", {
      description: "Configure the branch skill to define the parallel work.",
    })
  }

  const addApproval = () => {
    let nextSelectedId: string | null = null
    setWorkflow((prev) => {
      const next = addApprovalNodeToWorkflow(prev)
      nextSelectedId = selectFirstNewNode(prev, next)
      return next
    })
    if (nextSelectedId) {
      setSelectedNode(nextSelectedId)
    }
  }

  const addHuman = () => {
    let nextSelectedId: string | null = null
    setWorkflow((prev) => {
      const next = addHumanNodeToWorkflow(prev)
      nextSelectedId = selectFirstNewNode(prev, next)
      return next
    })
    if (nextSelectedId) {
      setSelectedNode(nextSelectedId)
    }
  }

  const handleInsertBlock = (value: string) => {
    if (value === "evaluator") {
      addEvaluator()
      return
    }
    if (value === "fanout") {
      addFanOut()
      return
    }
    if (value === "approval") {
      addApproval()
      return
    }
    if (value === "human") {
      addHuman()
    }
  }

  const handleDragStart = (node: WorkflowNode, event: React.DragEvent<HTMLDivElement>) => {
    if (flowCardMode) return
    if (node.type === "input" || node.type === "output") return
    if (!isReorderSafe) {
      event.preventDefault()
      toast.warning("Drag reordering is unavailable once the workflow branches. Use Canvas to restructure branching flows.", {
        duration: 8000,
      })
      return
    }
    setDraggedNodeId(node.id)
    event.dataTransfer.effectAllowed = "move"
    event.dataTransfer.setData("text/plain", node.id)
  }

  const handleDragOver = (node: WorkflowNode, event: React.DragEvent<HTMLDivElement>) => {
    if (!draggedNodeId) return
    if (node.type === "input" || node.type === "output" || draggedNodeId === node.id) {
      if (dragOverNodeId) {
        setDragOverNodeId(null)
      }
      return
    }
    event.preventDefault()
    event.dataTransfer.dropEffect = "move"
    setDragOverNodeId(node.id)
  }

  const handleDragLeave = (nodeId: string, event: React.DragEvent<HTMLDivElement>) => {
    if (dragOverNodeId !== nodeId) return
    const nextTarget = event.relatedTarget as Node | null
    if (nextTarget && event.currentTarget.contains(nextTarget)) return
    setDragOverNodeId(null)
  }

  const handleDrop = (node: WorkflowNode, event: React.DragEvent<HTMLDivElement>) => {
    if (flowCardMode) return
    if (!draggedNodeId) return
    if (node.type === "input" || node.type === "output") return
    if (!isReorderSafe) {
      event.preventDefault()
      toast.warning("Drag reordering is unavailable once the workflow branches. Use Canvas to restructure branching flows.", {
        duration: 8000,
      })
      clearDragState()
      return
    }
    event.preventDefault()
    setWorkflow((prev) => moveMiddleNodeBeforeTarget(prev, draggedNodeId, node.id))
    setDragOverNodeId(null)
    setDraggedNodeId(null)
  }

  const clearDragState = () => {
    setDraggedNodeId(null)
    setDragOverNodeId(null)
  }

  const renderNodeStep = (node: WorkflowNode, i: number) => {
    const { effectiveState, runtimeBranchSummary } = getNodePresentation(node)
    const preferredTab: "nodes" | "log" | "result" = typeof effectiveState?.output?.content === "string" && effectiveState.output.content.trim().length > 0
      ? "result"
      : effectiveState?.status === "running" || effectiveState?.status === "waiting_approval" || effectiveState?.status === "waiting_human" || effectiveState?.status === "failed"
        ? "log"
        : "nodes"

    return (
      <div
        key={node.id}
        ref={(element) => {
          stepRefs.current[node.id] = element
        }}
        draggable={!flowCardMode && node.type !== "input" && node.type !== "output" && isReorderSafe}
        onDragStart={(event) => handleDragStart(node, event)}
        onDragEnd={clearDragState}
        onDragOver={(event) => handleDragOver(node, event)}
        onDragLeave={(event) => handleDragLeave(node.id, event)}
        onDrop={(event) => handleDrop(node, event)}
        onContextMenu={(event) => {
          if (flowCardMode) return
          event.preventDefault()
          event.stopPropagation()
          setSelectedNode(node.id)
          setChainContextMenu({
            x: event.clientX,
            y: event.clientY,
            nodeId: node.id,
          })
        }}
        className={cn(
          "rounded-lg ui-transition-colors ui-motion-fast",
          flowCardMode
            ? "w-[13.75rem] shrink-0 snap-start md:w-[14.5rem] xl:w-[15rem]"
            : "w-full",
          dragOverNodeId === node.id && "ring-2 ring-primary/50 ring-offset-2 ring-offset-surface-1",
        )}
      >
        {!flowCardMode && i > 0 && (
          <div className={cn("flex flex-col items-center", compact ? "py-0.5" : "py-1")}>
            <div className="flex flex-col items-center">
              <div className={cn("w-px bg-border", compact ? "h-1.5" : "h-3")} />
              <ArrowDownIcon size={compact ? 8 : 10} className="text-muted-foreground/50 -mt-0.5" />
            </div>
            {!compact && node.type === "evaluator" && (
              <span className="ui-meta-text text-status-warning font-mono">
                retry loop
              </span>
            )}
          </div>
        )}
        {!flowCardMode && !compact && node.type !== "input" && node.type !== "output" && isReorderSafe && (
          <div className="px-1 pb-1 ui-meta-text text-muted-foreground/70">
            Drag to reorder
          </div>
        )}
        <NodeCard
          node={node}
          index={i}
          total={orderedNodes.length}
          state={effectiveState}
          isActive={resolvedActiveNodeId === node.id}
          isSelected={resolvedSelectedNodeId === node.id}
          onRemove={() => confirmRemove(node.id)}
          onMoveUp={isReorderSafe ? () => moveNode(node.id, "up") : undefined}
          onMoveDown={isReorderSafe ? () => moveNode(node.id, "down") : undefined}
          onConfigChange={(config) => updateNodeConfig(node.id, config)}
          onSelect={() => {
            setSelectedNode(node.id)
            onStageSelect?.({ nodeId: node.id, preferredTab })
          }}
          resolveNodeLabel={getNodeDisplayLabel}
          compact={compact}
          runtimeMode={flowCardMode}
          runtimeFocusKind={monitorCurrentStage?.node.id === node.id ? "current" : monitorNextStage?.node.id === node.id ? "next" : null}
          runtimeBranchSummary={runtimeBranchSummary}
        />
      </div>
    )
  }

  return (
    <section
      aria-label={flowCardMode ? "Flow preview" : "Pipeline builder"}
      className={cn(
        "ui-fade-slide-in surface-panel",
        flowCardMode
          ? "rounded-xl p-3.5 space-y-3 md:p-4"
          : compact
            ? "rounded-lg p-2.5 space-y-2"
            : "rounded-lg p-4 space-y-3",
      )}
    >
      {flowCardMode ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-0.5">
            <h2 className="section-kicker">{runtimeMode ? "Flow" : "Preview"}</h2>
            <p className="ui-meta-text text-muted-foreground">
              {runtimeMode
                ? reviewSnapshot
                  ? "Review the saved run stage by stage. Select any stage to inspect its activity."
                  : "Current and next stages are called out below. Select any stage to inspect its activity."
                : reviewSnapshot
                  ? "Review the selected saved run from left to right."
                  : "Review the stages from left to right before you run or refine the flow."}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            {runtimeMode && monitorCurrentStage && (
              <span
                className={cn(
                  "ui-status-badge ui-meta-text shrink-0",
                  "border-hairline bg-surface-2 text-foreground",
                  monitorCurrentStage.status === "running" && "ui-status-badge-info",
                  (monitorCurrentStage.status === "waiting_approval" || monitorCurrentStage.status === "waiting_human") && "ui-status-badge-warning",
                  monitorCurrentStage.status === "failed" && "ui-status-badge-danger",
                )}
              >
                {monitorCurrentStage.status === "running"
                  ? `Current: ${getNodeDisplayLabel(monitorCurrentStage.node.id)}`
                  : monitorCurrentStage.status === "failed"
                    ? `Needs attention: ${getNodeDisplayLabel(monitorCurrentStage.node.id)}`
                    : `Blocked at: ${getNodeDisplayLabel(monitorCurrentStage.node.id)}`}
              </span>
            )}
            {runtimeMode && monitorNextStage && (
              <Badge variant="outline" className="ui-meta-text px-2 py-0 border-primary/25 bg-primary/5 text-foreground">
                Next: {getNodeDisplayLabel(monitorNextStage.node.id)}
              </Badge>
            )}
            {runtimeMode && (
              <Badge variant="outline" className="ui-meta-text px-2 py-0 text-muted-foreground">
                {monitorCounts.completed}/{orderedMonitorStages.length} done
              </Badge>
            )}
            {runtimeMode && monitorCounts.pending > 0 && (
              <Badge variant="outline" className="ui-meta-text px-2 py-0 text-muted-foreground">
                {monitorCounts.pending} pending
              </Badge>
            )}
            <span className="ui-meta-text tabular-nums text-muted-foreground">{orderedNodes.length} stages</span>
          </div>
        </div>
      ) : (
        <h2 className="section-kicker">Pipeline Builder</h2>
      )}

      <div className="space-y-0">
        {!flowCardMode && !workflow.nodes.some((n) => n.type !== "input" && n.type !== "output") && (
          <div
            className={cn(
              "rounded-lg border border-hairline bg-surface-2/90 px-3 ui-meta-text",
              compact ? "mb-2 py-1.5" : "mb-3 py-2",
            )}
          >
            Build your chain by adding a Skill first. Evaluator checks output quality, and Split work creates parallel branches.
          </div>
        )}
        {flowCardMode ? (
          <div className="overflow-x-auto pb-2 ui-scrollbar-hidden">
            <div className="flex min-w-max snap-x snap-mandatory items-stretch gap-2 pr-4">
              {orderedNodes.map((node, i) => (
                <Fragment key={node.id}>
                  {renderNodeStep(node, i)}
                  {i < orderedNodes.length - 1 && (
                    <div className="flex shrink-0 items-center justify-center gap-1 px-0.5">
                      <div className="h-px w-3 bg-border/70" />
                      <ArrowRightIcon size={12} className="text-muted-foreground/45" />
                      <div className="h-px w-3 bg-border/70" />
                    </div>
                  )}
                </Fragment>
              ))}
            </div>
          </div>
        ) : (
          orderedNodes.map((node, i) => renderNodeStep(node, i))
        )}

        {!flowCardMode && (
          <div className={cn("flex items-center gap-2 rounded-lg control-cluster p-1", compact ? "pt-1" : "pt-2")}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  className="flex-1 border-dashed bg-surface-1/80"
                  onClick={() => setPickerOpen(true)}
                >
                  <Plus size={16} />
                  Add Skill
                </Button>
              </TooltipTrigger>
              <TooltipContent>Add a processing step between Input and Output</TooltipContent>
            </Tooltip>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className={cn("justify-start bg-surface-1/80", compact ? "w-[170px]" : "w-[196px]")}
                >
                  <GitFork size={14} />
                  Add step
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Add workflow step</DropdownMenuLabel>
                <DropdownMenuItem
                  disabled={!hasSkillNodes}
                  onSelect={() => handleInsertBlock("evaluator")}
                  className="items-start gap-2 py-2"
                  title={!hasSkillNodes ? "Add at least one skill node before inserting an evaluator." : undefined}
                >
                  <BarChart3 size={13} className="mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-body-sm font-medium text-foreground">Add Evaluator</div>
                    <div className="ui-meta-text text-muted-foreground">
                      {hasSkillNodes
                        ? "Check the previous output and branch or retry when it misses the mark."
                        : "Requires at least one skill node before it can evaluate anything."}
                    </div>
                  </div>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => handleInsertBlock("fanout")}
                  className="items-start gap-2 py-2"
                >
                  <GitFork size={13} className="mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-body-sm font-medium text-foreground">Add Split Work</div>
                    <div className="ui-meta-text text-muted-foreground">
                      Add a split, branch, and merge scaffold for parallel work.
                    </div>
                  </div>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => handleInsertBlock("human")}
                  className="items-start gap-2 py-2"
                >
                  <Hand size={13} className="mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-body-sm font-medium text-foreground">Add Human Input</div>
                    <div className="ui-meta-text text-muted-foreground">
                      Pause the flow until someone provides the missing information.
                    </div>
                  </div>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => handleInsertBlock("approval")}
                  className="items-start gap-2 py-2"
                >
                  <Hand size={13} className="mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-body-sm font-medium text-foreground">Add Approval Gate</div>
                    <div className="ui-meta-text text-muted-foreground">
                      Stop after a stage so you can review it before the flow continues.
                    </div>
                  </div>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>

      <CursorMenu
        open={!runtimeMode && chainContextMenu !== null}
        x={chainContextMenu?.x || 0}
        y={chainContextMenu?.y || 0}
        onOpenChange={(open) => {
          if (!open) setChainContextMenu(null)
        }}
      >
        {contextNode && (
          <>
            <DropdownMenuLabel>{getNodeDisplayLabel(contextNode.id)}</DropdownMenuLabel>
            <DropdownMenuItem
              onSelect={() => {
                setSelectedNode(contextNode.id)
                setChainContextMenu(null)
              }}
            >
              Select node
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              disabled={contextNode.type === "input" || contextNode.type === "output"}
              onSelect={() => {
                if (contextNode.type === "input" || contextNode.type === "output") return
                moveNode(contextNode.id, "up")
                setChainContextMenu(null)
              }}
            >
              Move up
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={contextNode.type === "input" || contextNode.type === "output"}
              onSelect={() => {
                if (contextNode.type === "input" || contextNode.type === "output") return
                moveNode(contextNode.id, "down")
                setChainContextMenu(null)
              }}
            >
              Move down
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={contextNode.type === "input" || contextNode.type === "output"}
              onSelect={() => {
                if (contextNode.type === "input" || contextNode.type === "output") return
                confirmRemove(contextNode.id)
                setChainContextMenu(null)
              }}
            >
              Remove node
            </DropdownMenuItem>
          </>
        )}
      </CursorMenu>

      <SkillPicker onAddSkill={addNode} />

      <Dialog open={!runtimeMode && pendingRemoveId !== null} onOpenChange={(open) => !open && setPendingRemoveId(null)}>
        <CanvasDialogContent showCloseButton={false}>
          <CanvasDialogHeader>
            <DialogTitle>Remove node?</DialogTitle>
            <DialogDescription>This will remove the node and its connections from the workflow.</DialogDescription>
          </CanvasDialogHeader>
          <CanvasDialogBody>
            <p className="text-body-md text-muted-foreground">
              Remove &ldquo;{pendingRemoveId ? getNodeDisplayLabel(pendingRemoveId) : ""}&rdquo; from the chain?
            </p>
          </CanvasDialogBody>
          <CanvasDialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button variant="destructive" onClick={executeRemove}>
              Remove
            </Button>
          </CanvasDialogFooter>
        </CanvasDialogContent>
      </Dialog>
    </section>
  )
}
