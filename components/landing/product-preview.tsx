"use client";

import { useState } from "react";
import { Button, Tabs } from "@heroui/react";
import { ArrowDownLeft, ArrowRight, ArrowUpRight, BedDouble, CalendarDays, ChartNoAxesCombined, Check, ChevronRight, CircleCheck, CreditCard, DoorOpen, RotateCcw, Users } from "lucide-react";

type Booking = {
  id: string;
  guest: string;
  room: string;
  roomType: string;
  start: number;
  nights: number;
  dates: string;
  total: number;
  paid: number;
  status: "In house" | "Arriving today" | "Confirmed";
};

const bookings: Booking[] = [
  { id: "RL-2041", guest: "Daniel Asante", room: "101", roomType: "Classic king", start: 1, nights: 3, dates: "28 Sep – 1 Oct", total: 2850, paid: 2850, status: "In house" },
  { id: "RL-2042", guest: "Ama Mensah", room: "102", roomType: "Garden deluxe", start: 2, nights: 3, dates: "29 Sep – 2 Oct", total: 3600, paid: 3600, status: "Arriving today" },
  { id: "RL-2043", guest: "Sofia Laurent", room: "103", roomType: "Classic king", start: 1, nights: 2, dates: "28 – 30 Sep", total: 1900, paid: 950, status: "In house" },
  { id: "RL-2044", guest: "Kwame Osei", room: "104", roomType: "Garden deluxe", start: 4, nights: 3, dates: "1 – 4 Oct", total: 3600, paid: 1800, status: "Confirmed" },
  { id: "RL-2045", guest: "Isabel Costa", room: "105", roomType: "Classic king", start: 1, nights: 4, dates: "28 Sep – 2 Oct", total: 3800, paid: 3800, status: "In house" },
  { id: "RL-2046", guest: "Nana Boateng", room: "201", roomType: "Palm suite", start: 3, nights: 4, dates: "30 Sep – 4 Oct", total: 7200, paid: 3600, status: "Confirmed" },
  { id: "RL-2047", guest: "Oliver Chen", room: "202", roomType: "Palm suite", start: 1, nights: 3, dates: "28 Sep – 1 Oct", total: 5400, paid: 5400, status: "In house" },
];
const rooms = ["101", "102", "103", "104", "105", "106", "201", "202"];
const days = ["Mon 28", "Tue 29", "Wed 30", "Thu 01", "Fri 02", "Sat 03", "Sun 04"];
const views = [
  { id: "front-desk", label: "Front desk", icon: CalendarDays, description: "Every stay, in the right place. Select a reservation to see the details." },
  { id: "rooms", label: "Rooms", icon: BedDouble, description: "Know what’s ready before your next guest arrives. Filter the room directory below." },
  { id: "payments", label: "Guest folios", icon: CreditCard, description: "Follow every charge and payment. Select a folio to see how the balance adds up." },
  { id: "reporting", label: "Reporting", icon: ChartNoAxesCombined, description: "Understand the shape of your business, one well-run day at a time." },
] as const;
const currency = new Intl.NumberFormat("en-GH", { style: "currency", currency: "GHS", maximumFractionDigits: 0 });
const money = (value: number) => currency.format(value);

function BookingDetail({ booking, checkedIn, onCheckIn }: { booking: Booking; checkedIn: boolean; onCheckIn: () => void }) {
  const status = checkedIn ? "In house" : booking.status;
  return (
    <aside className="lp-booking-detail" aria-label="Selected reservation">
      <div className="lp-detail-kicker"><span>Reservation details</span><span>{booking.id}</span></div>
      <span className="lp-guest-avatar" aria-hidden="true">{booking.guest.split(" ").map((part) => part[0]).join("")}</span>
      <h4>{booking.guest}</h4>
      <span className={`lp-status ${status === "Arriving today" ? "lp-status--arrival" : ""}`}><span aria-hidden="true">{status === "In house" ? "✓" : "•"}</span>{status}</span>
      <dl><div><dt>Room</dt><dd>{booking.room} · {booking.roomType}</dd></div><div><dt>Stay</dt><dd>{booking.dates}</dd></div><div><dt>Duration</dt><dd>{booking.nights} nights · 2 guests</dd></div><div><dt>Total</dt><dd>{money(booking.total)}</dd></div></dl>
      <div className="lp-detail-balance"><span>Balance due</span><strong>{money(booking.total - booking.paid)}</strong></div>
      {booking.status === "Arriving today" ? <Button onPress={onCheckIn} isDisabled={checkedIn} className="lp-btn lp-btn--primary lp-preview-action">{checkedIn ? <><Check size={16} aria-hidden="true" />Guest checked in</> : <>Try check-in<ArrowRight size={16} aria-hidden="true" /></>}</Button> : <p className="lp-detail-note">{status === "In house" ? "This guest is already checked in." : "This reservation is confirmed for a future arrival."}</p>}
      <p className="lp-detail-hint">Sample reservation · Explore freely</p>
    </aside>
  );
}

function ReservationBoard({ selected, onSelect, checkedIn, onCheckIn }: { selected: Booking; onSelect: (booking: Booking) => void; checkedIn: boolean; onCheckIn: () => void }) {
  return (
    <div className="lp-reservation-layout">
      <div className="lp-reservation-main">
        <div className="lp-board-title"><div><h3>Reservation calendar</h3><p>28 September – 4 October, 2026</p></div><span className="lp-today-label">Today · 29 Sep</span></div>
        <div className="lp-calendar-scroll" tabIndex={0} role="region" aria-label="Reservation calendar, scroll horizontally to see all dates">
          <div className="lp-calendar">
            <div className="lp-calendar-head"><span>Room</span>{days.map((day, i) => <span key={day} className={i === 1 ? "lp-calendar-today" : undefined}>{day.split(" ")[0]}<b>{day.split(" ")[1]}</b></span>)}</div>
            {rooms.map((room) => {
              const booking = bookings.find((item) => item.room === room);
              const status = booking?.id === "RL-2042" && checkedIn ? "In house" : booking?.status;
              return <div className="lp-calendar-row" key={room}><div className="lp-room-label"><span>{room}</span><BedDouble size={13} aria-hidden="true" /></div><div className="lp-room-track">{days.map((day, i) => <span className={i === 1 ? "lp-calendar-cell lp-calendar-today" : "lp-calendar-cell"} key={day} aria-hidden="true" />)}{booking ? <button type="button" className={`lp-reservation lp-reservation--${status === "In house" ? "staying" : status === "Arriving today" ? "arriving" : "confirmed"}`} style={{ gridColumn: `${booking.start} / span ${booking.nights}` }} aria-pressed={selected.id === booking.id} aria-label={`${booking.guest}, room ${room}, ${booking.dates}, ${status}`} onClick={() => onSelect(booking)}><span>{booking.guest}</span><small>{status === "In house" ? <Check size={11} aria-hidden="true" /> : <ArrowDownLeft size={11} aria-hidden="true" />}{status}</small></button> : <span className="lp-room-available">Available for your next guest</span>}</div></div>;
            })}
          </div>
        </div>
        <div className="lp-calendar-legend"><span><i className="lp-legend-staying" />In house</span><span><i className="lp-legend-arriving" />Arriving today</span><span><i className="lp-legend-confirmed" />Confirmed</span><span>8 of 24 rooms shown</span></div>
      </div>
      <BookingDetail booking={selected} checkedIn={selected.id === "RL-2042" && checkedIn} onCheckIn={onCheckIn} />
    </div>
  );
}

function RoomDirectory({ checkedIn }: { checkedIn: boolean }) {
  const [filter, setFilter] = useState("All rooms");
  const roomData = rooms.map((room) => {
    const booking = bookings.find((item) => item.room === room);
    const occupied = booking?.status === "In house" || (room === "102" && checkedIn);
    return { room, type: booking?.roomType ?? "Classic king", status: occupied ? "Occupied" : room === "106" ? "To clean" : "Ready", guest: occupied ? booking?.guest : null };
  });
  const shown = roomData.filter((room) => filter === "All rooms" || room.status === filter);
  return <div className="lp-directory"><div className="lp-board-title"><div><h3>Room directory</h3><p>A sample of your property, room by room.</p></div></div><div className="lp-room-filters" role="group" aria-label="Filter rooms by status">{["All rooms", "Ready", "Occupied", "To clean"].map((item) => <Button key={item} variant="ghost" className="lp-filter" aria-pressed={filter === item} onPress={() => setFilter(item)}>{item}<span>{item === "All rooms" ? roomData.length : roomData.filter((room) => room.status === item).length}</span></Button>)}</div><div className="lp-room-grid">{shown.map((room) => <article className="lp-room-card" key={room.room}><div><BedDouble size={21} strokeWidth={1.5} aria-hidden="true" /><span className={`lp-status ${room.status === "To clean" ? "lp-status--arrival" : ""}`}>{room.status === "Ready" && <Check size={12} aria-hidden="true" />}{room.status}</span></div><h4>Room {room.room}</h4><p>{room.type}</p><span className="lp-room-guest">{room.guest ?? (room.status === "Ready" ? "Ready for arrival" : "Checkout clean required")}</span></article>)}</div><p className="lp-directory-summary" role="status">Showing {shown.length} of 8 sample rooms.</p></div>;
}

function GuestFolios() {
  const [selected, setSelected] = useState(bookings[2]);
  return <div className="lp-folios-layout"><div><div className="lp-board-title"><div><h3>Guest folios</h3><p>Charges, payments, and a balance that makes sense.</p></div></div><div className="lp-folio-list">{bookings.slice(0, 5).map((booking) => <button type="button" className="lp-folio-row" key={booking.id} onClick={() => setSelected(booking)} aria-pressed={selected.id === booking.id}><span className="lp-folio-initial" aria-hidden="true">{booking.guest[0]}</span><span><strong>{booking.guest}</strong><small>Room {booking.room} · {booking.id}</small></span><span className={booking.total === booking.paid ? "lp-folio-settled" : ""}><strong>{money(booking.total - booking.paid)}</strong><small>{booking.total === booking.paid ? "Settled" : "Outstanding"}</small></span><ChevronRight size={16} aria-hidden="true" /></button>)}</div></div><aside className="lp-folio-detail" aria-label="Selected guest folio"><p className="lp-eyebrow">Guest statement</p><h4>{selected.guest}</h4><p>Room {selected.room} · {selected.dates}</p><div className="lp-statement-line"><span>Accommodation<small>{selected.nights} nights × {money(selected.total / selected.nights)}</small></span><strong>{money(selected.total)}</strong></div><div className="lp-statement-line"><span>Payment received<small>Recorded against this folio</small></span><strong>−{money(selected.paid)}</strong></div><div className="lp-statement-total"><span>Balance due</span><strong>{money(selected.total - selected.paid)}</strong></div><p className="lp-statement-note"><CircleCheck size={17} aria-hidden="true" />{selected.total === selected.paid ? "All charges covered. This folio is settled." : "The remaining balance stays visible until it is paid."}</p></aside></div>;
}

const reportPeriods = {
  "This week": { revenue: 142800, occupancy: "83%", adr: 1020, labels: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"], values: [15300, 20400, 18360, 22440, 24480, 23460, 18360] },
  "Last week": { revenue: 130560, occupancy: "79%", adr: 980, labels: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"], values: [13720, 16660, 18620, 20580, 22540, 20580, 17760] },
} as const;

function Reporting() {
  const [period, setPeriod] = useState<keyof typeof reportPeriods>("This week");
  const report = reportPeriods[period];
  return <div className="lp-report"><div className="lp-board-title"><div><h3>Property performance</h3><p>Illustrative weekly report · The Palm House</p></div><div className="lp-room-filters" role="group" aria-label="Report period">{(Object.keys(reportPeriods) as Array<keyof typeof reportPeriods>).map((item) => <Button key={item} variant="ghost" className="lp-filter" aria-pressed={period === item} onPress={() => setPeriod(item)}>{item}</Button>)}</div></div><dl className="lp-report-metrics"><div><dt>Room revenue</dt><dd>{money(report.revenue)}</dd></div><div><dt>Average occupancy</dt><dd>{report.occupancy}</dd></div><div><dt>Average daily rate</dt><dd>{money(report.adr)}</dd></div></dl><div className="lp-chart" role="img" aria-label={`${period} room revenue: ${report.labels.map((day, i) => `${day} ${money(report.values[i])}`).join(", ")}`}><div className="lp-chart-grid" aria-hidden="true"><span>GHS 25k</span><span>GHS 15k</span><span>GHS 5k</span></div><div className="lp-chart-bars" aria-hidden="true">{report.values.map((value, i) => <div className="lp-chart-column" key={report.labels[i]}><span>{money(value)}</span><div className="lp-chart-bar-space"><div className="lp-chart-bar" style={{ height: `${value / 26000 * 100}%` }} /></div><span>{report.labels[i]}</span></div>)}</div></div><p className="lp-directory-summary">Sample report · Revenue shown in Ghana cedis (GHS)</p></div>;
}

export function ProductPreview() {
  const [view, setView] = useState("front-desk");
  const [selected, setSelected] = useState(bookings[1]);
  const [checkedIn, setCheckedIn] = useState(false);
  const [announcement, setAnnouncement] = useState("");

  function checkIn() {
    setCheckedIn(true);
    setAnnouncement("Ama Mensah is checked in to room 102. Arrivals updated to 7, in-house rooms to 21. This is a sample interaction.");
  }

  function reset() {
    setCheckedIn(false);
    setSelected(bookings[1]);
    setView("front-desk");
    setAnnouncement("Preview reset. Ama Mensah is ready for check-in again.");
  }

  return (
    <Tabs className="lp-product-tabs" selectedKey={view} onSelectionChange={(key) => setView(String(key))}>
      <div className="lp-preview-navigation"><Tabs.ListContainer><Tabs.List aria-label="Explore RoomLine features">{views.map(({ id, label, icon: Icon }) => <Tabs.Tab id={id} key={id} className="lp-product-tab"><Icon size={17} strokeWidth={1.7} aria-hidden="true" />{label}<Tabs.Indicator /></Tabs.Tab>)}</Tabs.List></Tabs.ListContainer><span className="lp-interactive-label"><span />Interactive product preview</span></div>
      <div className="lp-product-window"><div className="lp-product-topbar"><div><span className="lp-mini-mark" aria-hidden="true">r.</span><strong>The Palm House</strong><span className="lp-sample-label">Sample property</span></div><Button variant="ghost" className="lp-reset" onPress={reset}><RotateCcw size={14} aria-hidden="true" />Reset preview</Button></div>
        <div className="lp-product-context"><p>{views.find((item) => item.id === view)?.description}</p><span>Tuesday, 29 September</span></div>
        <div className="lp-overview-stats"><div><DoorOpen size={18} strokeWidth={1.5} aria-hidden="true" /><span>Arrivals</span><strong>{checkedIn ? "07" : "08"}</strong></div><div><ArrowUpRight size={18} strokeWidth={1.5} aria-hidden="true" /><span>Departures</span><strong>05</strong></div><div><Users size={18} strokeWidth={1.5} aria-hidden="true" /><span>In house</span><strong>{checkedIn ? "21" : "20"}<small>/ 24</small></strong></div><div><ChartNoAxesCombined size={18} strokeWidth={1.5} aria-hidden="true" /><span>Occupancy</span><strong>{checkedIn ? "88" : "83"}<small>%</small></strong></div></div>
        <Tabs.Panel id="front-desk" className="lp-product-panel"><ReservationBoard selected={selected} onSelect={setSelected} checkedIn={checkedIn} onCheckIn={checkIn} /></Tabs.Panel>
        <Tabs.Panel id="rooms" className="lp-product-panel"><RoomDirectory checkedIn={checkedIn} /></Tabs.Panel>
        <Tabs.Panel id="payments" className="lp-product-panel"><GuestFolios /></Tabs.Panel>
        <Tabs.Panel id="reporting" className="lp-product-panel"><Reporting /></Tabs.Panel>
      </div>
      <p className="lp-sr-only" role="status">{announcement}</p>
    </Tabs>
  );
}
