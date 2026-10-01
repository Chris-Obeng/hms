export interface HotelNotifyConfig {
  hotelName: string;
  currency: string;
}

export interface BookingNotifyData {
  guestName: string;
  guestEmail: string | null | undefined;
  reference: string;
  roomName: string;
  /**
   * Per-room lines of a multi-room reservation (one entry per room, in booking
   * order). Absent for a single-room booking, where `roomName` is the whole
   * story.
   */
  rooms?: { name: string; occupancy: string }[];
  checkIn: string;
  checkOut: string;
  nights: number;
  totalAmount: number;
  checkInTime?: string | null;
  checkOutTime?: string | null;
  hotelAddress?: string | null;
  hotelPhone?: string | null;
}
