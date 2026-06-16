"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { Users, CalendarDays, BedDouble, Search as SearchIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────

interface SearchResult {
  id: string;
  type: "guest" | "booking" | "room";
  label: string;
  subLabel: string;
  url: string;
}

// ── Props ──────────────────────────────────────────────────────

interface GlobalSearchProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ── Component ───────────────────────────────────────────────────

export function GlobalSearch({ open, onOpenChange }: GlobalSearchProps) {
  const router = useRouter();
  const { orgId } = useAuth();
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<SearchResult[]>([]);
  const [searching, setSearching] = React.useState(false);

  // Debounced search
  React.useEffect(() => {
    if (!query.trim() || !orgId) {
      setResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const supabase = createClient();
        const q = query.trim().toLowerCase();

        // Resolve hotel ID
        const { data: hotel } = await supabase
          .from("hotels")
          .select("id")
          .eq("clerk_org_id", orgId)
          .single();

        if (!hotel) {
          setSearching(false);
          return;
        }

        const hotelId = hotel.id;
        const allResults: SearchResult[] = [];

        // Search guests
        const { data: guests } = await supabase
          .from("guests")
          .select("id, full_name, email, phone")
          .eq("hotel_id", hotelId)
          .or(`full_name.ilike.%${q}%,email.ilike.%${q}%,phone.ilike.%${q}%`)
          .limit(5);

        for (const guest of guests || []) {
          allResults.push({
            id: `guest-${guest.id}`,
            type: "guest",
            label: guest.full_name,
            subLabel: guest.email || guest.phone || "Guest",
            url: `/dashboard/customers`,
          });
        }

        // Search bookings by reference
        if (q.length >= 2) {
          const { data: bookings } = await supabase
            .from("bookings")
            .select("id, reference")
            .eq("hotel_id", hotelId)
            .ilike("reference", `%${q}%`)
            .limit(5);

          for (const booking of bookings || []) {
            allResults.push({
              id: `booking-${booking.id}`,
              type: "booking",
              label: `Booking ${booking.reference}`,
              subLabel: "Booking",
              url: `/dashboard/bookings`,
            });
          }
        }

        // Search rooms
        const { data: rooms } = await supabase
          .from("rooms")
          .select("id, room_number")
          .eq("hotel_id", hotelId)
          .ilike("room_number", `%${q}%`)
          .limit(5);

        for (const room of rooms || []) {
          allResults.push({
            id: `room-${room.id}`,
            type: "room",
            label: `Room ${room.room_number}`,
            subLabel: "Room",
            url: `/dashboard/rooms/directory`,
          });
        }

        setResults(allResults.slice(0, 10));
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 300); // 300ms debounce

    return () => clearTimeout(timer);
  }, [query, orgId]);

  const handleSelect = React.useCallback(
    (result: SearchResult) => {
      onOpenChange(false);
      setQuery("");
      setResults([]);
      router.push(result.url);
    },
    [router, onOpenChange]
  );

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        placeholder="Search guests, bookings, rooms..."
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        {searching && query.trim() && results.length === 0 && (
          <div className="py-6 text-center text-sm text-muted-foreground">
            Searching...
          </div>
        )}
        <CommandEmpty>No results found.</CommandEmpty>
        {results.length > 0 && (
          <CommandGroup heading="Results">
            {results.map((result) => (
              <CommandItem
                key={result.id}
                onSelect={() => handleSelect(result)}
              >
                {result.type === "guest" && (
                  <Users className="size-3.5 text-muted-foreground" />
                )}
                {result.type === "booking" && (
                  <CalendarDays className="size-3.5 text-muted-foreground" />
                )}
                {result.type === "room" && (
                  <BedDouble className="size-3.5 text-muted-foreground" />
                )}
                <span>{result.label}</span>
                <span className="ml-auto text-xs text-muted-foreground capitalize">
                  {result.subLabel}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        <CommandGroup heading="Quick actions">
          <CommandItem
            onSelect={() => {
              onOpenChange(false);
              router.push("/dashboard/bookings/new");
            }}
          >
            <CalendarDays className="size-3.5" />
            New Booking
          </CommandItem>
          <CommandItem
            onSelect={() => {
              onOpenChange(false);
              router.push("/dashboard");
            }}
          >
            <SearchIcon className="size-3.5" />
            Go to Dashboard
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
