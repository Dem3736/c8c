import type { ReactNode } from "react"
import { cn } from "@/lib/cn"

export function PageShell({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div className="ui-scroll-region flex-1 min-h-0 overflow-y-auto pt-[var(--titlebar-height)]">
      <div
        className={cn(
          "ui-content-shell pt-6 pb-8 space-y-6",
          className,
        )}
      >
        {children}
      </div>
    </div>
  )
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string
  subtitle: string
  actions?: ReactNode
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-5">
      <div className="max-w-[640px]">
        <h1 className="ui-title-text text-foreground">
          {title}
        </h1>
        <p className="mt-2 text-body-md text-muted-foreground">{subtitle}</p>
      </div>
      {actions ? (
        <div className="control-cluster flex items-center gap-2 rounded-lg p-1">
          {actions}
        </div>
      ) : null}
    </header>
  )
}

export function SectionHeading({
  title,
  meta,
}: {
  title: string
  meta?: ReactNode
}) {
  return (
    <div className="flex items-center justify-between">
      <h2 className="text-title-md text-foreground">
        {title}
      </h2>
      {meta}
    </div>
  )
}
