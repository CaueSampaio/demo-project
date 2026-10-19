import { Skeleton } from "@/components/ui/skeleton";

/** Router-wide pending state: header, summary strip, then two content cards. */
export function PageSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading page" className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-64" />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Skeleton className="h-24 rounded-card" />
        <Skeleton className="h-24 rounded-card" />
        <Skeleton className="h-24 rounded-card" />
      </div>

      <Skeleton className="h-28 rounded-card" />
      <Skeleton className="h-64 rounded-card" />
    </div>
  );
}
