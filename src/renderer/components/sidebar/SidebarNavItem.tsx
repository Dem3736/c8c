import type { LucideIcon } from "lucide-react"
import type { ReactNode } from "react"
import { cn } from "@/lib/cn"
import { Button } from "@/components/ui/button"

interface SidebarNavItemProps {
  icon: LucideIcon
  label: string
  active?: boolean
  disabled?: boolean
  onClick: () => void
  className?: string
  meta?: ReactNode
}

export function SidebarNavItem({
  icon: Icon,
  label,
  active = false,
  disabled = false,
  onClick,
  className,
  meta,
}: SidebarNavItemProps) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      data-sidebar-item="true"
      className={cn(
        "w-full justify-start gap-2.5 px-2.5 text-sidebar-item font-normal ui-motion-fast",
        active
          ? "border-hairline/35 bg-sidebar-active text-foreground hover:bg-sidebar-active hover:text-foreground"
          : "text-muted-foreground hover:bg-sidebar-hover hover:text-foreground hover:border-hairline/45",
        className,
      )}
      onClick={onClick}
      disabled={disabled}
    >
      <Icon size={15} className="shrink-0" />
      <span className="min-w-0 flex-1 truncate text-left">{label}</span>
      {meta ? <span className="shrink-0">{meta}</span> : null}
    </Button>
  )
}
