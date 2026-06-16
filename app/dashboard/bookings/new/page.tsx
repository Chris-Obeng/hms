import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { CalendarDays, ArrowLeft } from "lucide-react";
import Link from "next/link";

export default function NewBookingPage() {
  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div className="flex items-center gap-3">
        <Link href="/dashboard/bookings">
          <Button variant="ghost" size="icon-sm" className="rounded-lg">
            <ArrowLeft className="size-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-xl md:text-2xl font-semibold tracking-tight text-foreground">
            New Booking
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Create a new reservation
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Reservation Form</CardTitle>
          <CardDescription className="text-xs mt-0.5">
            Fill in the guest and booking details
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="size-12 rounded-full bg-muted/30 flex items-center justify-center mb-4">
              <CalendarDays className="size-6 text-muted-foreground/30" />
            </div>
            <h3 className="text-sm font-medium text-foreground">Booking form coming soon</h3>
            <p className="text-xs text-muted-foreground/70 mt-1 max-w-[280px]">
              The new booking form with guest search, room selection, rate management,
              and payment processing is being built.
            </p>
            <Link href="/dashboard/bookings">
              <Button variant="outline" size="sm" className="mt-4 rounded-lg text-xs">
                Back to Bookings
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
