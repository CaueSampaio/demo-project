import { forwardRef, type HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type SeparatorProps = HTMLAttributes<HTMLDivElement>;

/** One-pixel warm rule separating page sections. */
const Separator = forwardRef<HTMLDivElement, SeparatorProps>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    role="separator"
    aria-orientation="horizontal"
    className={cn("h-px w-full shrink-0 bg-border", className)}
    {...props}
  />
));
Separator.displayName = "Separator";

export { Separator };
export type { SeparatorProps };
