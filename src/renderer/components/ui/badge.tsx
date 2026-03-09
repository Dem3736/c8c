import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/cn"

const badgeVariants = cva(
  "inline-flex w-fit max-w-full shrink-0 items-center justify-center gap-1 overflow-hidden text-ellipsis rounded-md border px-2 py-0 text-[0.75rem] leading-4 font-medium align-middle whitespace-nowrap transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring/70 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "border-primary/80 bg-primary text-primary-foreground shadow-[inset_0_1px_0_hsl(var(--primary-foreground)/0.2)]",
        secondary:
          "border-border bg-surface-2 text-secondary-foreground shadow-[inset_0_1px_0_hsl(var(--foreground)/0.06)]",
        destructive:
          "border-destructive/70 bg-destructive/10 text-destructive",
        outline: "border-border bg-surface-1/70 text-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
