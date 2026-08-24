export interface HotelRow {
  id: string;
  name: string;
  slug: string;
  city: string | null;
  country: string | null;
  plan: string | null;
  status: string | null;
  currency: string;
  created_at: string;
  /** Sellable rooms configured (is_active). Null = no rooms set up yet. */
  totalRooms: number | null;
  /** Rooms currently marked occupied. */
  occupiedToday: number | null;
  /** Successful payment volume over the last 30 days, grouped per currency. */
  gmv: CurrencyTotal[];
  /** Unpaid balance across open bookings, grouped per currency. */
  outstanding: CurrencyTotal[];
}

export interface CurrencyTotal {
  currency: string;
  amount: number;
}

export interface KpiData {
  gmvByCurrency: CurrencyTotal[];
  feesByCurrency: CurrencyTotal[];
  activeHotels: number;
  pendingHotels: number;
}

export const HOTEL_STATUSES = ["active", "pending", "suspended", "cancelled"] as const;
export type HotelStatusFilter = (typeof HOTEL_STATUSES)[number];
