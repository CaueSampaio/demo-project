import { cn } from "@/lib/utils";
import { forwardRef, type HTMLAttributes } from "react";

type BadgeVariant = "neutral" | "brand" | "accent" | "success" | "destructive";

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

const variantStyles: Record<BadgeVariant, string> = {
  neutral: "border-border bg-muted text-muted-foreground",
  brand: "border-primary/20 bg-primary/10 text-primary",
  accent: "border-accent bg-accent text-accent-foreground",
  success: "border-success-border bg-success-surface text-success",
  destructive: "border-destructive-border bg-destructive-surface text-destructive",
};

const Badge = forwardRef<HTMLSpanElement, BadgeProps>(({ className, variant = "neutral", ...props }, ref) => (
  <span
    ref={ref}
    data-slot="badge"
    className={cn(
      "inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold",
      variantStyles[variant],
      className,
    )}
    {...props}
  />
));
Badge.displayName = "Badge";

export { Badge };
export type { BadgeVariant, BadgeProps };
