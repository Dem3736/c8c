import type { RefObject } from "react"
import { cn } from "@/lib/cn"
import { SectionErrorBoundary } from "@/components/ui/error-boundary"
import { ChatPanel } from "@/components/chat/ChatPanel"

interface WorkflowChatPanelShellProps {
  shellRef: RefObject<HTMLDivElement | null>
  open: boolean
  width: number
  onClose: () => void
}

export function WorkflowChatPanelShell({
  shellRef,
  open,
  width,
  onClose,
}: WorkflowChatPanelShellProps) {
  return (
    <SectionErrorBoundary sectionName="Agent panel">
      <div
        ref={shellRef}
        aria-hidden={!open}
        className={cn(
          "relative shrink-0 min-h-0 overflow-hidden ui-motion-standard transition-[width,opacity]",
          open ? "opacity-100" : "opacity-0",
        )}
        style={{ width: open ? width : 0 }}
        inert={!open}
      >
        <ChatPanel collapsed={!open} onClose={onClose} />
      </div>
    </SectionErrorBoundary>
  )
}
