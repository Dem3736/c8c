import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/cn"
import type { FlowStatusRailEntry } from "@/lib/flow-status-rail"

function toneClasses(tone: FlowStatusRailEntry["tone"]) {
  switch (tone) {
    case "success":
      return {
        token: "ui-status-badge-success",
        indicator: "bg-status-success",
      }
    case "warning":
      return {
        token: "ui-status-badge-warning",
        indicator: "bg-status-warning",
      }
    case "danger":
      return {
        token: "ui-status-badge-danger",
        indicator: "bg-status-danger",
      }
    default:
      return {
        token: "ui-status-badge-info",
        indicator: "bg-status-info",
      }
  }
}

export function FlowStatusRail({
  entries,
  onSelect,
  primaryModifierLabel,
}: {
  entries: FlowStatusRailEntry[]
  onSelect: (entry: FlowStatusRailEntry) => void
  primaryModifierLabel: string
}) {
  if (entries.length === 0) return null

  return (
    <section aria-label="Quick switch rail" className="border-b border-hairline bg-surface-1/85 px-[var(--content-gutter)] py-2">
      <div className="flex gap-2 overflow-x-auto ui-scroll-region">
        {entries.map((entry) => {
          const tone = toneClasses(entry.tone)
          return (
            <button
              key={entry.id}
              type="button"
              onClick={() => onSelect(entry)}
              className={cn(
                "group min-w-[220px] max-w-[280px] rounded-xl border border-hairline bg-background/90 px-3 py-2 text-left ui-motion-fast transition-[border-color,background-color,box-shadow]",
                "hover:border-foreground/15 hover:bg-surface-1 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/30",
                entry.selected && "border-foreground/15 bg-surface-1 shadow-[0_8px_24px_rgba(15,23,42,0.06)]",
              )}
              aria-label={`Open ${entry.label}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-body-sm font-medium text-foreground">{entry.label}</div>
                  <div className="mt-0.5 flex min-w-0 items-center gap-1.5">
                    <span className={cn("h-2 w-2 shrink-0 rounded-full", tone.indicator)} aria-hidden="true" />
                    <span className="truncate text-sidebar-meta text-muted-foreground">
                      {entry.stageLabel || entry.projectLabel}
                    </span>
                    {entry.approvalPending && (
                      <Badge variant="warning" size="compact">
                        Review
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  {entry.keyHint != null && (
                    <Badge variant="outline" size="compact" className="text-[10px]">
                      {primaryModifierLabel}{entry.keyHint}
                    </Badge>
                  )}
                  <span className={cn("ui-status-badge ui-meta-text whitespace-nowrap", tone.token)}>
                    {entry.statusLabel}
                  </span>
                </div>
              </div>
            </button>
          )
        })}
      </div>
    </section>
  )
}
