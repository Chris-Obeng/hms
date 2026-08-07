"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { addDays, format, parseISO, subDays } from "date-fns";
import { ArrowLeft, ArrowRight, CalendarDays, RefreshCw, Search } from "lucide-react";
import { Button as HeroButton, Input as HeroInput, Popover, toast } from "@heroui/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/client";
import { deleteDailyRateOverride, getResolvedRates, upsertDailyRateOverride, type ResolvedPriceCell as ResolvedRate } from "@/app/actions/pricing";
import "./availability.css";

export type AvailabilityMatrixData = {
  hotelId: string; hotelName: string; currency: string; startDate: string; days: number; dates: string[];
  roomTypes: { id: string; name: string; slug: string; basePrice: number; sortOrder: number }[];
  totals: MatrixTotalCell[]; roomTypeRows: RoomTypeAvailabilityRow[]; roomRows: RoomAvailabilityRow[]; generatedAt: string;
};
type MatrixTotalCell = { date: string; totalRooms: number; available: number; sold: number; occupancy: number };
type RoomTypeAvailabilityRow = { id: string; name: string; basePrice: number; roomCount: number; cells: RoomTypeAvailabilityCell[] };
type RoomTypeAvailabilityCell = { date: string; totalRooms: number; available: number; assigned: number; blocked: number; unsaleable: number; unassignedDemand: number; arrivals: number; departures: number; occupancy: number };
type RoomAvailabilityRow = { id: string; roomNumber: string; floor: string | null; status: string; roomTypeId: string; roomTypeName: string; cells: RoomAvailabilityCell[] };
type RoomAvailabilityCell = { date: string; state: "open" | "reserved" | "in_house" | "blocked" | "unsaleable"; label: string; reference: string | null; arrival: boolean; departure: boolean };
export function AvailabilityMatrixClient({ data, hotelId }: { data: AvailabilityMatrixData; hotelId: string }) {
  const router = useRouter(); const qc = useQueryClient();
  const [query, setQuery] = React.useState("");
  const [editing, setEditing] = React.useState<{ roomTypeId: string; date: string } | null>(null); const [price, setPrice] = React.useState("");
  const [liveStatus, setLiveStatus] = React.useState<"connecting" | "live">("connecting");
  const resolvedKey = React.useMemo(() => ["availability-rates", hotelId, data.startDate, data.days] as const, [hotelId, data.startDate, data.days]);
  const { data: rates = [], isLoading: ratesLoading } = useQuery({ queryKey: resolvedKey, queryFn: async () => { const r = await getResolvedRates(data.roomTypes.map((x) => x.id), data.startDate, format(addDays(parseISO(data.startDate), data.days - 1), "yyyy-MM-dd")); return r.success ? r.data : []; } });
  const rateMap = React.useMemo(() => new Map(rates.map((r) => [`${r.roomTypeId}_${r.date}`, r])), [rates]);
  const save = useMutation({
    mutationFn: async (v: { roomTypeId: string; date: string; price: number }) => { const r = await upsertDailyRateOverride(v.roomTypeId, v.date, v.price); if (!r.success) throw new Error("error" in r ? r.error : "Failed to save rate"); },
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: resolvedKey });
      const previous = qc.getQueryData<ResolvedRate[]>(resolvedKey);
      qc.setQueryData<ResolvedRate[]>(resolvedKey, (current = []) => current.map((cell) => cell.roomTypeId === v.roomTypeId && cell.date === v.date ? { ...cell, price: v.price, source: "daily" as const } : cell));
      setEditing(null);
      return { previous };
    },
    onError: (error, _v, context) => { if (context?.previous) qc.setQueryData(resolvedKey, context.previous); toast.danger(error instanceof Error ? error.message : "Could not save rate"); },
    onSettled: () => { qc.invalidateQueries({ queryKey: resolvedKey }); },
  });
  const clear = useMutation({
    mutationFn: async (v: { roomTypeId: string; date: string }) => { const r = await deleteDailyRateOverride(v.roomTypeId, v.date); if (!r.success) throw new Error("error" in r ? r.error : "Failed to clear rate override"); },
    onError: (error) => toast.danger(error instanceof Error ? error.message : "Could not clear rate override"),
    onSuccess: () => { setEditing(null); qc.invalidateQueries({ queryKey: resolvedKey }); },
  });
  React.useEffect(() => { const sb = createClient(); const ch = sb.channel(`hotel:${hotelId}:merged-inventory`).on("postgres_changes", { event: "*", schema: "public", table: "bookings", filter: `hotel_id=eq.${hotelId}` }, () => router.refresh()).on("postgres_changes", { event: "*", schema: "public", table: "daily_rate_overrides", filter: `hotel_id=eq.${hotelId}` }, () => qc.invalidateQueries({ queryKey: resolvedKey })).subscribe((s) => setLiveStatus(s === "SUBSCRIBED" ? "live" : "connecting")); return () => { sb.removeChannel(ch); }; }, [hotelId, router, qc, resolvedKey]);
  const start = parseISO(data.startDate); const todayKey = format(new Date(), "yyyy-MM-dd"); const grid = `220px repeat(${data.dates.length}, minmax(78px, 1fr))`;
  const filtered = data.roomTypeRows.filter((r) => !query.trim() || r.name.toLowerCase().includes(query.trim().toLowerCase()));
  const openEditor = (id: string, date: string) => { setEditing({ roomTypeId: id, date }); setPrice(String(rateMap.get(`${id}_${date}`)?.price ?? "")); };
  const navigate = (d: Date, days = data.days) => router.push(`/dashboard/availability?start=${format(d, "yyyy-MM-dd")}&days=${days}`);
  return <div className="availability-page -m-4 min-h-[calc(100vh-5rem)] bg-background p-4 md:-m-6 md:p-6 lg:-m-8 lg:p-8">
    <header className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between"><div><div className="mb-2 flex items-center gap-2"><Badge variant="outline" className="rounded-md text-[11px]"><span className={cn("mr-1.5 inline-block size-1.5 rounded-full", liveStatus === "live" ? "bg-emerald-500" : "bg-amber-400")} />{liveStatus === "live" ? "Live inventory" : "Connecting"}</Badge><span className="text-xs text-muted-foreground">Updated {format(parseISO(data.generatedAt), "MMM d, h:mm a")}</span></div><h1 className="text-page-title">Inventory</h1><p className="mt-1 text-sm text-muted-foreground">Availability and room rates · {format(start, "MMM d")} – {format(addDays(start, data.days - 1), "MMM d, yyyy")}</p></div><div className="flex flex-wrap items-center gap-2"><Button variant="outline" size="sm" onClick={() => navigate(subDays(start, 1))}><ArrowLeft className="size-3.5" />Prev</Button><Button variant="outline" size="sm" onClick={() => navigate(new Date())}><CalendarDays className="size-3.5" />Today</Button><Button variant="outline" size="sm" onClick={() => navigate(addDays(start, 1))}><ArrowRight className="size-3.5" />Next</Button><Button variant="outline" size="sm" onClick={() => router.refresh()}><RefreshCw className="size-3.5" />Refresh</Button></div></header>
    <section className="inventory-filters mb-5"><div className="inventory-filter-search"><label htmlFor="inventory-search">Room types</label><div className="relative"><Search className="absolute left-3 top-1/2 z-10 size-4 -translate-y-1/2 text-muted-foreground/60" /><HeroInput id="inventory-search" aria-label="Search room types" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter room types" className="h-10 pl-9" variant="secondary" /></div></div></section>
    <div className="availability-grid-shell overflow-x-auto"><DateHeader dates={data.dates} todayKey={todayKey} gridTemplateColumns={grid} /><div className="availability-grid-row availability-grid-total" style={{ gridTemplateColumns: grid }}><div className="availability-sticky-cell"><span className="text-xs font-semibold uppercase text-muted-foreground">All rooms</span><strong>Total inventory</strong></div>{data.totals.map((c) => <div key={c.date} className={cn("availability-total-cell", c.date === todayKey && "is-today")}><strong>{c.available}</strong><span>{c.occupancy}% sold</span></div>)}</div>{filtered.map((row) => <React.Fragment key={row.id}><div className="availability-grid-row availability-room-type-heading" style={{ gridTemplateColumns: grid }}><div className="availability-sticky-cell"><strong>{row.name}</strong><span>{row.roomCount} rooms</span></div>{row.cells.map((c) => <div key={c.date} className="availability-total-cell"><strong className={c.available === 0 ? "text-amber-600" : ""}>{c.available}</strong></div>)}</div><div className="availability-grid-row" style={{ gridTemplateColumns: grid }}><div className="availability-sticky-cell"><span className="text-xs font-semibold uppercase text-muted-foreground">Rates</span><strong>{row.name}</strong></div>{row.cells.map((c) => { const cell = rateMap.get(`${row.id}_${c.date}`); const active = editing?.roomTypeId === row.id && editing.date === c.date; const weekend = [0, 6].includes(parseISO(c.date).getDay()); return <div key={c.date} onClick={() => openEditor(row.id, c.date)} className={cn("availability-rate-cell cursor-pointer", c.date === todayKey && "is-today", weekend && "is-weekend", cell?.source === "daily" && "is-daily", cell?.source === "seasonal" && "is-seasonal", active && "ring-2 ring-primary z-10")}><strong>{ratesLoading ? "…" : cell?.price ?? row.basePrice}</strong>{cell?.source === "daily" && <span className="rate-dot" />}{active && <Popover isOpen={active} onOpenChange={(open) => !open && setEditing(null)}><Popover.Trigger><button type="button" aria-label={`Edit ${row.name} rate for ${c.date}`} className="absolute inset-0 h-full w-full cursor-pointer bg-transparent" /></Popover.Trigger><Popover.Content placement="bottom" offset={8} className="w-[220px] rounded-xl border border-border bg-background p-0 shadow-xl"><Popover.Arrow /><Popover.Dialog className="grid gap-2.5 p-3"><span className="text-xs font-semibold text-foreground">{row.name} · {format(parseISO(c.date), "MMM d")}</span><HeroInput type="number" min="0.01" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} autoFocus onKeyDown={(e) => { if (e.key === "Enter") { const n = Number(price); if (n > 0) save.mutate({ roomTypeId: row.id, date: c.date, price: n }); } if (e.key === "Escape") setEditing(null); }} /><div className="flex gap-1"><HeroButton size="sm" isPending={save.isPending} onPress={() => { const n = Number(price); if (n > 0) save.mutate({ roomTypeId: row.id, date: c.date, price: n }); }}>Save</HeroButton>{cell?.source === "daily" && <HeroButton size="sm" variant="danger" onPress={() => clear.mutate({ roomTypeId: row.id, date: c.date })}>Clear</HeroButton>}</div></Popover.Dialog></Popover.Content></Popover>}</div>; })}</div></React.Fragment>)}</div>
  </div>;
}

function DateHeader({ dates, todayKey, gridTemplateColumns }: { dates: string[]; todayKey: string; gridTemplateColumns: string }) { return <div className="availability-grid-row availability-date-header" style={{ gridTemplateColumns }}><div className="availability-sticky-cell availability-corner"><span>Room type / date</span></div>{dates.map((d) => { const p = parseISO(d); const weekend = [0, 6].includes(p.getDay()); return <div key={d} className={cn("availability-date-cell", d === todayKey && "is-today", weekend && "is-weekend")}><span>{format(p, "EEE")}</span><strong>{format(p, "d")}</strong><small>{format(p, "MMM")}</small></div>; })}</div>; }
