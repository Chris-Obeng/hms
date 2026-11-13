import { Skeleton } from "@/components/ui/skeleton";

export default function BookingsLoading() {
  return (
    <div className="mx-auto w-full max-w-7xl space-y-4 pt-1 md:space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-8 w-40 rounded-lg" />
          <Skeleton className="h-4 w-28 rounded-md" />
        </div>
        <Skeleton className="h-11 w-32 rounded-xl sm:h-10" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Skeleton className="h-11 max-w-sm flex-1 rounded-xl sm:h-10" />
        <Skeleton className="h-11 w-24 rounded-xl sm:h-10" />
      </div>

      <div className="space-y-2 rounded-3xl border border-border/60 bg-card p-4">
        {Array.from({ length: 7 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}
