import { BarChart3 } from "lucide-react";

export default function ReportsPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-6">
      <div className="size-12 rounded-full bg-muted/30 flex items-center justify-center mb-4">
        <BarChart3 className="size-6 text-muted-foreground/30" />
      </div>
      <h2 className="text-lg font-semibold text-foreground">Reports</h2>
      <p className="text-sm text-muted-foreground mt-1 max-w-sm">
        Revenue reports, occupancy analytics, and performance dashboards coming soon.
      </p>
    </div>
  );
}
