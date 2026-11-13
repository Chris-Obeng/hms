import { Skeleton } from "@/components/ui/skeleton";

export default function SettingsLoading() {
  return (
    <div className="flex flex-col gap-8" aria-busy="true">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="grid gap-3 lg:grid-cols-[12rem_minmax(0,1fr)] lg:gap-8">
          <Skeleton className="h-4 w-24 rounded-md lg:mt-6" />
          <Skeleton className="h-40 w-full rounded-3xl" />
        </div>
      ))}
    </div>
  );
}
