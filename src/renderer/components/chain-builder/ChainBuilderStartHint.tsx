import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/cn"

export function ChainBuilderStartHint({ compact }: { compact: boolean }) {
  return (
    <div
      className={cn(
        "mb-3 flex flex-wrap items-center gap-1.5 rounded-lg border border-hairline bg-surface-2/90 px-3",
        compact ? "py-1.5" : "py-2",
      )}
    >
      <Badge variant="outline" className="ui-meta-text px-2 py-0 text-foreground">
        Start with a skill step
      </Badge>
      <Badge variant="outline" className="ui-meta-text px-2 py-0 text-muted-foreground">
        Add checks
      </Badge>
      <Badge variant="outline" className="ui-meta-text px-2 py-0 text-muted-foreground">
        Split work
      </Badge>
      <Badge variant="outline" className="ui-meta-text px-2 py-0 text-muted-foreground">
        Human input
      </Badge>
    </div>
  )
}
