import type { Ref } from "react"
import {
  MessageSquare,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

export type ToolbarActionMenuValue =
  | "save_as"
  | "export_copy"
  | "save_as_template"
  | "import"
  | "refresh"
  | "blank"
  | "templates"
  | "generate"
  | "duplicate"
  | "rename"
  | "delete"

interface WorkflowPrimaryActionsProps {
  controlGroupClass: string
  canUndo: boolean
  canRedo: boolean
  isRunning: boolean
  isSaving: boolean
  saveDisabledReason: string | null
  saveFlash: "saved" | "imported" | "exported" | null
  primaryShortcutLabel: string
  redoShortcutLabel: string
  chatOpen: boolean
  chatShortcutLabel: string
  creatingBlankWorkflow: boolean
  hasSelectedProject: boolean
  hasWorkflowPath: boolean
  agentToggleRef?: Ref<HTMLButtonElement>
  onUndo: () => void
  onRedo: () => void
  onSave: () => void
  onActionMenuSelect: (value: ToolbarActionMenuValue) => void
  onToggleChat: () => void
}

export function WorkflowPrimaryActions({
  chatOpen,
  chatShortcutLabel,
  agentToggleRef,
  onToggleChat,
}: WorkflowPrimaryActionsProps) {
  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant={chatOpen ? "default" : "ghost"}
            size="sm"
            ref={agentToggleRef}
            className="gap-1.5"
            onClick={onToggleChat}
            aria-label="Toggle Agent panel"
          >
            <MessageSquare size={14} />
            Agent
          </Button>
        </TooltipTrigger>
        <TooltipContent>Toggle Agent panel ({chatShortcutLabel})</TooltipContent>
      </Tooltip>
    </>
  )
}
