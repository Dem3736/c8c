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
import { CanvasNode } from "./canvas/CanvasNode"
import { WorkflowEdge } from "./canvas/WorkflowEdge"
import { useAtom } from "jotai"
import { runStatusAtom, skillPickerOpenAtom, selectedNodeIdAtom, selectedWorkflowPathAtom } from "@/lib/store"
import { SkillPicker } from "./SkillPicker"
import type { DiscoveredSkill } from "@/lib/store"
import { currentWorkflowAtom } from "@/lib/store"
import { Plus, BarChart3, GitFork, LocateFixed, Hand, Trash2 } from "lucide-react"
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
  addSkillNodeToWorkflow,
  removeEdgeFromWorkflow,
  removeNodeAndRewireWorkflow,
} from "@/lib/workflow-mutations"
import { MOTION_BASE_MS } from "@/lib/tokens"

const nodeTypes: NodeTypes = {
  input: CanvasNode,
  output: CanvasNode,
  skill: CanvasNode,
  evaluator: CanvasNode,
  splitter: CanvasNode,
  merger: CanvasNode,
  approval: CanvasNode,
}

const edgeTypes: EdgeTypes = {
  workflow: WorkflowEdge,
}

interface CanvasViewProps {
  readOnly?: boolean
  onAddSkill?: (skill: DiscoveredSkill) => void
}

export function CanvasView({ readOnly = false, onAddSkill }: CanvasViewProps = {}) {
  const { nodes, edges } = useCanvasLayout()
  const [, setPickerOpen] = useAtom(skillPickerOpenAtom)
  const [runStatus] = useAtom(runStatusAtom)
  const isRunning = runStatus === "running"
  const [selectedNodeId, setSelectedNodeId] = useAtom(selectedNodeIdAtom)
  const [selectedWorkflowPath] = useAtom(selectedWorkflowPathAtom)
  const [workflow, setWorkflow] = useAtom(currentWorkflowAtom)
  const [reactFlow, setReactFlow] = useState<ReactFlowInstance | null>(null)
  const [hasUserNavigatedCanvas, setHasUserNavigatedCanvas] = useState(false)
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null)
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
      setWorkflow((prev) => addSkillNodeToWorkflow(prev, skill))
    },
    [isRunning, onAddSkill, readOnly, setWorkflow],
  )

  const addEvaluator = useCallback(() => {
    if (readOnly || isRunning) return
    setWorkflow((prev) => addEvaluatorNodeToWorkflow(prev))
  }, [isRunning, readOnly, setWorkflow])

  const addFanOut = useCallback(() => {
    if (readOnly || isRunning) return
    setWorkflow((prev) => addFanOutPatternToWorkflow(prev))
  }, [isRunning, readOnly, setWorkflow])

  const addApproval = useCallback(() => {
    if (readOnly || isRunning) return
    setWorkflow((prev) => addApprovalNodeToWorkflow(prev))
  }, [isRunning, readOnly, setWorkflow])

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
    setWorkflow((prev) => removeNodeAndRewireWorkflow(prev, selectedNodeId))
    setSelectedNodeId(null)
  }, [isRunning, readOnly, selectedNodeId, setSelectedNodeId, setWorkflow])

  const removeSelectedEdge = useCallback(() => {
    if (!selectedEdgeId || readOnly || isRunning) return
    setWorkflow((prev) => removeEdgeFromWorkflow(prev, selectedEdgeId))
    setSelectedEdgeId(null)
  }, [isRunning, readOnly, selectedEdgeId, setWorkflow])

  const removeSelection = useCallback(() => {
    if (canDeleteSelectedEdge) {
      removeSelectedEdge()
      return
    }
    if (canDeleteSelectedNode) {
      removeSelectedNode()
    }
  }, [canDeleteSelectedEdge, canDeleteSelectedNode, removeSelectedEdge, removeSelectedNode])

  const removeNodeById = useCallback((nodeId: string) => {
    if (readOnly || isRunning) return
    setWorkflow((prev) => removeNodeAndRewireWorkflow(prev, nodeId))
    if (selectedNodeId === nodeId) {
      setSelectedNodeId(null)
    }
  }, [isRunning, readOnly, selectedNodeId, setSelectedNodeId, setWorkflow])

  const onConnect = useCallback(
    (connection: Connection) => {
      if (readOnly || isRunning) return
      if (!connection.source || !connection.target) return
      setWorkflow((prev) => addEdgeToWorkflow(prev, connection.source!, connection.target!, "default"))
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
        onSelectionChange={({ nodes: selectedNodes, edges: selectedEdges }) => {
          const firstSelectedNode = selectedNodes[0]
          const firstSelectedEdge = selectedEdges[0]
          if (firstSelectedNode) {
            setSelectedNodeId(firstSelectedNode.id)
            setSelectedEdgeId(null)
            return
          }
          if (firstSelectedEdge) {
            setSelectedNodeId(null)
            setSelectedEdgeId(firstSelectedEdge.id)
            return
          }
          setSelectedNodeId(null)
          setSelectedEdgeId(null)
        }}
        onConnect={onConnect}
        onMoveStart={() => setHasUserNavigatedCanvas(true)}
        onInit={setReactFlow}
        nodesDraggable={false}
        nodesConnectable={!readOnly && !isRunning}
        elementsSelectable={!readOnly}
        zoomOnDoubleClick={false}
        minZoom={0.45}
        maxZoom={1.65}
        proOptions={{ hideAttribution: true }}
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
          disabled={readOnly}
          onClick={() => setPickerOpen(true)}
        >
          <Plus size={14} />
          Add Skill
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
        >
          <Trash2 size={14} />
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="w-[188px] justify-between bg-surface-1/90"
              disabled={readOnly}
            >
              <span className="inline-flex min-w-0 flex-1 items-center gap-2">
                <GitFork size={14} />
                <span className="truncate">Add block...</span>
              </span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Add Block</DropdownMenuLabel>
            <DropdownMenuItem
              disabled={!hasSkillNodes}
              onSelect={() => handleInsertBlock("evaluator")}
            >
              <BarChart3 size={13} className="mr-2" />
              Add Evaluator
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => handleInsertBlock("fanout")}>
              <GitFork size={13} className="mr-2" />
              Add Fan-out (3 nodes)
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => handleInsertBlock("approval")}>
              <Hand size={13} className="mr-2" />
              Add Approval Gate
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

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
