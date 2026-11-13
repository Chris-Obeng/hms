import Link from "next/link";
import { Hotel } from "lucide-react";

export default function RoomTypeNotFound() {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-center">
      <span className="grid size-12 place-items-center rounded-2xl bg-secondary text-muted-foreground">
        <Hotel className="size-5" aria-hidden="true" />
      </span>
      <h1 className="text-sm font-semibold text-foreground">Room type not found</h1>
      <Link
        href="/dashboard/rooms"
        className="inline-flex min-h-11 items-center rounded-xl bg-secondary px-4 text-sm font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring md:min-h-10"
      >
        Back to rooms
      </Link>
    </div>
  );
}
