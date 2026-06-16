import { Sparkles } from "lucide-react";

export default function HousekeepingPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-6">
      <div className="size-12 rounded-full bg-muted/30 flex items-center justify-center mb-4">
        <Sparkles className="size-6 text-muted-foreground/30" />
      </div>
      <h2 className="text-lg font-semibold text-foreground">Housekeeping</h2>
      <p className="text-sm text-muted-foreground mt-1 max-w-sm">
        Room cleaning status, task assignments, and housekeeping board coming soon.
      </p>
    </div>
  );
}
