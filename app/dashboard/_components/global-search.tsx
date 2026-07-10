"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Users, CalendarDays, BedDouble, Search as SearchIcon, Loader2 } from "lucide-react";
import { searchGlobal, type SearchResult } from "@/app/actions/search";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

// ── Props ──────────────────────────────────────────────────────

interface GlobalSearchProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ── Component ───────────────────────────────────────────────────

export function GlobalSearch({ open, onOpenChange }: GlobalSearchProps) {
  const router = useRouter();
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<SearchResult[]>([]);
  const [searching, setSearching] = React.useState(false);

  // Debounced search via Server Action
  React.useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await searchGlobal(query);
        if (res.success) {
          setResults(res.data);
        } else {
          console.error("Search failed:", res.error);
          setResults([]);
        }
      } catch (err) {
        console.error("Search invocation error:", err);
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 300); // 300ms debounce

    return () => clearTimeout(timer);
  }, [query]);

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
        {searching && (
          <div className="flex items-center justify-center py-6 text-sm text-muted-foreground gap-2">
            <Loader2 className="size-4 animate-spin text-primary" />
            <span>Searching...</span>
          </div>
        )}
        {!searching && query.trim() && results.length === 0 && (
          <CommandEmpty>No results found.</CommandEmpty>
        )}
        {results.length > 0 && (
          <CommandGroup heading="Results">
            {results.map((result) => (
              <CommandItem
                key={result.id}
                onSelect={() => handleSelect(result)}
                className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-muted/50 rounded-md transition-colors"
              >
                {result.type === "guest" && (
                  <Users className="size-4 text-muted-foreground" />
                )}
                {result.type === "booking" && (
                  <CalendarDays className="size-4 text-muted-foreground" />
                )}
                {result.type === "room" && (
                  <BedDouble className="size-4 text-muted-foreground" />
                )}
                <span className="font-medium text-foreground">{result.label}</span>
                <span className="ml-auto text-xs text-muted-foreground">
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
              router.push("/dashboard/bookings?new=1");
            }}
            className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-muted/50 rounded-md transition-colors"
          >
            <CalendarDays className="size-4" />
            New Booking
          </CommandItem>
          <CommandItem
            onSelect={() => {
              onOpenChange(false);
              router.push("/dashboard");
            }}
            className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-muted/50 rounded-md transition-colors"
          >
            <SearchIcon className="size-4" />
            Go to Dashboard
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
