import { cn } from "@/lib/utils";
import { forwardRef, type InputHTMLAttributes } from "react";

interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {}

const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    type="checkbox"
    data-slot="checkbox"
    className={cn(
      "h-4 w-4 shrink-0 cursor-pointer rounded-[4px] border border-input accent-primary",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
      "disabled:cursor-not-allowed disabled:opacity-50",
      className,
    )}
    {...props}
  />
));
Checkbox.displayName = "Checkbox";

export { Checkbox };
export type { CheckboxProps };
