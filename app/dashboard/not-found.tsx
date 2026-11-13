import Link from "next/link";
import { buttonVariants } from "@/components/ui/button-styles";
import { cn } from "@/lib/utils";

/**
 * app/dashboard/not-found.tsx
 *
 * Rendered when notFound() is called from any page inside /dashboard/*.
 * Also catches direct navigation to non-existent dashboard routes
 * (e.g. /dashboard/bookings/nonexistent-id).
 *
 * Design matches the existing dashboard error.tsx — same layout, same
 * "Apple precision meets Linear typography" direction.
 */
export default function DashboardNotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-6">
      <div className="size-12 rounded-full bg-muted flex items-center justify-center mb-4">
        <svg
          className="size-6 text-muted-foreground"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15.182 16.318A4.486 4.486 0 0 0 12.016 15a4.486 4.486 0 0 0-3.198 1.318M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM9.75 9.75c0 .414-.168.75-.375.75S9 10.164 9 9.75 9.168 9 9.375 9s.375.336.375.75Zm-.375 0h.008v.015h-.008V9.75Zm5.625 0c0 .414-.168.75-.375.75s-.375-.336-.375-.75.168-.75.375-.75.375.336.375.75Zm-.375 0h.008v.015h-.008V9.75Z"
          />
        </svg>
      </div>

      <h2 className="text-lg font-semibold text-foreground">Page not found</h2>
      <p className="text-sm text-muted-foreground mt-1 max-w-sm">
        The page you&apos;re looking for doesn&apos;t exist or has been moved.
      </p>

      <div className="flex items-center gap-3 mt-6">
        <Link
          href="/dashboard"
          className={cn(buttonVariants({ variant: "outline", size: "sm" }), "rounded-lg")}
        >
          Go to Dashboard
        </Link>
        <Link
          href="/dashboard/bookings"
          className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "rounded-lg text-muted-foreground")}
        >
          View Bookings
        </Link>
      </div>
    </div>
  );
}
