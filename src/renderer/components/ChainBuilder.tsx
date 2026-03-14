import { useEffect, useMemo, useRef, useState } from "react"
import { useAtom } from "jotai"
import { cn } from "@/lib/cn"
import {
  currentWorkflowAtom,
  nodeStatesAtom,
  activeNodeIdAtom,
  selectedNodeIdAtom,
  skillPickerOpenAtom,
  type WorkflowNode,
  type DiscoveredSkill,
} from "@/lib/store"
import type {
  ApprovalNodeConfig,
  EvaluatorNodeConfig,
  InputNodeConfig,
  SplitterNodeConfig,
  MergerNodeConfig,
  OutputNodeConfig,
  SkillNodeConfig,
} from "@shared/types"
import { NodeCard } from "./NodeCard"
import { SkillPicker } from "./SkillPicker"
import { Plus, BarChart3, GitFork, ArrowDown as ArrowDownIcon, Hand } from "lucide-react"
import { Button } from "@/components/ui/button"
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
  addSkillNodeToWorkflow,
  isLinearChainReorderSafe,
  moveMiddleNodeBeforeTarget,
  moveMiddleNodeByDirection,
  removeNodeAndRewireWorkflow,
} from "@/lib/workflow-mutations"

interface ChainBuilderProps {
  compact?: boolean
}

export function ChainBuilder({ compact = false }: ChainBuilderProps = {}) {
  const [workflow, setWorkflow] = useAtom(currentWorkflowAtom)
  const [nodeStates] = useAtom(nodeStatesAtom)
  const [activeNodeId] = useAtom(activeNodeIdAtom)
  const [, setSelectedNodeId] = useAtom(selectedNodeIdAtom)
  const [, setPickerOpen] = useAtom(skillPickerOpenAtom)
  const [pendingRemoveId, setPendingRemoveId] = useState<string | null>(null)
  const isReorderSafe = isLinearChainReorderSafe(workflow)
  const [draggedNodeId, setDraggedNodeId] = useState<string | null>(null)
  const [dragOverNodeId, setDragOverNodeId] = useState<string | null>(null)
  const undoToastIdRef = useRef<string | number | null>(null)
  const [chainContextMenu, setChainContextMenu] = useState<{
    x: number
    y: number
    nodeId: string
  } | null>(null)

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
  const contextNode = chainContextMenu
    ? workflow.nodes.find((node) => node.id === chainContextMenu.nodeId) || null
    : null

  const getNodeDisplayLabel = (nodeId: string) => {
    const node = workflow.nodes.find((n) => n.id === nodeId)
    if (!node) return nodeId
    if (node.type === "skill") {
      return node.config.skillRef || "Skill"
    }
    if (node.type === "evaluator") return "Evaluator"
    if (node.type === "splitter") return "Splitter"
    if (node.type === "merger") return "Merger"
    if (node.type === "approval") return "Approval"
    if (node.type === "input") return "Input"
    if (node.type === "output") return "Output"
    return nodeId
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
      action: {
        label: "Undo",
        onClick: () => setWorkflow(previousWorkflow),
      },
    })
  }

  const moveNode = (nodeId: string, direction: "up" | "down") => {
    setWorkflow((prev) => moveMiddleNodeByDirection(prev, nodeId, direction))
  }

  const updateNodeConfig = (
    nodeId: string,
    config: InputNodeConfig | OutputNodeConfig | SkillNodeConfig | EvaluatorNodeConfig | SplitterNodeConfig | MergerNodeConfig | ApprovalNodeConfig,
  ) => {
    setWorkflow((prev) => ({
      ...prev,
      nodes: prev.nodes.map((n) => (n.id === nodeId ? { ...n, config } as typeof n : n)),
    }))
  }

  const addNode = (skill: DiscoveredSkill) => {
    setWorkflow((prev) => addSkillNodeToWorkflow(prev, skill))
  }

  const addEvaluator = () => {
    setWorkflow((prev) => addEvaluatorNodeToWorkflow(prev))
  }

  const addFanOut = () => {
    setWorkflow((prev) => addFanOutPatternToWorkflow(prev))
  }

  const addApproval = () => {
    setWorkflow((prev) => addApprovalNodeToWorkflow(prev))
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
    }
  }

  const handleDragStart = (node: WorkflowNode, event: React.DragEvent<HTMLDivElement>) => {
    if (node.type === "input" || node.type === "output") return
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
    if (!draggedNodeId) return
    if (node.type === "input" || node.type === "output") return
    event.preventDefault()
    setWorkflow((prev) => moveMiddleNodeBeforeTarget(prev, draggedNodeId, node.id))
    setDragOverNodeId(null)
    setDraggedNodeId(null)
  }

  const clearDragState = () => {
    setDraggedNodeId(null)
    setDragOverNodeId(null)
  }

  return (
    <section
      aria-label="Skills chain editor"
      className={cn(
        "rounded-lg surface-panel ui-fade-slide-in",
        compact ? "p-2.5 space-y-2" : "p-4 space-y-3",
      )}
    >
      <h2 className="section-kicker">
        Skills Chain
      </h2>

      <div className="space-y-0">
        {!workflow.nodes.some((n) => n.type !== "input" && n.type !== "output") && (
          <div
            className={cn(
              "rounded-lg border border-hairline bg-surface-2/90 px-3 ui-meta-text",
              compact ? "mb-2 py-1.5" : "mb-3 py-2",
            )}
          >
            Build your chain by adding a Skill first. Evaluator scores output quality, Fan-out creates parallel branches.
          </div>
        )}
        {orderedNodes.map((node, i) => (
          <div
            key={node.id}
            draggable={node.type !== "input" && node.type !== "output"}
            onDragStart={(event) => handleDragStart(node, event)}
            onDragEnd={clearDragState}
            onDragOver={(event) => handleDragOver(node, event)}
            onDragLeave={(event) => handleDragLeave(node.id, event)}
            onDrop={(event) => handleDrop(node, event)}
            onContextMenu={(event) => {
              event.preventDefault()
              event.stopPropagation()
              setSelectedNodeId(node.id)
              setChainContextMenu({
                x: event.clientX,
                y: event.clientY,
                nodeId: node.id,
              })
            }}
            className={cn(
              "rounded-lg ui-transition-colors ui-motion-fast",
              dragOverNodeId === node.id && "ring-2 ring-primary/50 ring-offset-2 ring-offset-surface-1",
            )}
          >
            {/* Connector arrow between nodes */}
            {i > 0 && (
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
            {!compact && node.type !== "input" && node.type !== "output" && isReorderSafe && (
              <div className="px-1 pb-1 ui-meta-text text-muted-foreground/70">
                Drag to reorder
              </div>
            )}
            <NodeCard
              node={node}
              index={i}
              total={orderedNodes.length}
              state={nodeStates[node.id]}
              isActive={activeNodeId === node.id}
              onRemove={() => confirmRemove(node.id)}
              onMoveUp={isReorderSafe ? () => moveNode(node.id, "up") : undefined}
              onMoveDown={isReorderSafe ? () => moveNode(node.id, "down") : undefined}
              onConfigChange={(config) => updateNodeConfig(node.id, config)}
              onSelect={() => setSelectedNodeId(node.id)}
              resolveNodeLabel={getNodeDisplayLabel}
              compact={compact}
            />
          </div>
        ))}

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
                Add block...
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                disabled={!hasSkillNodes}
                onSelect={() => handleInsertBlock("evaluator")}
                title="Scores the previous output 1-10. Retries if below threshold."
              >
                <BarChart3 size={13} className="mr-2" />
                Add Evaluator
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => handleInsertBlock("fanout")}
                title="Splits work into parallel branches, then merges results."
              >
                <GitFork size={13} className="mr-2" />
                Add Fan-out (3 nodes)
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
      </div>

      <CursorMenu
        open={chainContextMenu !== null}
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
                setSelectedNodeId(contextNode.id)
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

      <Dialog open={pendingRemoveId !== null} onOpenChange={(open) => !open && setPendingRemoveId(null)}>
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
