import type { Ref } from "react"
import {
  Loader2,
  MessageSquare,
  Redo2,
  Save,
  SlidersHorizontal,
  Undo2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
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
  controlGroupClass,
  canUndo,
  canRedo,
  isRunning,
  isSaving,
  saveDisabledReason,
  saveFlash,
  primaryShortcutLabel,
  redoShortcutLabel,
  chatOpen,
  chatShortcutLabel,
  creatingBlankWorkflow,
  hasSelectedProject,
  hasWorkflowPath,
  agentToggleRef,
  onUndo,
  onRedo,
  onSave,
  onActionMenuSelect,
  onToggleChat,
}: WorkflowPrimaryActionsProps) {
  return (
    <>
      <div role="group" aria-label="Primary flow actions" className={controlGroupClass}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={onUndo}
              disabled={!canUndo || isRunning}
              aria-label="Undo"
              title={
                isRunning
                  ? "Undo is unavailable while a run is in progress."
                  : !canUndo
                    ? "Nothing to undo yet."
                    : undefined
              }
            >
              <Undo2 size={14} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {isRunning
              ? "Undo is unavailable while a run is in progress."
              : canUndo
                ? `Undo (${primaryShortcutLabel}Z)`
                : "Nothing to undo yet."}
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={onRedo}
              disabled={!canRedo || isRunning}
              aria-label="Redo"
              title={
                isRunning
                  ? "Redo is unavailable while a run is in progress."
                  : !canRedo
                    ? "Nothing to redo yet."
                    : undefined
              }
            >
              <Redo2 size={14} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {isRunning
              ? "Redo is unavailable while a run is in progress."
              : canRedo
                ? `Redo (${redoShortcutLabel})`
                : "Nothing to redo yet."}
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              onClick={onSave}
              disabled={Boolean(saveDisabledReason)}
              aria-label={saveFlash === "saved" ? "Saved" : "Save flow"}
              title={saveDisabledReason || undefined}
            >
              {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {saveDisabledReason || `Save flow (${primaryShortcutLabel}S)`}
          </TooltipContent>
        </Tooltip>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="w-[168px] justify-between" disabled={isRunning || creatingBlankWorkflow}>
              <span className="inline-flex min-w-0 flex-1 items-center gap-2">
                <SlidersHorizontal size={14} />
                <span className="truncate">Actions</span>
              </span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuGroup>
              <DropdownMenuLabel>File</DropdownMenuLabel>
              <DropdownMenuItem onSelect={() => onActionMenuSelect("save_as")}>
                Save flow as...
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onActionMenuSelect("export_copy")}>
                Export flow copy...
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onActionMenuSelect("save_as_template")}>
                Save to library
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onActionMenuSelect("import")}>
                Import flow...
              </DropdownMenuItem>
              <DropdownMenuItem disabled={!hasSelectedProject} onSelect={() => onActionMenuSelect("refresh")}>
                Refresh project data
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuLabel>Create</DropdownMenuLabel>
              <DropdownMenuItem onSelect={() => onActionMenuSelect("blank")}>
                Blank flow
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onActionMenuSelect("templates")}>
                Browse library
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onActionMenuSelect("generate")}>
                Create with agent
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuLabel>Flow</DropdownMenuLabel>
              <DropdownMenuItem disabled={!hasWorkflowPath} onSelect={() => onActionMenuSelect("duplicate")}>
                Duplicate flow
              </DropdownMenuItem>
              <DropdownMenuItem disabled={!hasWorkflowPath} onSelect={() => onActionMenuSelect("rename")}>
                Rename flow
              </DropdownMenuItem>
              <DropdownMenuItem disabled={!hasWorkflowPath} onSelect={() => onActionMenuSelect("delete")}>
                Delete flow
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

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

      <div
        role="status"
        aria-live="polite"
        data-visible={saveFlash ? "true" : "false"}
        className="ui-inline-presence ui-meta-text min-w-[4.25rem] text-status-success"
      >
        {saveFlash === "saved" ? "Saved" : saveFlash === "imported" ? "Imported" : saveFlash === "exported" ? "Exported" : ""}
      </div>

      <div className="flex-1" />
    </>
  )
}
