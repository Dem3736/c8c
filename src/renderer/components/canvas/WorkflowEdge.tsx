import { memo } from "react"
import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
} from "@xyflow/react"
import type { EdgeProps } from "@xyflow/react"
import { cn } from "@/lib/cn"

const EDGE_STYLES: Record<string, { stroke: string; strokeWidth: number; strokeDasharray?: string }> = {
  default: { stroke: "hsl(var(--hairline))", strokeWidth: 1.35 },
  pass: { stroke: "hsl(var(--status-success))", strokeWidth: 1.55 },
  fail: { stroke: "hsl(var(--status-danger))", strokeWidth: 1.5, strokeDasharray: "6 4" },
}

const LABEL_COLORS: Record<string, string> = {
  pass: "text-status-success bg-status-success/10 border-status-success/20",
  fail: "text-status-danger bg-status-danger/10 border-status-danger/20",
}

type WorkflowDisplayEdgeType = "default" | "pass" | "fail"

function WorkflowEdgeComponent({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  selected,
  data,
  markerEnd,
}: EdgeProps) {
  const edgeData = data as Record<string, unknown> | undefined
  const rawEdgeType = edgeData?.edgeType
  const isActive = edgeData?.isActive === true
  const edgeType: WorkflowDisplayEdgeType =
    rawEdgeType === "pass" || rawEdgeType === "fail" ? rawEdgeType : "default"
  const style = EDGE_STYLES[edgeType] || EDGE_STYLES.default

  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  })

  const showLabel = edgeType === "pass" || edgeType === "fail"
  const labelClass = LABEL_COLORS[edgeType] || ""

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        className={cn(
          edgeType === "fail" && isActive && "workflow-edge-fail",
          edgeType === "pass" && isActive && "workflow-edge-flow",
        )}
        style={{
          stroke: style.stroke,
          strokeWidth: selected ? style.strokeWidth + 0.45 : style.strokeWidth,
          strokeDasharray: style.strokeDasharray,
          opacity: selected ? 1 : 0.92,
          strokeLinecap: "round",
          strokeLinejoin: "round",
        }}
      />
      {showLabel && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: "none",
            }}
            className={cn(
              "edge-label rounded border px-2 py-0 ui-meta-text font-semibold uppercase tracking-[0.08em] transition-[background-color,border-color,color] ui-motion-fast",
              labelClass,
            )}
          >
            {edgeType}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
}

export const WorkflowEdge = memo(WorkflowEdgeComponent)
