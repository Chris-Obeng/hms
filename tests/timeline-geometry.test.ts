import { describe, expect, it } from "vitest";
import { bookingGeometry, columnToDate, dateToColumn, rangeOverlaps } from "@/app/dashboard/calendar/_components/timeline/timeline-geometry";
import { validateTimelineDrop } from "@/app/dashboard/calendar/_components/timeline/timeline-conflicts";

const booking = { id:"b1",reference:"R1",guestName:"Ama",guestPhone:null,guestEmail:null,roomId:null,roomNumber:null,roomTypeId:"rt1",roomTypeName:"Deluxe",checkIn:"2026-07-02",checkOut:"2026-07-05",nights:3,status:"confirmed",paymentStatus:"paid",source:"direct",totalAmount:10,adults:1,children:0,estimatedArrival:null,specialRequests:null };
const room = { id:"r1",roomNumber:"101",floor:null,status:"available",roomTypeId:"rt1",roomTypeName:"Deluxe",roomTypeSlug:"deluxe",roomTypeSortOrder:0,roomTypeBasePrice:10 };

describe("timeline geometry",()=>{
  it("maps date and column both ways",()=>{expect(dateToColumn("2026-07-05","2026-07-02")).toBe(3);expect(columnToDate(3,"2026-07-02")).toBe("2026-07-05")});
  it("positions half-open booking bar",()=>{expect(bookingGeometry("2026-07-02","2026-07-05","2026-07-01")).toMatchObject({column:1,nights:3,width:270})});
  it("allows adjacent ranges",()=>expect(rangeOverlaps("2026-07-02","2026-07-04","2026-07-04","2026-07-06")).toBe(false));
  it("detects overlap",()=>expect(rangeOverlaps("2026-07-02","2026-07-05","2026-07-04","2026-07-06")).toBe(true));
});
describe("timeline validation",()=>{
  it("rejects maintenance and type mismatch",()=>{expect(validateTimelineDrop({booking,room:{...room,status:"maintenance"},checkIn:"2026-07-02",checkOut:"2026-07-05",bookings:[],blocks:[]})).toContain("maintenance");expect(validateTimelineDrop({booking,room:{...room,roomTypeId:"rt2"},checkIn:"2026-07-02",checkOut:"2026-07-05",bookings:[],blocks:[]})).toContain("mismatch")});
  it("rejects exact-range block",()=>expect(validateTimelineDrop({booking,room,checkIn:"2026-07-02",checkOut:"2026-07-05",bookings:[],blocks:[{id:"x",roomId:"r1",startDate:"2026-07-03",endDate:"2026-07-04",reason:"maintenance",notes:null}]})).toContain("blocked"));
  it("rejects past check-in unless manual-like or checked_in",()=>{
    expect(validateTimelineDrop({booking,room,checkIn:"2026-07-01",checkOut:"2026-07-03",bookings:[],blocks:[],today:"2026-07-02"})).toContain("past");
    expect(validateTimelineDrop({booking:{...booking,status:"checked_in"},room,checkIn:"2026-07-01",checkOut:"2026-07-03",bookings:[],blocks:[],today:"2026-07-02"})).toBeNull();
    expect(validateTimelineDrop({booking:{...booking,source:"walk_in"},room,checkIn:"2026-07-01",checkOut:"2026-07-03",bookings:[],blocks:[],today:"2026-07-02"})).toBeNull();
    expect(validateTimelineDrop({booking,room,checkIn:"2026-07-02",checkOut:"2026-07-05",bookings:[],blocks:[],today:"2026-07-02"})).toBeNull();
  });
});
