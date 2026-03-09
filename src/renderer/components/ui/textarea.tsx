import * as React from "react"

import { cn } from "@/lib/cn"

const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.ComponentProps<"textarea">
>(({ className, ...props }, ref) => {
  return (
    <textarea
      className={cn(
        "flex min-h-[80px] w-full rounded-md border border-input bg-input-background px-3 py-2 text-body-sm text-foreground shadow-[inset_0_1px_0_hsl(var(--foreground)/0.06)] transition-[border-color,box-shadow,background-color,color] ui-motion-fast placeholder:text-muted-foreground/80 focus-visible:border-ring focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/20 aria-invalid:border-status-danger aria-invalid:ring-[3px] aria-invalid:ring-status-danger/20 disabled:cursor-not-allowed disabled:border-hairline disabled:bg-surface-2/80 disabled:text-foreground/75 disabled:opacity-100 disabled:[-webkit-text-fill-color:currentColor] disabled:shadow-none",
        className,
      )}
      ref={ref}
      {...props}
    />
  )
})
Textarea.displayName = "Textarea"

export { Textarea }
