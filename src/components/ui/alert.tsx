import { cn } from "@/lib/utils";
import { forwardRef, type HTMLAttributes } from "react";

type AlertVariant = "default" | "destructive" | "warning" | "success";

interface AlertProps extends HTMLAttributes<HTMLDivElement> {
  variant?: AlertVariant;
}

const variantStyles: Record<AlertVariant, string> = {
  default: "border-border bg-muted text-foreground [&>svg]:text-muted-foreground",
  destructive:
    "border-destructive-border bg-destructive-surface text-destructive [&>svg]:text-destructive",
  warning: "border-warning-border bg-warning-surface text-warning [&>svg]:text-warning",
  success: "border-success-border bg-success-surface text-success [&>svg]:text-success",
};

const Alert = forwardRef<HTMLDivElement, AlertProps>(({ className, variant = "default", ...props }, ref) => (
  <div
    ref={ref}
    role="alert"
    className={cn(
      "relative w-full rounded-control border p-4 [&>svg+div]:translate-y-[-3px] [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4 [&>svg~*]:pl-7",
      variantStyles[variant],
      className,
    )}
    {...props}
  />
));
Alert.displayName = "Alert";

const AlertTitle = forwardRef<HTMLHeadingElement, HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h5 ref={ref} className={cn("mb-1 font-semibold leading-none tracking-tight", className)} {...props} />
  ),
);
AlertTitle.displayName = "AlertTitle";

const AlertDescription = forwardRef<HTMLParagraphElement, HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("text-sm [&_p]:leading-relaxed", className)} {...props} />
  ),
);
AlertDescription.displayName = "AlertDescription";

export { Alert, AlertTitle, AlertDescription };
export type { AlertVariant, AlertProps };
