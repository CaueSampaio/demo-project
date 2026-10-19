import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type StatCardProps = {
  label: ReactNode;
  value: ReactNode;
  unit?: ReactNode;
  hint?: ReactNode;
  className?: string;
};

/** Small metric tile used in page summary strips. */
export function StatCard({ label, value, unit, hint, className }: StatCardProps) {
  return (
    <div className={cn("min-w-0 rounded-card border border-border bg-card p-4 shadow-xs", className)}>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 flex items-baseline gap-1 text-2xl font-bold tabular-nums text-foreground">
        <span className="truncate">{value}</span>
        {unit ? <span className="text-sm font-medium text-muted-foreground">{unit}</span> : null}
      </p>
      {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export type { StatCardProps };
