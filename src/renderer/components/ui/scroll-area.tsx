import * as React from "react"

import { cn } from "@/lib/cn"

const ScrollArea = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("ui-scroll-region overflow-auto", className)}
    {...props}
  />
))
ScrollArea.displayName = "ScrollArea"

export { ScrollArea }
