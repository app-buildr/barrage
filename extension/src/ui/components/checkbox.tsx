import * as React from "react"
import { Check, Minus } from "lucide-react"
import { cn } from "@/ui/lib/utils"
import { Checkbox as CheckboxPrimitive } from "radix-ui"

function Checkbox({ className, ...props }: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "peer grid size-5 shrink-0 cursor-pointer place-content-center rounded-[6px] border border-input bg-card text-white transition-colors motion-reduce:transition-none outline-none disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:border-coral data-[state=checked]:bg-coral data-[state=indeterminate]:border-coral data-[state=indeterminate]:bg-coral",
        className
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator data-slot="checkbox-indicator" className="group grid place-content-center">
        <Check className="size-3.5 group-data-[state=indeterminate]:hidden" strokeWidth={3} aria-hidden="true" />
        <Minus className="hidden size-3.5 group-data-[state=indeterminate]:block" strokeWidth={3} aria-hidden="true" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}

export { Checkbox }
