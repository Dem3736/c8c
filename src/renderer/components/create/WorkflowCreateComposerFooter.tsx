import { Loader2, MoreHorizontal, Sparkles } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { CreateEntryHelpModeHint } from "@shared/types"
import type { WorkflowResultMode } from "@/lib/result-modes"

const DEVELOPMENT_HELP_MODE_OPTIONS: Array<{ value: CreateEntryHelpModeHint, label: string }> = [
  { value: "do", label: "Do it" },
  { value: "plan", label: "Plan it" },
  { value: "review", label: "Review it" },
]

export function WorkflowCreateComposerFooter({
  selectedResultMode,
  developmentHelpModeHint,
  onToggleHelpMode,
  promptHelperOpen,
  onTogglePromptHelper,
  optionalDetailCount,
  onBrowseStartingPoints,
  onCreateBlankFlow,
  creatingBlankWorkflow,
  hasProjectTarget,
}: {
  selectedResultMode: WorkflowResultMode
  developmentHelpModeHint: CreateEntryHelpModeHint | null
  onToggleHelpMode: (helpMode: CreateEntryHelpModeHint) => void
  promptHelperOpen: boolean
  onTogglePromptHelper: () => void
  optionalDetailCount: number
  onBrowseStartingPoints: () => void
  onCreateBlankFlow: () => void
  creatingBlankWorkflow: boolean
  hasProjectTarget: boolean
}) {
  return (
    <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        {selectedResultMode.id === "development" ? (
          <div
            className="control-cluster control-cluster-compact flex flex-wrap items-center gap-1 rounded-xl surface-inset-card p-1"
            aria-label="Development help mode"
          >
            {DEVELOPMENT_HELP_MODE_OPTIONS.map((option) => (
              <Button
                key={option.value}
                type="button"
                variant={developmentHelpModeHint === option.value ? "secondary" : "ghost"}
                size="xs"
                aria-pressed={developmentHelpModeHint === option.value}
                onClick={() => onToggleHelpMode(option.value)}
                className="px-2.5 text-muted-foreground"
              >
                {option.label}
              </Button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <Button
          type="button"
          variant={promptHelperOpen ? "secondary" : "ghost"}
          size="xs"
          aria-pressed={promptHelperOpen}
          className="text-muted-foreground"
          onClick={onTogglePromptHelper}
        >
          <Sparkles size={13} />
          {promptHelperOpen ? "Hide details" : "Details"}
        </Button>
        {optionalDetailCount > 0 ? (
          <Badge variant="secondary" size="compact">
            {optionalDetailCount}
          </Badge>
        ) : null}
        <Button
          variant="ghost"
          size="xs"
          onClick={onBrowseStartingPoints}
          className="text-muted-foreground"
        >
          Library
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label="More create actions"
              className="text-muted-foreground"
            >
              <MoreHorizontal size={14} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48 rounded-lg p-1.5">
            <DropdownMenuItem
              onSelect={onCreateBlankFlow}
              disabled={creatingBlankWorkflow || !hasProjectTarget}
              className="h-auto items-center gap-2 rounded-md px-3 py-2 text-body-sm"
            >
              {creatingBlankWorkflow ? <Loader2 size={14} className="animate-spin" /> : null}
              Blank flow
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}
