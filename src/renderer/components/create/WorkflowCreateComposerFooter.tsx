import { ChevronDown, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { CreateEntryHelpModeHint, ResultModeId } from "@shared/types"
import { RESULT_MODES, type WorkflowResultMode } from "@/lib/result-modes"

const DEVELOPMENT_HELP_MODE_OPTIONS: Array<{ value: CreateEntryHelpModeHint | null, label: string }> = [
  { value: null, label: "Auto" },
  { value: "do", label: "Do it" },
  { value: "plan", label: "Plan it" },
  { value: "review", label: "Review it" },
]

export function WorkflowCreateComposerFooter({
  selectedResultMode,
  developmentHelpModeHint,
  showSupportControls,
  onSelectMode,
  onToggleHelpMode,
  promptHelperOpen,
  onTogglePromptHelper,
  optionalDetailCount,
  detailBudget,
  onDetailBudgetChange,
  shortcutHint,
}: {
  selectedResultMode: WorkflowResultMode
  developmentHelpModeHint: CreateEntryHelpModeHint | null
  showSupportControls: boolean
  onSelectMode: (modeId: ResultModeId) => void
  onToggleHelpMode: (helpMode: CreateEntryHelpModeHint | null) => void
  promptHelperOpen: boolean
  onTogglePromptHelper: () => void
  optionalDetailCount: number
  detailBudget: number
  onDetailBudgetChange: (value: number) => void
  shortcutHint: string
}) {
  const selectedHelpModeLabel = DEVELOPMENT_HELP_MODE_OPTIONS.find((option) => option.value === developmentHelpModeHint)?.label || "Auto"

  return (
    <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        {showSupportControls ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="ghost" size="xs" className="gap-1.5 text-muted-foreground">
                <span aria-hidden>{selectedResultMode.emoji}</span>
                {selectedResultMode.label}
                <ChevronDown size={13} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {RESULT_MODES.map((mode) => (
                <DropdownMenuItem key={mode.id} onSelect={() => onSelectMode(mode.id)}>
                  <span className="mr-2" aria-hidden>{mode.emoji}</span>
                  {mode.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {showSupportControls ? (
          <>
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <span className="ui-meta-text">Depth</span>
              <Input
                type="number"
                min={1}
                max={100}
                value={detailBudget}
                onChange={(event) => {
                  const nextValue = parseInt(event.target.value, 10)
                  if (!Number.isNaN(nextValue) && nextValue >= 1) {
                    onDetailBudgetChange(nextValue)
                  }
                }}
                className="h-7 w-16 px-2 text-center text-body-sm"
                aria-label="Detail budget"
              />
            </div>
            {selectedResultMode.id === "development" ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" variant="ghost" size="xs" className="gap-1.5 text-muted-foreground">
                    {selectedHelpModeLabel}
                    <ChevronDown size={13} />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {DEVELOPMENT_HELP_MODE_OPTIONS.map((option) => (
                    <DropdownMenuItem key={option.label} onSelect={() => onToggleHelpMode(option.value)}>
                      {option.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
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
              {optionalDetailCount > 0 ? ` (${optionalDetailCount})` : ""}
            </Button>
          </>
        ) : null}
      </div>
      <p className="ui-meta-text text-muted-foreground lg:ml-auto">
        {shortcutHint}
      </p>
    </div>
  )
}
