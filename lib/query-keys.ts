export const qk = {
  dashboard: (orgId: string, hotelId: string, dateStr: string) => ['dashboard', orgId, hotelId, dateStr] as const,
  rooms: (orgId: string, hotelId: string) => ['rooms', orgId, hotelId] as const,
  roomTypes: (orgId: string, hotelId: string) => ['roomTypes', orgId, hotelId] as const,
  calendar: (orgId: string, hotelId: string, startDate: string, days: number) => ['calendar', orgId, hotelId, startDate, days] as const,
  staff: (orgId: string) => ['staff', orgId] as const,
  staffProfile: (orgId: string, userId: string) => ['staffProfile', orgId, userId] as const,
  pendingStaff: (orgId: string) => ['pendingStaff', orgId] as const,
  notifications: (orgId: string, hotelId: string) => ['notifications', orgId, hotelId] as const,
  payments: (orgId: string, hotelId: string) => ['payments', orgId, hotelId] as const,
  pricingSeasons: (orgId: string, hotelId: string) => ['pricing', 'seasons', orgId, hotelId] as const,
  pricingResolved: (orgId: string, hotelId: string, roomTypeIds: string[], startDate: string, endDate: string) => ['pricing', 'resolved', orgId, hotelId, roomTypeIds, startDate, endDate] as const,
  pricingOccupancy: (orgId: string, hotelId: string, startDate: string, endDate: string) => ['pricing', 'occupancy', orgId, hotelId, startDate, endDate] as const,
};
