import { Skeleton } from "@heroui/react";

/** Shaped like the oversight page: 4 KPI tiles + filter row + table block. */
export default function PlatformLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading Hotel Oversight">
      <div className="space-y-1">
        <Skeleton className="h-7 w-56 rounded-lg" />
        <Skeleton className="h-4 w-72 rounded-md" />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="card-default p-4 space-y-2.5">
            <Skeleton className="h-3 w-20 rounded-md" />
            <Skeleton className="h-8 w-28 rounded-md" />
            <Skeleton className="h-3 w-24 rounded-md" />
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Skeleton className="h-9 w-full sm:w-64 rounded-lg" />
        <div className="flex gap-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-9 w-20 rounded-lg" />
          ))}
        </div>
      </div>

      <div className="card-default overflow-hidden">
        <div className="border-b border-border/60 px-4 py-3">
          <div className="flex gap-6">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-3 w-16 rounded-md" />
            ))}
          </div>
        </div>
        <div className="divide-y divide-border/40">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-center gap-6 px-4 py-3.5">
              <div className="space-y-1.5 min-w-0 flex-1">
                <Skeleton className="h-4 w-40 max-w-full rounded-md" />
                <Skeleton className="h-3 w-24 rounded-md" />
              </div>
              <Skeleton className="h-5 w-16 rounded-full shrink-0 hidden sm:block" />
              <Skeleton className="h-4 w-20 rounded-md shrink-0 hidden md:block" />
              <Skeleton className="h-4 w-14 rounded-md shrink-0 hidden lg:block" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
