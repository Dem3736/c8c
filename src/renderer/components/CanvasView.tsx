import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react"
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  type Connection,
  type FinalConnectionState,
  type NodeTypes,
  type EdgeTypes,
  type OnConnectStartParams,
  type ReactFlowInstance,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import { useCanvasLayout } from "@/hooks/useCanvasLayout"
import { useWorkflowWithUndo } from "@/hooks/useWorkflowWithUndo"
import { CanvasNode } from "./canvas/CanvasNode"
import { WorkflowEdge } from "./canvas/WorkflowEdge"
import { useAtom, useAtomValue } from "jotai"
import { skillPickerOpenAtom, selectedNodeIdAtom, selectedWorkflowPathAtom, canvasManualPositionsAtom } from "@/lib/store"
import {
  Dialog,
  CanvasDialogContent,
  CanvasDialogHeader,
  CanvasDialogFooter,
} from "@/components/ui/dialog"
import { DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { runStatusAtom } from "@/features/execution"
import { SkillPicker } from "./SkillPicker"
import type { DiscoveredSkill } from "@/lib/store"
import { toast } from "sonner"
import { Plus, BarChart3, GitFork, LocateFixed, AlignHorizontalDistributeCenter, Hand, PauseCircle, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
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
  addApprovalNodeToWorkflow,
  addEdgeToWorkflow,
  addEvaluatorNodeToWorkflow,
  addFanOutPatternToWorkflow,
  addHumanNodeToWorkflow,
  addSkillNodeToWorkflow,
  removeEdgeFromWorkflow,
  removeNodeAndRewireWorkflow,
} from "@/lib/workflow-mutations"
import { cloneWorkflow } from "@/lib/workflow-graph-utils"
import { MOTION_BASE_MS, MOTION_SLOW_MS } from "@/lib/tokens"
import { getWorkflowNodeLabel } from "@/lib/workflow-labels"
import type { NodePosition, Workflow, WorkflowNode } from "@shared/types"

const nodeTypes: NodeTypes = {
  input: CanvasNode,
  output: CanvasNode,
  skill: CanvasNode,
  evaluator: CanvasNode,
  splitter: CanvasNode,
  merger: CanvasNode,
  approval: CanvasNode,
  human: CanvasNode,
}

const edgeTypes: EdgeTypes = {
  workflow: WorkflowEdge,
}

const CONNECTION_LINE_STYLE = { stroke: "hsl(var(--hairline))", strokeWidth: 1.5, strokeDasharray: "6 4" }
const PRO_OPTIONS = { hideAttribution: true }
const READ_ONLY_EDITOR_REASON = "This workflow is read-only."
const RUNNING_EDITOR_REASON = "Cannot edit the workflow while a run is in progress."
const PROTECTED_STEP_REASON = "Input and output steps cannot be removed."
const SELF_CONNECTION_REASON = "Cannot connect a step to itself."

interface CanvasViewProps {
  readOnly?: boolean
  onAddSkill?: (skill: DiscoveredSkill) => void
  surfaceBanner?: ReactNode
}

function areStringArraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false
  }
  return true
}

function getAddedNodes(prev: Workflow, next: Workflow): WorkflowNode[] {
  const previousIds = new Set(prev.nodes.map((node) => node.id))
  return next.nodes.filter((node) => !previousIds.has(node.id))
}

function applyInsertedNodePlacement(
  workflow: Workflow,
  addedNodes: WorkflowNode[],
  position: NodePosition | null,
): Workflow {
  if (!position || addedNodes.length === 0) return workflow

  const nextCanvasLayout = { ...(workflow.canvasLayout ?? {}) }
  const splitterNode = addedNodes.find((node) => node.type === "splitter")
  const skillNode = addedNodes.find((node) => node.type === "skill")
  const mergerNode = addedNodes.find((node) => node.type === "merger")

  if (splitterNode && skillNode && mergerNode) {
    nextCanvasLayout[splitterNode.id] = { x: position.x, y: position.y }
    nextCanvasLayout[skillNode.id] = { x: position.x + 280, y: position.y }
    nextCanvasLayout[mergerNode.id] = { x: position.x + 560, y: position.y }
  } else {
    addedNodes.forEach((node, index) => {
      nextCanvasLayout[node.id] = {
        x: position.x + (index * 220),
        y: position.y + (index * 36),
      }
    })
  }

  return {
    ...workflow,
    canvasLayout: nextCanvasLayout,
  }
}

export function CanvasView({ readOnly = false, onAddSkill, surfaceBanner = null }: CanvasViewProps = {}) {
  const { nodes, edges } = useCanvasLayout()
  const [, setPickerOpen] = useAtom(skillPickerOpenAtom)
  const [runStatus] = useAtom(runStatusAtom)
  const isRunning =
    runStatus === "running"
    || runStatus === "paused"
    || runStatus === "starting"
    || runStatus === "cancelling"
  const [selectedNodeId, setSelectedNodeId] = useAtom(selectedNodeIdAtom)
  const [selectedWorkflowPath] = useAtom(selectedWorkflowPathAtom)
  const { workflow, setWorkflow, setWorkflowDirect } = useWorkflowWithUndo()
  const manualPositions = useAtomValue(canvasManualPositionsAtom)
  const [confirmLayoutReset, setConfirmLayoutReset] = useState(false)
  const hasManualPositions = Object.keys(manualPositions).length > 0
  const [reactFlow, setReactFlow] = useState<ReactFlowInstance | null>(null)
  const [hasUserNavigatedCanvas, setHasUserNavigatedCanvas] = useState(false)
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null)
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([])
  const [pendingInsertPosition, setPendingInsertPosition] = useState<NodePosition | null>(null)
  const [connectionStart, setConnectionStart] = useState<OnConnectStartParams | null>(null)
  const [canvasContextMenu, setCanvasContextMenu] = useState<{
    x: number
    y: number
    scope: "pane" | "node"
    nodeId?: string
  } | null>(null)

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: { id: string }) => {
      setSelectedNodeId(node.id)
      setSelectedEdgeId(null)
    },
    [setSelectedNodeId],
  )

  const onEdgeClick = useCallback(
    (_: React.MouseEvent, edge: { id: string }) => {
      setSelectedNodeId(null)
      setSelectedEdgeId(edge.id)
    },
    [setSelectedNodeId],
  )

  const addNode = useCallback(
    (skill: DiscoveredSkill) => {
      if (readOnly || isRunning) return
      const insertionPosition = pendingInsertPosition
      setPendingInsertPosition(null)
      if (onAddSkill) {
        onAddSkill(skill)
        return
      }
      let nextSelectedId: string | null = null
      setWorkflow((prev) => {
        const next = addSkillNodeToWorkflow(prev, skill)
        const addedNodes = getAddedNodes(prev, next)
        nextSelectedId = addedNodes[0]?.id ?? null
        return applyInsertedNodePlacement(next, addedNodes, insertionPosition)
      })
      if (nextSelectedId) {
        setSelectedNodeId(nextSelectedId)
      }
    },
    [isRunning, onAddSkill, pendingInsertPosition, readOnly, setSelectedNodeId, setWorkflow],
  )

  const addEvaluator = useCallback((position: NodePosition | null = null) => {
    if (readOnly || isRunning) return
    let nextSelectedId: string | null = null
    setWorkflow((prev) => {
      const next = addEvaluatorNodeToWorkflow(prev)
      const addedNodes = getAddedNodes(prev, next)
      nextSelectedId = addedNodes[0]?.id ?? null
      return applyInsertedNodePlacement(next, addedNodes, position)
    })
    if (nextSelectedId) {
      setSelectedNodeId(nextSelectedId)
    }
  }, [isRunning, readOnly, setSelectedNodeId, setWorkflow])

  const addFanOut = useCallback((position: NodePosition | null = null) => {
    if (readOnly || isRunning) return
    let nextSelectedId: string | null = null
    setWorkflow((prev) => {
      const next = addFanOutPatternToWorkflow(prev)
      const addedNodes = getAddedNodes(prev, next)
      nextSelectedId = addedNodes.find((node) => node.type === "skill")?.id ?? addedNodes[0]?.id ?? null
      return applyInsertedNodePlacement(next, addedNodes, position)
    })
    if (nextSelectedId) {
      setSelectedNodeId(nextSelectedId)
    }
    toast.info("Created split -> branch -> merge", {
      description: "Configure the branch skill to define the parallel work.",
    })
  }, [isRunning, readOnly, setSelectedNodeId, setWorkflow])

  const addApproval = useCallback((position: NodePosition | null = null) => {
    if (readOnly || isRunning) return
    let nextSelectedId: string | null = null
    setWorkflow((prev) => {
      const next = addApprovalNodeToWorkflow(prev)
      const addedNodes = getAddedNodes(prev, next)
      nextSelectedId = addedNodes[0]?.id ?? null
      return applyInsertedNodePlacement(next, addedNodes, position)
    })
    if (nextSelectedId) {
      setSelectedNodeId(nextSelectedId)
    }
  }, [isRunning, readOnly, setSelectedNodeId, setWorkflow])

  const addHuman = useCallback((position: NodePosition | null = null) => {
    if (readOnly || isRunning) return
    let nextSelectedId: string | null = null
    setWorkflow((prev) => {
      const next = addHumanNodeToWorkflow(prev)
      const addedNodes = getAddedNodes(prev, next)
      nextSelectedId = addedNodes[0]?.id ?? null
      return applyInsertedNodePlacement(next, addedNodes, position)
    })
    if (nextSelectedId) {
      setSelectedNodeId(nextSelectedId)
    }
  }, [isRunning, readOnly, setSelectedNodeId, setWorkflow])

  const hasSkillNodes = useMemo(
    () => nodes.some((node) => node.type === "skill"),
    [nodes],
  )
  const structureKey = useMemo(
    () => `${nodes.length}:${edges.length}`,
    [nodes.length, edges.length],
  )

  useEffect(() => {
    setHasUserNavigatedCanvas(false)
    setSelectedNodeId(null)
    setSelectedEdgeId(null)
  }, [selectedWorkflowPath, setSelectedNodeId])

  useEffect(() => {
    if (!selectedEdgeId) return
    if (edges.some((edge) => edge.id === selectedEdgeId)) return
    setSelectedEdgeId(null)
  }, [edges, selectedEdgeId])

  useEffect(() => {
    if (!reactFlow || nodes.length === 0 || hasUserNavigatedCanvas) return
    const id = window.setTimeout(() => {
      void reactFlow.fitView({ padding: 0.3, duration: MOTION_BASE_MS })
    }, 0)
    return () => window.clearTimeout(id)
  }, [reactFlow, structureKey, nodes.length, hasUserNavigatedCanvas])

  const recenterCanvas = () => {
    if (!reactFlow || nodes.length === 0) return
    setHasUserNavigatedCanvas(false)
    void reactFlow.fitView({ padding: 0.3, duration: MOTION_BASE_MS })
  }

  const selectedTemplateNode = selectedNodeId
    ? workflow.nodes.find((node) => node.id === selectedNodeId) || null
    : null
  const canDeleteSelectedNode = Boolean(
    selectedTemplateNode
      && selectedTemplateNode.type !== "input"
      && selectedTemplateNode.type !== "output"
      && !readOnly
      && !isRunning,
  )
  const canDeleteSelectedEdge = Boolean(selectedEdgeId && !readOnly && !isRunning)
  const canDeleteSelection = canDeleteSelectedNode || canDeleteSelectedEdge
  const selectedSummaryLabel = selectedNodeIds.length > 1
    ? `${selectedNodeIds.length} steps selected`
    : selectedTemplateNode
      ? getWorkflowNodeLabel(selectedTemplateNode)
      : selectedEdgeId
        ? "Connection selected"
        : null
  const contextNode = canvasContextMenu?.scope === "node" && canvasContextMenu.nodeId
    ? workflow.nodes.find((node) => node.id === canvasContextMenu.nodeId) || null
    : null
  const canDeleteContextNode = Boolean(
    contextNode
    && contextNode.type !== "input"
    && contextNode.type !== "output"
    && !readOnly
    && !isRunning,
  )

  const removeNodeWithUndo = useCallback((nodeId: string) => {
    if (readOnly || isRunning) return
    const previousWorkflow = cloneWorkflow(workflow)
    setWorkflow((prev) => removeNodeAndRewireWorkflow(prev, nodeId))
    if (selectedNodeId === nodeId) {
      setSelectedNodeId(null)
    }
    toast.success("Step removed", {
      duration: Infinity,
      action: {
        label: "Undo",
        onClick: () => setWorkflowDirect(previousWorkflow),
      },
    })
  }, [isRunning, readOnly, selectedNodeId, setSelectedNodeId, setWorkflow, setWorkflowDirect, workflow])

  const removeSelectedNode = useCallback(() => {
    if (!selectedNodeId || readOnly || isRunning) return
    removeNodeWithUndo(selectedNodeId)
  }, [isRunning, readOnly, removeNodeWithUndo, selectedNodeId])

  const removeSelectedEdge = useCallback(() => {
    if (!selectedEdgeId || readOnly || isRunning) return
    const previousWorkflow = cloneWorkflow(workflow)
    setWorkflow((prev) => removeEdgeFromWorkflow(prev, selectedEdgeId))
    setSelectedEdgeId(null)
    toast.success("Edge removed", {
      duration: Infinity,
      action: {
        label: "Undo",
        onClick: () => setWorkflowDirect(previousWorkflow),
      },
    })
  }, [isRunning, readOnly, selectedEdgeId, setWorkflow, setWorkflowDirect, workflow])

  const removeSelection = useCallback(() => {
    // Multi-select delete
    const deletableIds = selectedNodeIds.filter((id) => {
      const node = workflow.nodes.find((n) => n.id === id)
      return node && node.type !== "input" && node.type !== "output"
    })
    if (deletableIds.length > 1 && !readOnly && !isRunning) {
      const previousWorkflow = cloneWorkflow(workflow)
      setWorkflow((prev) => {
        let result = prev
        for (const nodeId of deletableIds) {
          result = removeNodeAndRewireWorkflow(result, nodeId)
        }
        return result
      })
      setSelectedNodeId(null)
      setSelectedNodeIds([])
      toast.success(`${deletableIds.length} steps removed`, {
        duration: Infinity,
        action: {
          label: "Undo",
          onClick: () => setWorkflowDirect(previousWorkflow),
        },
      })
      return
    }
    if (canDeleteSelectedEdge) {
      removeSelectedEdge()
      return
    }
    if (canDeleteSelectedNode) {
      removeSelectedNode()
    }
  }, [canDeleteSelectedEdge, canDeleteSelectedNode, isRunning, readOnly, removeSelectedEdge, removeSelectedNode, selectedNodeIds, setSelectedNodeId, setWorkflow, setWorkflowDirect, workflow])

  const removeNodeById = useCallback((nodeId: string) => {
    if (readOnly || isRunning) return
    removeNodeWithUndo(nodeId)
  }, [isRunning, readOnly, removeNodeWithUndo])

  const handleSelectionChange = useCallback(
    ({ nodes: selectedNodes, edges: selectedEdges }: { nodes: Array<{ id: string }>; edges: Array<{ id: string }> }) => {
      const nextNodeIds = selectedNodes.map((node) => node.id)
      setSelectedNodeIds((prev) => (areStringArraysEqual(prev, nextNodeIds) ? prev : nextNodeIds))

      const nextSelectedNodeId = selectedNodes[0]?.id ?? null
      const nextSelectedEdgeId = nextSelectedNodeId ? null : selectedEdges[0]?.id ?? null

      setSelectedNodeId((prev) => (prev === nextSelectedNodeId ? prev : nextSelectedNodeId))
      setSelectedEdgeId((prev) => (prev === nextSelectedEdgeId ? prev : nextSelectedEdgeId))
    },
    [setSelectedNodeId],
  )

  const isValidConnection = useCallback(
    (connection: Connection | { source: string | null; target: string | null; sourceHandle?: string | null; targetHandle?: string | null }) =>
      Boolean(connection.source && connection.target && connection.source !== connection.target),
    [],
  )

  const onConnect = useCallback(
    (connection: Connection) => {
      if (readOnly || isRunning) return
      if (!connection.source || !connection.target) return
      // Detect edge type from evaluator pass/fail handles
      const edgeType = connection.sourceHandle === "pass" ? "pass" as const
        : connection.sourceHandle === "fail" ? "fail" as const
        : "default" as const
      setWorkflow((prev) => {
        const result = addEdgeToWorkflow(prev, connection.source!, connection.target!, edgeType)
        if (result.error) {
          toast.warning(result.error, { duration: 8000 })
        }
        return result.workflow
      })
    },
    [isRunning, readOnly, setWorkflow],
  )

  const onConnectStart = useCallback((_: MouseEvent | TouchEvent, params: OnConnectStartParams) => {
    setConnectionStart(params)
  }, [])

  const onConnectEnd = useCallback((_: MouseEvent | TouchEvent, connectionState: FinalConnectionState) => {
    if (
      connectionStart?.nodeId
      && connectionState.isValid === false
      && connectionState.toNode?.id === connectionStart.nodeId
    ) {
      toast.warning(SELF_CONNECTION_REASON, { duration: 8000 })
    }
    setConnectionStart(null)
  }, [connectionStart])

  const addStepDisabledReason = readOnly
    ? READ_ONLY_EDITOR_REASON
    : isRunning
      ? RUNNING_EDITOR_REASON
      : null
  const deleteSelectionDisabledReason = canDeleteSelection
    ? null
    : selectedTemplateNode && (selectedTemplateNode.type === "input" || selectedTemplateNode.type === "output")
      ? PROTECTED_STEP_REASON
      : "Select a step or connection to delete."
  const deleteContextNodeDisabledReason = !contextNode
    ? null
    : readOnly
      ? READ_ONLY_EDITOR_REASON
      : isRunning
        ? RUNNING_EDITOR_REASON
        : contextNode.type === "input" || contextNode.type === "output"
          ? PROTECTED_STEP_REASON
          : null

  useEffect(() => {
    if (readOnly || isRunning) return
    const handler = (event: KeyboardEvent) => {
      if (event.key !== "Delete" && event.key !== "Backspace") return

      const target = event.target as HTMLElement | null
      const tag = target?.tagName
      const isEditable = Boolean(
        target?.isContentEditable ||
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        target?.closest("[contenteditable=true]"),
      )
      if (isEditable) return
      if (!canDeleteSelection) return

      event.preventDefault()
      removeSelection()
    }

    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [canDeleteSelection, isRunning, readOnly, removeSelection])

  const handleInsertBlock = (value: string) => {
    const insertionPosition = canvasContextMenu && reactFlow
      ? reactFlow.screenToFlowPosition({ x: canvasContextMenu.x, y: canvasContextMenu.y })
      : null
    if (value === "evaluator") {
      addEvaluator(insertionPosition)
      return
    }
    if (value === "fanout") {
      addFanOut(insertionPosition)
      return
    }
    if (value === "approval") {
      addApproval(insertionPosition)
      return
    }
    if (value === "human") {
      addHuman(insertionPosition)
    }
  }

  return (
    <div className="relative w-full h-full min-h-[400px]">
      <ReactFlow
        className="workflow-canvas"
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodeClick={onNodeClick}
        onNodeContextMenu={(event, node) => {
          event.preventDefault()
          setSelectedNodeId(node.id)
          setSelectedEdgeId(null)
          setCanvasContextMenu({
            x: event.clientX,
            y: event.clientY,
            scope: "node",
            nodeId: node.id,
          })
        }}
        onEdgeClick={onEdgeClick}
        onPaneContextMenu={(event) => {
          event.preventDefault()
          setCanvasContextMenu({
            x: event.clientX,
            y: event.clientY,
            scope: "pane",
          })
        }}
        onPaneClick={() => {
          setSelectedNodeId(null)
          setSelectedEdgeId(null)
        }}
        selectionOnDrag
        onSelectionChange={handleSelectionChange}
        onConnect={onConnect}
        onConnectStart={onConnectStart}
        onConnectEnd={onConnectEnd}
        isValidConnection={isValidConnection}
        connectionRadius={12}
        connectionLineStyle={CONNECTION_LINE_STYLE}
        onMoveStart={() => setHasUserNavigatedCanvas(true)}
        onInit={setReactFlow}
        nodesDraggable={!readOnly && !isRunning}
        onNodeDragStop={(_event, node) => {
          setWorkflow((prev) => ({
            ...prev,
            canvasLayout: { ...(prev.canvasLayout ?? {}), [node.id]: node.position },
          }))
        }}
        nodesConnectable={!readOnly && !isRunning}
        elementsSelectable={!readOnly}
        onNodeDoubleClick={(_: React.MouseEvent, node: { id: string }) => {
          setSelectedNodeId(node.id)
        }}
        zoomOnDoubleClick={false}
        minZoom={0.45}
        maxZoom={1.65}
        proOptions={PRO_OPTIONS}
        snapToGrid
        snapGrid={[19, 19]}
      >
        <Background variant={BackgroundVariant.Dots} gap={19} size={1.1} color="hsl(var(--hairline))" />
        <MiniMap
          pannable
          zoomable
          className="canvas-minimap"
          nodeStrokeColor="hsl(var(--hairline))"
          nodeColor="hsl(var(--surface-2))"
          maskColor="hsl(var(--background) / 0.58)"
        />
        <Controls
          showInteractive={false}
          className="canvas-controls [&>button]:ui-motion-fast"
        />
      </ReactFlow>

      {(runStatus === "paused" || surfaceBanner) && (
        <div className="pointer-events-none absolute inset-x-0 top-4 z-10 flex flex-col items-center gap-2">
          {runStatus === "paused" && (
            <div className="inline-flex items-center gap-2 rounded-lg surface-soft px-3 py-2 text-body-sm text-foreground backdrop-blur">
              <PauseCircle size={15} className="text-status-warning" />
              Paused — current node will finish before the workflow stops.
            </div>
          )}
          {surfaceBanner}
        </div>
      )}

      {/* Floating add controls */}
      <div className="absolute top-3 right-3 z-10 flex items-center gap-2 rounded-lg control-cluster p-1">
        <Button
          variant="outline"
          size="sm"
          aria-label="Add skill step"
          disabled={readOnly || isRunning}
          title={addStepDisabledReason || undefined}
          onClick={() => {
            setPendingInsertPosition(null)
            setPickerOpen(true)
          }}
        >
          <Plus size={14} />
          Add skill step
        </Button>

        <Button
          variant="ghost"
          size="icon"
          aria-label="Auto-layout"
          onClick={() => {
            if (hasManualPositions) {
              setConfirmLayoutReset(true)
            } else {
              setTimeout(() => reactFlow?.fitView({ duration: MOTION_SLOW_MS }), 50)
            }
          }}
          className="relative text-muted-foreground hover:text-foreground"
          title="Reset to auto-layout"
        >
          <AlignHorizontalDistributeCenter size={14} />
          {hasManualPositions && (
            <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-status-info/70" />
          )}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Recenter canvas"
          onClick={recenterCanvas}
          className="text-muted-foreground hover:text-foreground"
        >
          <LocateFixed size={14} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Delete selected step or connection"
          onClick={removeSelection}
          disabled={!canDeleteSelection}
          className="text-muted-foreground enabled:hover:text-status-danger"
          title={
            canDeleteSelection
              ? "Delete selected step or connection"
              : deleteSelectionDisabledReason || undefined
          }
        >
          <Trash2 size={14} />
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="w-48 justify-between bg-surface-1/90"
              disabled={readOnly || isRunning}
              title={addStepDisabledReason || undefined}
            >
              <span className="inline-flex min-w-0 flex-1 items-center gap-2">
                <GitFork size={14} />
                <span className="truncate">Add step</span>
              </span>
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
                <div className="ui-body-text-medium text-foreground">Add Evaluator</div>
                <div className="ui-meta-text text-muted-foreground">
                  {hasSkillNodes
                    ? "Check the previous output and branch or retry when it misses the mark."
                    : "Requires at least one skill node before it can evaluate anything."}
                </div>
              </div>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => handleInsertBlock("fanout")}
              className="items-start gap-2 py-2"
            >
              <GitFork size={13} className="mt-0.5 shrink-0" />
              <div className="min-w-0">
                <div className="ui-body-text-medium text-foreground">Add Split Work</div>
                <div className="ui-meta-text text-muted-foreground">
                  Add a split, branch, and merge scaffold for parallel work.
                </div>
              </div>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => handleInsertBlock("human")}
              className="items-start gap-2 py-2"
            >
              <Hand size={13} className="mt-0.5 shrink-0" />
              <div className="min-w-0">
                <div className="ui-body-text-medium text-foreground">Add Human Input</div>
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
                <div className="ui-body-text-medium text-foreground">Add Approval Gate</div>
                <div className="ui-meta-text text-muted-foreground">
                  Stop after a stage so you can review it before the flow continues.
                </div>
              </div>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Layout reset confirmation dialog */}
      <Dialog open={confirmLayoutReset} onOpenChange={setConfirmLayoutReset}>
        <CanvasDialogContent size="sm" showCloseButton={false}>
          <CanvasDialogHeader>
            <DialogTitle>Reset to auto-layout?</DialogTitle>
            <DialogDescription>
              This will clear manually-placed positions for{" "}
              {Object.keys(manualPositions).length} node{Object.keys(manualPositions).length === 1 ? "" : "s"}.
            </DialogDescription>
          </CanvasDialogHeader>
          <CanvasDialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setConfirmLayoutReset(false)}>
              Cancel
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={() => {
                setConfirmLayoutReset(false)
                setWorkflow((prev) => {
                  const { canvasLayout: _, ...rest } = prev
                  return rest as typeof prev
                })
                setTimeout(() => reactFlow?.fitView({ duration: MOTION_SLOW_MS }), 50)
                toast.success("Layout reset to auto-layout")
              }}
            >
              Reset Layout
            </Button>
          </CanvasDialogFooter>
        </CanvasDialogContent>
      </Dialog>

      {selectedSummaryLabel && (
        <div className="absolute left-3 top-3 z-10 flex items-center gap-2 rounded-lg surface-soft px-3 py-2 backdrop-blur ui-fade-slide-in">
          <div className="min-w-0">
            <p className="section-kicker text-muted-foreground">Selected</p>
            <p className="ui-body-text-medium max-w-60 truncate text-foreground" title={selectedSummaryLabel}>
              {selectedSummaryLabel}
            </p>
          </div>

          {canDeleteSelection && (
            <Button
              variant="ghost"
              size="sm"
              onClick={removeSelection}
              className="gap-1.5 text-muted-foreground hover:text-status-danger"
              title="Delete selected step or connection"
            >
              <Trash2 size={13} />
              Delete
            </Button>
          )}

          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSelectedNodeId(null)
              setSelectedNodeIds([])
              setSelectedEdgeId(null)
            }}
            className="gap-1.5 text-muted-foreground hover:text-foreground"
            title="Clear current canvas selection"
          >
            Clear
          </Button>
        </div>
      )}

      <SkillPicker onAddSkill={addNode} />

      <CursorMenu
        open={canvasContextMenu !== null}
        x={canvasContextMenu?.x || 0}
        y={canvasContextMenu?.y || 0}
        onOpenChange={(open) => {
          if (!open) setCanvasContextMenu(null)
        }}
      >
        {canvasContextMenu?.scope === "pane" && (
          <>
            <DropdownMenuLabel>Canvas</DropdownMenuLabel>
            <DropdownMenuItem
              disabled={readOnly || isRunning}
              onSelect={() => {
                setPendingInsertPosition(reactFlow
                  ? reactFlow.screenToFlowPosition({
                      x: canvasContextMenu?.x ?? window.innerWidth / 2,
                      y: canvasContextMenu?.y ?? window.innerHeight / 2,
                    })
                  : null)
                setPickerOpen(true)
                setCanvasContextMenu(null)
              }}
            >
              Add skill step
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={readOnly || isRunning || !hasSkillNodes}
              onSelect={() => {
                handleInsertBlock("evaluator")
                setCanvasContextMenu(null)
              }}
            >
              Add Evaluator
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={readOnly || isRunning}
              onSelect={() => {
                handleInsertBlock("fanout")
                setCanvasContextMenu(null)
              }}
            >
              Add Split Work
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={readOnly || isRunning}
              onSelect={() => {
                handleInsertBlock("human")
                setCanvasContextMenu(null)
              }}
            >
              Add Human Input
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={readOnly || isRunning}
              onSelect={() => {
                handleInsertBlock("approval")
                setCanvasContextMenu(null)
              }}
            >
              Add Approval Gate
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => {
                recenterCanvas()
                setCanvasContextMenu(null)
              }}
            >
              Recenter canvas
            </DropdownMenuItem>
          </>
        )}
        {canvasContextMenu?.scope === "node" && contextNode && (
          <>
            <DropdownMenuLabel>{contextNode.type} step</DropdownMenuLabel>
            <DropdownMenuItem
              onSelect={() => {
                setSelectedNodeId(contextNode.id)
                setCanvasContextMenu(null)
              }}
            >
              Select step
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={!canDeleteContextNode}
              title={deleteContextNodeDisabledReason || undefined}
              onSelect={() => {
                if (!canDeleteContextNode) return
                removeNodeById(contextNode.id)
                setCanvasContextMenu(null)
              }}
            >
              Delete step
            </DropdownMenuItem>
          </>
        )}
      </CursorMenu>
    </div>
  )
}
