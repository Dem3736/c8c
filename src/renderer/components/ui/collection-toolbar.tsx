import type { ReactNode } from "react"
import { Search } from "lucide-react"
import { Input } from "@/components/ui/input"

interface CollectionToolbarProps {
  ariaLabel: string
  query: string
  onQueryChange: (value: string) => void
  searchPlaceholder: string
  searchAriaLabel?: string
  summary?: ReactNode
  action?: ReactNode
  filters?: ReactNode
}

export function CollectionToolbar({
  ariaLabel,
  query,
  onQueryChange,
  searchPlaceholder,
  searchAriaLabel,
  summary,
  action,
  filters,
}: CollectionToolbarProps) {
  return (
    <section className="rounded-xl surface-soft p-3 space-y-3" aria-label={ariaLabel}>
      <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex min-w-0 flex-1">
          <div className="relative min-w-0 flex-1 sm:max-w-md">
            <Search
              size={13}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              type="search"
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder={searchPlaceholder}
              aria-label={searchAriaLabel || searchPlaceholder}
              className="h-control-sm bg-surface-1 pl-8 shadow-none"
            />
          </div>
        </div>

        {(summary || action) && (
          <div className="flex flex-wrap items-center gap-2">
            {summary ? (
              <span className="ui-meta-text hidden text-muted-foreground sm:inline">
                {summary}
              </span>
            ) : null}
            {action}
          </div>
        )}
      </div>

      {filters ? (
        <div className="flex flex-wrap items-center gap-2">
          {filters}
        </div>
      ) : null}
    </section>
  )
}
