"use client"

// src/components/ui/progress.tsx
import * as ProgressPrimitive from "@radix-ui/react-progress";
import { cn } from "@/lib/utils";

export function Progress({
                           value,
                           className,
                           colorClass = "",
                           ...props
                         }: React.ComponentProps<typeof ProgressPrimitive.Root> & { colorClass?: string }) {
  return (
      <ProgressPrimitive.Root
          data-slot="progress"
          className={cn(
              "bg-primary/20 relative h-2 w-full overflow-hidden rounded-full",
              className
          )}
          {...props}
      >
        <ProgressPrimitive.Indicator
            className={cn(
                "h-full transition-all",
                colorClass
            )}
            style={{ width: `${value}%` }}
        />
      </ProgressPrimitive.Root>
  );
}