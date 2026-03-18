import { Button } from "@/components/ui/button"
import { cn } from "@/lib/cn"
import type { WorkflowResultMode } from "@/lib/result-modes"

interface ResultModeCardProps {
  mode: WorkflowResultMode
  selected: boolean
  onSelect: (mode: WorkflowResultMode) => void
  compact?: boolean
}

export function ResultModeCard({
  mode,
  selected,
  onSelect,
  compact = false,
}: ResultModeCardProps) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="bare"
      onClick={() => onSelect(mode)}
      className={cn(
        "ui-interactive-card-subtle w-full rounded-xl surface-panel text-left !whitespace-normal",
        compact ? "px-3 py-3 !items-start !justify-start" : "px-4 py-4 !items-start !justify-start",
        selected && "ring-2 ring-foreground/20 bg-surface-3",
      )}
    >
      <div className="flex w-full items-start gap-3">
        <div
          className={cn(
            "shrink-0 rounded-lg border border-hairline bg-surface-2/80 shadow-inset-highlight-subtle",
            compact
              ? "flex h-9 w-9 items-center justify-center text-lg"
              : "flex h-11 w-11 items-center justify-center text-xl",
          )}
        >
          <span aria-hidden>{mode.emoji}</span>
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-2">
            <h3 className="text-body-md font-semibold text-foreground">{mode.label}</h3>
            {selected ? (
              <span className="rounded-full bg-foreground px-2 py-0.5 ui-meta-text text-background">
                Selected
              </span>
            ) : null}
          </div>
          <p className={cn("text-body-sm text-foreground", compact && "line-clamp-2 text-muted-foreground")}>
            {mode.summary}
          </p>
        </div>
      </div>

      {compact ? (
        <div className="mt-3 w-full">
          <p className="line-clamp-2 text-body-sm text-muted-foreground">{mode.youGetFirst}</p>
        </div>
      ) : (
        <div className={cn("mt-4 grid w-full gap-3", "grid-cols-1 md:grid-cols-2 xl:grid-cols-4")}>
          <div className="space-y-1">
            <p className="ui-meta-label text-muted-foreground">Use this for</p>
            <p className="text-body-sm text-muted-foreground">{mode.useFor}</p>
          </div>
          <div className="space-y-1">
            <p className="ui-meta-label text-muted-foreground">You provide</p>
            <p className="text-body-sm text-muted-foreground">{mode.youProvide}</p>
          </div>
          <div className="space-y-1">
            <p className="ui-meta-label text-muted-foreground">You get first</p>
            <p className="text-body-sm text-muted-foreground">{mode.youGetFirst}</p>
          </div>
          <div className="space-y-1">
            <p className="ui-meta-label text-muted-foreground">Your role</p>
            <p className="text-body-sm text-muted-foreground">{mode.userRole}</p>
          </div>
        </div>
      )}
    </Button>
  )
}
