import type { ReactNode } from "react"
import { cn } from "@/lib/cn"

export function DisclosurePanel({
  summary,
  children,
  className,
  summaryClassName,
  contentClassName,
  defaultOpen = false,
}: {
  summary: ReactNode
  children: ReactNode
  className?: string
  summaryClassName?: string
  contentClassName?: string
  defaultOpen?: boolean
}) {
  return (
    <details className={cn("ui-disclosure rounded-md surface-soft", className)} open={defaultOpen ? true : undefined}>
      <summary
        className={cn(
          "cursor-pointer list-none px-3 py-2 ui-meta-label text-muted-foreground hover:text-foreground ui-transition-colors ui-motion-fast",
          summaryClassName,
        )}
      >
        {summary}
      </summary>
      <div className={cn("border-t border-hairline px-3 py-3", contentClassName)}>
        {children}
      </div>
    </details>
  )
}
