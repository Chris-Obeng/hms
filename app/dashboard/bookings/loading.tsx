import { Card, Skeleton } from "@heroui/react";
import { LIST_CARD } from "@/components/ui/list-styles";

export default function BookingsLoading() {
  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 pt-6 md:pt-8" aria-busy="true">
      <div className="flex items-center justify-between gap-4">
        <Skeleton className="h-8 w-40 rounded-lg" />
        <Skeleton className="h-11 w-36 rounded-xl md:h-10" />
      </div>
      <Card className={LIST_CARD}>
        <div className="flex gap-2 p-4 sm:px-6">
          <Skeleton className="h-11 w-full rounded-xl md:h-10 md:w-72" />
          <Skeleton className="hidden h-10 w-40 rounded-xl md:block" />
          <Skeleton className="hidden h-10 w-40 rounded-xl md:block" />
        </div>
        <div className="divide-y divide-border/50 border-t border-border/50">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3 sm:px-6">
              <Skeleton className="size-8 shrink-0 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-40 rounded-md" />
                <Skeleton className="h-3 w-56 rounded-md" />
              </div>
              <Skeleton className="h-6 w-24 rounded-full" />
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
