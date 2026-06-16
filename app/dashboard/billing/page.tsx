import { Receipt } from "lucide-react";

export default function BillingPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-6">
      <div className="size-12 rounded-full bg-muted/30 flex items-center justify-center mb-4">
        <Receipt className="size-6 text-muted-foreground/30" />
      </div>
      <h2 className="text-lg font-semibold text-foreground">Billing &amp; Folios</h2>
      <p className="text-sm text-muted-foreground mt-1 max-w-sm">
        Guest folios, invoice management, and payment reconciliation coming soon.
      </p>
    </div>
  );
}
