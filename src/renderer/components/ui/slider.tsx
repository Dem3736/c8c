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
        "h-control-xs w-full cursor-pointer appearance-none rounded-full bg-surface-3",
        "[&::-webkit-slider-runnable-track]:h-1.5 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-surface-3",
        "[&::-webkit-slider-thumb]:mt-[-5px] [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-border [&::-webkit-slider-thumb]:bg-surface-1",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring/70",
        "disabled:cursor-not-allowed disabled:brightness-90",
        className,
      )}
      {...props}
    />
  ),
)
Slider.displayName = "Slider"

export { Slider }
