import { memo } from "react"
import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
} from "@xyflow/react"
import type { EdgeProps } from "@xyflow/react"
import { cn } from "@/lib/cn"

const EDGE_STYLES: Record<string, { stroke: string; strokeWidth: string; strokeDasharray?: string }> = {
  default: { stroke: "hsl(var(--hairline))", strokeWidth: "var(--edge-stroke-width-default)" },
  pass: { stroke: "hsl(var(--status-success))", strokeWidth: "var(--edge-stroke-width-active)", strokeDasharray: "10 5" },
  fail: { stroke: "hsl(var(--status-danger))", strokeWidth: "var(--edge-stroke-width-active)", strokeDasharray: "6 4" },
}

const LABEL_COLORS: Record<string, string> = {
  pass: "ui-status-badge-success",
  fail: "ui-status-badge-danger",
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
          "workflow-edge-path",
          edgeType === "fail" && isActive && "workflow-edge-fail",
          edgeType === "pass" && isActive && "workflow-edge-flow",
        )}
        style={{
          stroke: style.stroke,
          strokeWidth: selected ? "var(--edge-stroke-width-active)" : style.strokeWidth,
          strokeDasharray: style.strokeDasharray,
          opacity: selected ? 1 : "var(--edge-opacity-idle)",
          strokeLinecap: "round",
          strokeLinejoin: "round",
          filter: selected || isActive ? `drop-shadow(0 0 3px ${style.stroke})` : undefined,
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
              "ui-edge-label ui-status-badge section-kicker ui-transition-colors ui-motion-fast",
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
