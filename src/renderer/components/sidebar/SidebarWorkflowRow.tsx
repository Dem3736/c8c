import type { WorkflowFile } from "@shared/types"
import { Loader2, Pencil, Trash2 } from "lucide-react"
import { cn } from "@/lib/cn"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

interface SidebarWorkflowRowProps {
  workflow: WorkflowFile
  isSelected: boolean
  isDirty: boolean
  detailLabel: string | null
  showSpinningIndicator: boolean
  indicatorTitle: string
  indicatorDotClass: string
  rowMeta: string
  rowMetaClass: string
  progress: number
  progressBarClass: string
  runStatus: string
  showProgressTrack: boolean
  onOpen: () => void
  onRename: () => void
  onDelete: () => void
  onContextMenu: (event: React.MouseEvent<HTMLButtonElement>) => void
}

export function SidebarWorkflowRow({
  workflow,
  isSelected,
  isDirty,
  detailLabel,
  showSpinningIndicator,
  indicatorTitle,
  indicatorDotClass,
  rowMeta,
  rowMetaClass,
  progress,
  progressBarClass,
  runStatus,
  showProgressTrack,
  onOpen,
  onRename,
  onDelete,
  onContextMenu,
}: SidebarWorkflowRowProps) {
  return (
    <div
      role="option"
      aria-selected={isSelected}
      className={cn(
        "sidebar-thread-row group",
        isSelected && "sidebar-thread-row--active",
      )}
    >
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          aria-current={isSelected ? "page" : undefined}
          data-sidebar-item="true"
          data-workflow-path={workflow.path}
          onClick={onOpen}
          onDoubleClick={(event) => {
            event.stopPropagation()
            onRename()
          }}
          onContextMenu={onContextMenu}
          className={cn(
            "ui-pressable min-w-0 flex-1 flex items-start gap-1.5 rounded-md px-1 py-0.5 text-left ui-transition-colors ui-motion-fast focus-visible:outline-none",
            isSelected
              ? "hover:bg-transparent"
              : "hover:bg-sidebar-hover/80",
          )}
        >
          {showSpinningIndicator ? (
            <span title={indicatorTitle} className="mt-0.5 inline-flex flex-shrink-0" role="img" aria-label={indicatorTitle}>
              <Loader2
                size={12}
                className={cn("animate-spin flex-shrink-0", rowMetaClass)}
                aria-hidden="true"
              />
            </span>
          ) : (
            <span
              className={cn(
                "mt-1 inline-flex h-2 w-2 rounded-full border flex-shrink-0",
                indicatorDotClass,
              )}
              title={indicatorTitle}
              role="img"
              aria-label={indicatorTitle}
            />
          )}
          <span className="min-w-0 flex-1">
            <span className="flex min-w-0 items-center gap-1.5">
              <span className={cn(
                "truncate flex-1 text-sidebar-item",
                isSelected ? "text-foreground" : "text-foreground-subtle",
              )}
              >
                {workflow.name}
              </span>
              {isDirty && (
                <span className="ui-status-badge ui-status-badge-warning rounded-sm px-1 py-0 text-sidebar-meta">
                  unsaved
                </span>
              )}
            </span>
            {detailLabel && (
              <span className="mt-0.5 block min-w-0">
                <span className="block truncate text-sidebar-meta text-muted-foreground">
                  {detailLabel}
                </span>
              </span>
            )}
          </span>
        </button>

        <span
          className={cn(
            "text-sidebar-meta flex-shrink-0 tabular-nums ui-transition-colors ui-motion-fast",
            rowMetaClass,
          )}
        >
          {rowMeta}
        </span>

        <div
          data-visible={isSelected ? "true" : undefined}
          className="ui-reveal-trailing flex items-center gap-0.5"
        >
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="ui-icon-button ui-transition-colors ui-motion-fast"
                onClick={(event) => {
                  event.stopPropagation()
                  onRename()
                }}
                aria-label={`Rename ${workflow.name}`}
              >
                <Pencil size={12} />
              </button>
            </TooltipTrigger>
            <TooltipContent>Rename</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="ui-icon-button hover:bg-status-danger/20 hover:text-status-danger ui-transition-colors ui-motion-fast"
                onClick={(event) => {
                  event.stopPropagation()
                  onDelete()
                }}
                aria-label={`Delete ${workflow.name}`}
              >
                <Trash2 size={12} />
              </button>
            </TooltipTrigger>
            <TooltipContent>Delete</TooltipContent>
          </Tooltip>
        </div>
      </div>

      <div
        data-visible={showProgressTrack ? "true" : "false"}
        className="ui-inline-presence pointer-events-none absolute inset-x-1 bottom-1"
      >
        <div
          className="sidebar-progress-track"
          role="progressbar"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${workflow.name} execution progress`}
        >
          <div
            className={cn(
              "sidebar-progress-bar",
              progressBarClass,
              runStatus === "running" && "ui-running-pulse",
            )}
            style={{ transform: `scaleX(${showProgressTrack ? progress / 100 : 0})` }}
          />
        </div>
      </div>
    </div>
  )
}
