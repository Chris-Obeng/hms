export interface HotelNotifyConfig {
  hotelName: string;
  currency: string;
}

export interface BookingNotifyData {
  guestName: string;
  guestEmail: string | null | undefined;
  reference: string;
  roomName: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  totalAmount: number;
  checkInTime?: string | null;
  checkOutTime?: string | null;
  hotelAddress?: string | null;
  hotelPhone?: string | null;
}
