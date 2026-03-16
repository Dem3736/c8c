import { useCallback, useEffect, useMemo, useState } from "react"
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  type Connection,
  type NodeTypes,
  type EdgeTypes,
  type ReactFlowInstance,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import { useCanvasLayout } from "@/hooks/useCanvasLayout"
import { useWorkflowWithUndo } from "@/hooks/useWorkflowWithUndo"
import { CanvasNode } from "./canvas/CanvasNode"
import { WorkflowEdge } from "./canvas/WorkflowEdge"
import { useAtom } from "jotai"
import { skillPickerOpenAtom, selectedNodeIdAtom, selectedWorkflowPathAtom, canvasManualPositionsAtom } from "@/lib/store"
import { runStatusAtom } from "@/features/execution"
import { SkillPicker } from "./SkillPicker"
import type { DiscoveredSkill } from "@/lib/store"
import { toast } from "sonner"
import { Plus, BarChart3, GitFork, LocateFixed, LayoutDashboard, Hand, Trash2 } from "lucide-react"
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
import { MOTION_BASE_MS } from "@/lib/tokens"
import { getWorkflowNodeLabel } from "@/lib/workflow-labels"

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

interface CanvasViewProps {
  readOnly?: boolean
  onAddSkill?: (skill: DiscoveredSkill) => void
}

function areStringArraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false
  }
  return true
}

function findFirstAddedNodeId(prevNodeIds: string[], nextNodeIds: string[]): string | null {
  const previousIds = new Set(prevNodeIds)
  return nextNodeIds.find((id) => !previousIds.has(id)) ?? null
}

export function CanvasView({ readOnly = false, onAddSkill }: CanvasViewProps = {}) {
  const { nodes, edges } = useCanvasLayout()
  const [, setPickerOpen] = useAtom(skillPickerOpenAtom)
  const [runStatus] = useAtom(runStatusAtom)
  const isRunning = runStatus === "running" || runStatus === "paused"
  const [selectedNodeId, setSelectedNodeId] = useAtom(selectedNodeIdAtom)
  const [selectedWorkflowPath] = useAtom(selectedWorkflowPathAtom)
  const { workflow, setWorkflow, setWorkflowDirect } = useWorkflowWithUndo()
  const [manualPositions, setManualPositions] = useAtom(canvasManualPositionsAtom)
  const [reactFlow, setReactFlow] = useState<ReactFlowInstance | null>(null)
  const [hasUserNavigatedCanvas, setHasUserNavigatedCanvas] = useState(false)
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null)
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([])
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
      if (onAddSkill) {
        onAddSkill(skill)
        return
      }
      let nextSelectedId: string | null = null
      setWorkflow((prev) => {
        const next = addSkillNodeToWorkflow(prev, skill)
        nextSelectedId = findFirstAddedNodeId(
          prev.nodes.map((node) => node.id),
          next.nodes.map((node) => node.id),
        )
        return next
      })
      if (nextSelectedId) {
        setSelectedNodeId(nextSelectedId)
      }
    },
    [isRunning, onAddSkill, readOnly, setSelectedNodeId, setWorkflow],
  )

  const addEvaluator = useCallback(() => {
    if (readOnly || isRunning) return
    let nextSelectedId: string | null = null
    setWorkflow((prev) => {
      const next = addEvaluatorNodeToWorkflow(prev)
      nextSelectedId = findFirstAddedNodeId(
        prev.nodes.map((node) => node.id),
        next.nodes.map((node) => node.id),
      )
      return next
    })
    if (nextSelectedId) {
      setSelectedNodeId(nextSelectedId)
    }
  }, [isRunning, readOnly, setSelectedNodeId, setWorkflow])

  const addFanOut = useCallback(() => {
    if (readOnly || isRunning) return
    let nextSelectedId: string | null = null
    setWorkflow((prev) => {
      const next = addFanOutPatternToWorkflow(prev)
      nextSelectedId = findFirstAddedNodeId(
        prev.nodes.map((node) => node.id),
        next.nodes.map((node) => node.id),
      )
      return next
    })
    if (nextSelectedId) {
      setSelectedNodeId(nextSelectedId)
    }
  }, [isRunning, readOnly, setSelectedNodeId, setWorkflow])

  const addApproval = useCallback(() => {
    if (readOnly || isRunning) return
    let nextSelectedId: string | null = null
    setWorkflow((prev) => {
      const next = addApprovalNodeToWorkflow(prev)
      nextSelectedId = findFirstAddedNodeId(
        prev.nodes.map((node) => node.id),
        next.nodes.map((node) => node.id),
      )
      return next
    })
    if (nextSelectedId) {
      setSelectedNodeId(nextSelectedId)
    }
  }, [isRunning, readOnly, setSelectedNodeId, setWorkflow])

  const addHuman = useCallback(() => {
    if (readOnly || isRunning) return
    let nextSelectedId: string | null = null
    setWorkflow((prev) => {
      const next = addHumanNodeToWorkflow(prev)
      nextSelectedId = findFirstAddedNodeId(
        prev.nodes.map((node) => node.id),
        next.nodes.map((node) => node.id),
      )
      return next
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
    ? `${selectedNodeIds.length} nodes selected`
    : selectedTemplateNode
      ? getWorkflowNodeLabel(selectedTemplateNode)
      : selectedEdgeId
        ? "Edge selected"
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

  const removeSelectedNode = useCallback(() => {
    if (!selectedNodeId || readOnly || isRunning) return
    const previousWorkflow = cloneWorkflow(workflow)
    setWorkflow((prev) => removeNodeAndRewireWorkflow(prev, selectedNodeId))
    setSelectedNodeId(null)
    toast.success("Node removed", {
      duration: Infinity,
      action: {
        label: "Undo",
        onClick: () => setWorkflowDirect(previousWorkflow),
      },
    })
  }, [isRunning, readOnly, selectedNodeId, setSelectedNodeId, setWorkflow, setWorkflowDirect, workflow])

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
      toast.success(`${deletableIds.length} nodes removed`, {
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
    setWorkflow((prev) => removeNodeAndRewireWorkflow(prev, nodeId))
    if (selectedNodeId === nodeId) {
      setSelectedNodeId(null)
    }
  }, [isRunning, readOnly, selectedNodeId, setSelectedNodeId, setWorkflow])

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
        isValidConnection={isValidConnection}
        connectionLineStyle={CONNECTION_LINE_STYLE}
        onMoveStart={() => setHasUserNavigatedCanvas(true)}
        onInit={setReactFlow}
        nodesDraggable={!readOnly && !isRunning}
        onNodeDragStop={(_event, node) => {
          setManualPositions((prev) => ({ ...prev, [node.id]: node.position }))
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

      {/* Floating add controls */}
      <div className="absolute top-3 right-3 z-10 flex items-center gap-2 rounded-lg control-cluster p-1">
        <Button
          variant="outline"
          size="sm"
          aria-label="Add skill step"
          disabled={readOnly || isRunning}
          title={
            readOnly
              ? "Canvas is read-only."
              : isRunning
                ? "Cannot add nodes while a run is in progress."
                : undefined
          }
          onClick={() => setPickerOpen(true)}
        >
          <Plus size={14} />
          Add Skill
        </Button>

        <Button
          variant="ghost"
          size="icon"
          aria-label="Auto-layout"
          onClick={() => {
            const previousPositions = manualPositions
            setManualPositions({})
            setTimeout(() => reactFlow?.fitView({ duration: 300 }), 50)
            if (Object.keys(previousPositions).length > 0) {
              toast.success("Layout reset", {
                duration: Infinity,
                action: {
                  label: "Undo",
                  onClick: () => {
                    setManualPositions(previousPositions)
                    setTimeout(() => reactFlow?.fitView({ duration: 300 }), 50)
                  },
                },
              })
            }
          }}
          className="text-muted-foreground hover:text-foreground"
          title="Reset to auto-layout"
        >
          <LayoutDashboard size={14} />
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
          aria-label="Delete selected item"
          onClick={removeSelection}
          disabled={!canDeleteSelection}
          className="text-muted-foreground enabled:hover:text-status-danger"
          title={canDeleteSelection ? "Delete selected node or edge" : "Select a node or edge to delete."}
        >
          <Trash2 size={14} />
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="w-[188px] justify-between bg-surface-1/90"
              disabled={readOnly || isRunning}
              title={
                readOnly
                  ? "Canvas is read-only."
                  : isRunning
                    ? "Cannot add nodes while a run is in progress."
                    : undefined
              }
            >
              <span className="inline-flex min-w-0 flex-1 items-center gap-2">
                <GitFork size={14} />
                <span className="truncate">Add node...</span>
              </span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Add Node</DropdownMenuLabel>
            <DropdownMenuItem
              disabled={!hasSkillNodes}
              onSelect={() => handleInsertBlock("evaluator")}
              title="Scores the previous output 1-10. Retries if below threshold."
            >
              <BarChart3 size={13} className="mr-2" />
              Add Evaluator
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => handleInsertBlock("fanout")}
              title="Splits work into parallel branches, then merges results."
            >
              <GitFork size={13} className="mr-2" />
              Add Fan-out (3 nodes)
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => handleInsertBlock("human")}
              title="Blocks the flow until someone fills in structured answers."
            >
              <Hand size={13} className="mr-2" />
              Add Human Input
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => handleInsertBlock("approval")}
              title="Pauses workflow for your review before continuing."
            >
              <Hand size={13} className="mr-2" />
              Add Approval Gate
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {selectedSummaryLabel && (
        <div className="absolute left-3 top-3 z-10 flex items-center gap-2 rounded-lg border border-hairline/70 bg-surface-1/92 px-3 py-2 shadow-sm backdrop-blur">
          <div className="min-w-0">
            <p className="section-kicker text-muted-foreground">Selected</p>
            <p className="max-w-[240px] truncate text-body-sm font-medium text-foreground" title={selectedSummaryLabel}>
              {selectedSummaryLabel}
            </p>
          </div>

          {canDeleteSelection && (
            <Button
              variant="ghost"
              size="sm"
              onClick={removeSelection}
              className="gap-1.5 text-muted-foreground hover:text-status-danger"
              title="Delete selected node or edge"
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
              disabled={readOnly}
              onSelect={() => {
                setPickerOpen(true)
                setCanvasContextMenu(null)
              }}
            >
              Add Skill
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={readOnly || !hasSkillNodes}
              onSelect={() => {
                handleInsertBlock("evaluator")
                setCanvasContextMenu(null)
              }}
            >
              Add Evaluator
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={readOnly}
              onSelect={() => {
                handleInsertBlock("fanout")
                setCanvasContextMenu(null)
              }}
            >
              Add Fan-out
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={readOnly}
              onSelect={() => {
                handleInsertBlock("human")
                setCanvasContextMenu(null)
              }}
            >
              Add Human Input
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={readOnly}
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
            <DropdownMenuLabel>{contextNode.type} node</DropdownMenuLabel>
            <DropdownMenuItem
              onSelect={() => {
                setSelectedNodeId(contextNode.id)
                setCanvasContextMenu(null)
              }}
            >
              Select node
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={!canDeleteContextNode}
              onSelect={() => {
                if (!canDeleteContextNode) return
                removeNodeById(contextNode.id)
                setCanvasContextMenu(null)
              }}
            >
              Delete node
            </DropdownMenuItem>
          </>
        )}
      </CursorMenu>
    </div>
  )
}
