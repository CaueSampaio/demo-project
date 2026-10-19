import { forwardRef, type HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type SkeletonProps = HTMLAttributes<HTMLDivElement>;

/** Muted pulsing block used while content loads. */
const Skeleton = forwardRef<HTMLDivElement, SkeletonProps>(({ className, ...props }, ref) => (
  <div ref={ref} aria-hidden="true" className={cn("animate-pulse rounded-control bg-muted", className)} {...props} />
));
Skeleton.displayName = "Skeleton";

export { Skeleton };
export type { SkeletonProps };
