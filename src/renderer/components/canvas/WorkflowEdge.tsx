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
  pass: { stroke: "hsl(var(--status-success))", strokeWidth: "var(--edge-stroke-width-active)" },
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
      {selected && (
        <BaseEdge
          id={`${id}-halo`}
          path={edgePath}
          interactionWidth={0}
          className="workflow-edge-selected-halo"
          style={{
            stroke: style.stroke,
            strokeWidth: "var(--edge-halo-width, 8)",
            strokeLinecap: "round",
            strokeLinejoin: "round",
            pointerEvents: "none",
          }}
        />
      )}
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        className={cn(
          "workflow-edge-path",
          edgeType === "fail" && isActive && "workflow-edge-fail",
          !(selected || isActive) && "workflow-edge-idle",
        )}
        style={{
          stroke: style.stroke,
          strokeWidth: selected ? "var(--edge-stroke-width-active)" : style.strokeWidth,
          strokeDasharray: style.strokeDasharray,
          strokeLinecap: "round",
          strokeLinejoin: "round",
          filter: isActive
            ? `drop-shadow(0 0 6px ${style.stroke})`
            : selected
              ? `drop-shadow(0 0 3px ${style.stroke})`
              : undefined,
        }}
      />
      {isActive && edgeType === "pass" && (
        <BaseEdge
          id={`${id}-photon`}
          path={edgePath}
          interactionWidth={0}
          className="workflow-edge-photon"
          style={{
            stroke: "hsl(0 0% 100% / 0.76)",
            strokeWidth: "var(--edge-stroke-width-active)",
            strokeLinecap: "round",
            pointerEvents: "none",
          }}
        />
      )}
      {showLabel && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: "none",
            }}
            className={cn(
              "ui-edge-label ui-status-badge ui-meta-label ui-transition-colors ui-motion-fast",
              labelClass,
              selected && "is-selected",
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
