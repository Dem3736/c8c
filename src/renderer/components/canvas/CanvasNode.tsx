import { memo } from "react"
import { Handle, Position } from "@xyflow/react"
import type { Node, NodeProps } from "@xyflow/react"
import type { CanvasNodeData } from "@/hooks/useCanvasLayout"
import { cn } from "@/lib/cn"
import {
  Zap,
  AlertTriangle,
  Eye,
  Pencil,
} from "lucide-react"
import { NODE_ACCENTS, NODE_ICONS, NODE_ICON_TONES, STATUS_STYLES } from "@/lib/node-ui-config"

export type CanvasNodeType = Node<CanvasNodeData>

const STATUS_DOT_STYLES: Record<string, string> = {
  running: "bg-status-info animate-pulse",
  completed: "bg-status-success",
  failed: "bg-status-danger",
  queued: "bg-muted-foreground/70",
  skipped: "bg-status-warning",
  waiting_approval: "bg-status-warning animate-pulse",
}

const STATUS_LABELS: Record<string, string> = {
  running: "running",
  completed: "completed",
  failed: "failed",
  queued: "waiting",
  skipped: "skipped",
  waiting_approval: "waiting for approval",
}

function CanvasNodeComponent({ data }: NodeProps<CanvasNodeType>) {
  const Icon = NODE_ICONS[data.nodeType as keyof typeof NODE_ICONS] || Zap
  const isBranch = !!data.isBranch
  const isTerminal = data.isTerminal || data.nodeType === "input" || data.nodeType === "output"
  const nodeTypeLabel = data.nodeTypeLabel || data.nodeType
  const status = data.status || "pending"
  const showStatusDot = status !== "pending"
  const iconTone = NODE_ICON_TONES[data.nodeType as keyof typeof NODE_ICON_TONES] || NODE_ICON_TONES.skill
  const accent = isBranch ? "border-hairline border-dashed" : (NODE_ACCENTS[data.nodeType as keyof typeof NODE_ACCENTS] || "")
  const statusStyle = data.status ? STATUS_STYLES[data.status as keyof typeof STATUS_STYLES] || "" : ""
  const hasValidationErrors = Boolean(data.hasValidationErrors)
  const ringStyle = data.isActive
    ? "ring-2 ring-primary/60"
    : hasValidationErrors
      ? "ring-2 ring-status-danger/50"
      : status === "waiting_approval"
        ? "ring-2 ring-status-warning/50"
        : ""
  const statusDotStyle = showStatusDot ? STATUS_DOT_STYLES[status] || "bg-muted-foreground" : ""
  const terminalContainerStyle = isTerminal
    ? "min-w-[156px] max-w-[198px] rounded-md border border-hairline/70 bg-surface-1/80 px-2 py-1.5 ui-elevation-inset"
    : "min-w-[212px] max-w-[248px] rounded-lg border bg-gradient-to-b from-surface-1 to-surface-2/70 px-3 py-2 ui-elevation-base"
  const iconShellStyle = isTerminal
    ? "mt-0.5 h-control-xs w-control-xs rounded-md border border-hairline bg-surface-2/80 text-muted-foreground shadow-none"
    : `mt-0.5 h-control-sm w-control-sm rounded-md border flex items-center justify-center ui-elevation-inset ${iconTone}`

  return (
    <>
      {data.nodeType !== "input" && (
        <Handle
          type="target"
          position={Position.Left}
          className="node-handle-dot ui-motion-fast !h-2.5 !w-2.5 !rounded-full !border !border-surface-1 !bg-hairline hover:!bg-foreground/50"
          aria-label="Input connection"
        />
      )}

      <div
        role="group"
        aria-label={data.label}
        className={cn(
          "transition-[transform,border-color,box-shadow,background-color] ui-motion-fast will-change-transform",
          terminalContainerStyle,
          !isTerminal && "ui-interactive-card",
          accent,
          statusStyle,
          ringStyle,
        )}
      >
        <div className="flex items-start gap-2">
          <div className={cn(iconShellStyle)}>
            <Icon size={14} className="flex-shrink-0" />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="section-kicker">
                {nodeTypeLabel}
              </span>
              {isBranch && (
                <span className="inline-flex items-center rounded-sm border border-hairline px-1 py-0 ui-meta-text text-muted-foreground bg-surface-1/80">
                  branch
                </span>
              )}
              {hasValidationErrors && (
                <AlertTriangle size={11} className="text-status-danger" />
              )}
              {data.permissionModeOverride === "plan" && (
                <span className="inline-flex items-center gap-0.5 rounded-sm border border-hairline px-1 py-0 ui-meta-text text-muted-foreground bg-surface-1/80" title="Plan mode (read-only)">
                  <Eye size={9} />
                </span>
              )}
              {data.permissionModeOverride === "edit" && (
                <span className="inline-flex items-center gap-0.5 rounded-sm border border-status-warning/30 px-1 py-0 ui-meta-text text-status-warning bg-status-warning/10" title="Edit mode override">
                  <Pencil size={9} />
                </span>
              )}
            </div>

            <p className="mt-0.5 truncate text-body-sm font-medium text-foreground" title={data.label}>
              {data.label}
            </p>

            {data.subtitle && (
              <p className="mt-1 truncate ui-meta-text text-muted-foreground" title={data.subtitle}>
                {data.subtitle}
              </p>
            )}
          </div>

          {showStatusDot && (
            <span
              className={cn("mt-1 h-2.5 w-2.5 rounded-full border border-surface-1/80 shadow-sm", statusDotStyle)}
              aria-hidden="true"
            />
          )}
        </div>

        {showStatusDot && (
          <span className="sr-only">Status: {STATUS_LABELS[status] || status}</span>
        )}
      </div>

      {data.nodeType === "evaluator" ? (
        <>
          <Handle
            type="source"
            position={Position.Right}
            id="pass"
            style={{ top: "35%" }}
            className="node-handle-dot ui-motion-fast !h-2.5 !w-2.5 !rounded-full !border !border-surface-1 !bg-status-success hover:!bg-status-success/80"
            aria-label="Pass output"
          />
          <Handle
            type="source"
            position={Position.Right}
            id="fail"
            style={{ top: "65%" }}
            className="node-handle-dot ui-motion-fast !h-2.5 !w-2.5 !rounded-full !border !border-surface-1 !bg-status-danger hover:!bg-status-danger/80"
            aria-label="Fail output"
          />
        </>
      ) : data.nodeType !== "output" ? (
        <Handle
          type="source"
          position={Position.Right}
          className="node-handle-dot ui-motion-fast !h-2.5 !w-2.5 !rounded-full !border !border-surface-1 !bg-hairline hover:!bg-foreground/50"
          aria-label="Output connection"
        />
      ) : null}
    </>
  )
}

export const CanvasNode = memo(CanvasNodeComponent)
