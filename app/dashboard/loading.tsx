import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardLoading() {
  return (
    <div className="mx-auto w-full max-w-[1440px] space-y-4 pt-1 md:space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-8 w-36 rounded-lg" />
          <Skeleton className="h-4 w-48 rounded-md" />
        </div>
        <Skeleton className="h-11 w-32 shrink-0 rounded-xl sm:h-10" />
      </div>

      <Skeleton className="h-[108px] w-full rounded-3xl md:hidden" />

      <div className="grid grid-cols-1 items-start gap-4 md:gap-6 lg:grid-cols-[312px_minmax(0,1fr)] lg:gap-6">
        <div className="order-2 flex flex-col gap-4 md:order-1 md:grid md:grid-cols-[260px_minmax(0,1fr)] md:gap-6 lg:flex lg:flex-col lg:gap-6">
          <Skeleton className="hidden h-[176px] w-full rounded-3xl md:block" />
          <Skeleton className="h-[220px] w-full rounded-3xl lg:h-[360px]" />
        </div>

        <div className="order-1 overflow-hidden rounded-3xl border border-border/60 bg-card md:order-2">
          <div className="flex gap-2 border-b border-border/50 bg-muted/20 p-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-24 shrink-0 rounded-xl" />
            ))}
          </div>
          <div className="space-y-3 p-6">
            <Skeleton className="h-10 w-full rounded-xl" />
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-2xl" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
