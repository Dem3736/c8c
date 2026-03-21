import type { ReactNode } from "react"
import { cn } from "@/lib/cn"

export function DisclosurePanel({
  summary,
  children,
  className,
  summaryClassName,
  contentClassName,
  defaultOpen = false,
  surface = "card",
}: {
  summary: ReactNode
  children: ReactNode
  className?: string
  summaryClassName?: string
  contentClassName?: string
  defaultOpen?: boolean
  surface?: "card" | "flat" | "plain"
}) {
  const summaryBaseClassName = surface === "plain"
    ? "cursor-pointer list-none px-0 py-1.5 ui-meta-label text-muted-foreground hover:text-foreground ui-transition-colors ui-motion-fast"
    : "cursor-pointer list-none px-3 py-2 ui-meta-label text-muted-foreground hover:text-foreground ui-transition-colors ui-motion-fast"
  const contentBaseClassName = surface === "plain"
    ? "border-t border-hairline px-0 py-3"
    : "border-t border-hairline px-3 py-3"

  return (
    <details
      className={cn(
        "ui-disclosure rounded-md",
        surface === "card"
          ? "surface-soft"
          : surface === "flat"
            ? "border border-hairline bg-transparent"
            : "bg-transparent",
        className,
      )}
      open={defaultOpen ? true : undefined}
    >
      <summary
        className={cn(
          summaryBaseClassName,
          summaryClassName,
        )}
      >
        {summary}
      </summary>
      <div className={cn(contentBaseClassName, contentClassName)}>
        {children}
      </div>
    </details>
  )
}
