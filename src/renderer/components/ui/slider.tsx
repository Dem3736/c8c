import * as React from "react"

import { cn } from "@/lib/cn"

export interface SliderProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {}

const Slider = React.forwardRef<HTMLInputElement, SliderProps>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      type="range"
      className={cn(
        "ui-slider h-control-xs w-full cursor-pointer ui-motion-fast",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring/70",
        "disabled:cursor-not-allowed",
        className,
      )}
      {...props}
    />
  ),
)
Slider.displayName = "Slider"

export { Slider }
