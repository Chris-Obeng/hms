import Link from "next/link";
import { Button } from "@heroui/react";
import { Hotel } from "lucide-react";

export default function RoomTypeNotFound() {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center text-center">
      <div className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
        <Hotel className="size-6" />
      </div>
      <h1 className="text-lg font-semibold text-foreground">Room type not found</h1>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
        It may have been deleted, or the link you followed is out of date.
      </p>
      <Link href="/dashboard/rooms" className="mt-6">
        <Button variant="secondary" className="rounded-xl text-sm">
          Back to Rooms
        </Button>
      </Link>
    </div>
  );
}
