import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/cn"
import { Button } from "@/components/ui/button"

interface SidebarNavItemProps {
  icon: LucideIcon
  label: string
  active?: boolean
  disabled?: boolean
  onClick: () => void
  className?: string
}

export function SidebarNavItem({
  icon: Icon,
  label,
  active = false,
  disabled = false,
  onClick,
  className,
}: SidebarNavItemProps) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      data-sidebar-item="true"
      className={cn(
        "w-full justify-start gap-3 rounded-md px-3 py-1.5 text-sidebar-item ui-motion-fast",
        active
          ? "bg-surface-2 text-foreground"
          : "text-muted-foreground hover:bg-surface-2 hover:text-foreground",
        className,
      )}
      onClick={onClick}
      disabled={disabled}
    >
      <Icon size={16} className="shrink-0" />
      <span>{label}</span>
    </Button>
  )
}
