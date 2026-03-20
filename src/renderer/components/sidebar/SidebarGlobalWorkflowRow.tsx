import type { WorkflowFile } from "@shared/types"
import { Globe } from "lucide-react"
import { cn } from "@/lib/cn"

interface SidebarGlobalWorkflowRowProps {
  workflow: WorkflowFile
  isSelected: boolean
  detailLabel: string | null
  updatedAtLabel: string
  onOpen: () => void
  onContextMenu: (event: React.MouseEvent<HTMLButtonElement>) => void
}

export function SidebarGlobalWorkflowRow({
  workflow,
  isSelected,
  detailLabel,
  updatedAtLabel,
  onOpen,
  onContextMenu,
}: SidebarGlobalWorkflowRowProps) {
  return (
    <button
      type="button"
      data-sidebar-item="true"
      onClick={onOpen}
      onContextMenu={onContextMenu}
      className={cn(
        "ui-pressable w-full sidebar-thread-row text-left text-sidebar-item ui-transition-colors ui-motion-fast",
        isSelected
          ? "sidebar-thread-row--active text-foreground"
          : "text-foreground-subtle",
      )}
    >
      <span className="flex items-start gap-2 min-w-0">
        <Globe size={12} className="mt-1 text-muted-foreground flex-shrink-0" />
        <span className="min-w-0 flex-1">
          <span className="block truncate">{workflow.name}</span>
          {detailLabel && (
            <span className="mt-0.5 block truncate text-sidebar-meta text-muted-foreground">
              {detailLabel}
            </span>
          )}
        </span>
        <span className="text-sidebar-meta text-muted-foreground tabular-nums">
          {updatedAtLabel}
        </span>
      </span>
    </button>
  )
}
