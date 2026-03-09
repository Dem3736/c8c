import * as React from "react"

import { cn } from "@/lib/cn"

function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-surface-2/80", className)}
      {...props}
    />
  )
}

export { Skeleton }
