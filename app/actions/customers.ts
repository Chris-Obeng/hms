"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireMinRole, toActionError } from "@/lib/auth";

// ── Schemas ──────────────────────────────────────────────────────────

const UpdateNotesSchema = z.object({
  notes: z.string().max(2000, "Notes must be under 2,000 characters").optional().or(z.literal("")),
});

const UpdateTagsSchema = z.object({
  tags: z.array(z.string().max(50)).max(20, "Maximum 20 tags allowed"),
});

const UpdateContactSchema = z.object({
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional().or(z.literal("")),
  nationalId: z.string().optional().or(z.literal("")),
  nationality: z.string().optional().or(z.literal("")),
});

// ── Guest Search (booking autocomplete) ──────────────────────────────

export interface GuestSearchResult {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  nationality: string | null;
}

/**
 * Strips LIKE wildcards (`%` `_`) and the PostgREST quoting chars (`"` `\`) from
 * a typeahead term, so it matches literally inside a double-quoted `.or()` value.
 * Commas, dots, parens and colons are left in — the double quotes make them
 * literal — which is what keeps a value like an email or `+233…` phone working
 * without the `.or()` filter injection the availability route documents.
 */
function toGuestSearchTerm(query: string): string | null {
  const cleaned = query.trim().replace(/[%_"\\]/g, " ").replace(/\s+/g, " ").trim();
  return cleaned.length >= 2 ? cleaned : null;
}

export async function searchGuests(
  query: string
): Promise<{ success: true; data: GuestSearchResult[] } | { success: false; error: string }> {
  try {
    const { hotelId } = await requireMinRole("front_desk", "search guests");

    const term = toGuestSearchTerm(query);
    if (!term) return { success: true, data: [] };

    const supabase = await createClient();

    // Value is double-quoted so commas/dots/parens inside a name, email or phone
    // are literal, not filter separators.
    const pattern = `"%${term}%"`;
    const { data, error } = await supabase
      .from("guests")
      .select("id, full_name, email, phone, nationality")
      .eq("hotel_id", hotelId)
      .or(`full_name.ilike.${pattern},email.ilike.${pattern},phone.ilike.${pattern}`)
      .order("last_stay_date", { ascending: false, nullsFirst: false })
      .limit(8);

    if (error) {
      return { success: false, error: error.message };
    }

    const results: GuestSearchResult[] = (data || []).map((g) => ({
      id: g.id,
      fullName: g.full_name,
      email: g.email,
      phone: g.phone,
      nationality: g.nationality,
    }));

    return { success: true, data: results };
  } catch (err) {
    return toActionError(err, { action: "customers.searchGuests" });
  }
}

// ── Get Guest Bookings ───────────────────────────────────────────────

export interface GuestBookingSummary {
  id: string;
  reference: string;
  checkIn: string;
  checkOut: string;
  nights: number | null;
  status: string;
  paymentStatus: string;
  totalAmount: number;
  amountPaid: number;
  source: string;
  roomTypeName: string | null;
  roomNumber: string | null;
  createdAt: string | null;
  /** NULL = single-room. Siblings share the anchor id; fold by this for display. */
  groupId: string | null;
  /** Same-type quantity on this line; total rooms = SUM(max(1, roomsCount)). */
  roomsCount: number;
}

export async function getGuestBookings(
  guestId: string
): Promise<{ success: true; data: GuestBookingSummary[] } | { success: false; error: string }> {
  try {
    const { hotelId } = await requireMinRole("front_desk", "view guest bookings");

    const supabase = await createClient();

    const { data: bookings, error } = await supabase
      .from("bookings")
      .select(
        `id, reference, check_in, check_out, nights, status, payment_status, total_amount, amount_paid, source, created_at, group_id, rooms_count, room_types(name), rooms(room_number)`
      )
      .eq("guest_id", guestId)
      .eq("hotel_id", hotelId)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      return { success: false, error: error.message };
    }

    const data: GuestBookingSummary[] = (bookings || []).map((b) => ({
      id: b.id,
      reference: b.reference,
      checkIn: b.check_in,
      checkOut: b.check_out,
      nights: b.nights,
      status: b.status || "",
      paymentStatus: b.payment_status || "",
      totalAmount: b.total_amount,
      amountPaid: b.amount_paid || 0,
      source: b.source || "",
      roomTypeName: b.room_types?.name || null,
      roomNumber: b.rooms?.room_number || null,
      createdAt: b.created_at,
      groupId: (b.group_id as string | null) ?? null,
      roomsCount: (b.rooms_count as number | null) ?? 1,
    }));

    return { success: true, data };
  } catch (err) {
    return toActionError(err, { action: "customers.getGuestBookings" });
  }
}

// ── Update Guest Notes ───────────────────────────────────────────────

export async function updateGuestNotes(
  guestId: string,
  input: z.infer<typeof UpdateNotesSchema>
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const { hotelId } = await requireMinRole("front_desk", "edit guest details");

    const parsed = UpdateNotesSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message || "Validation failed" };
    }

    const supabase = await createClient();

    const { data, error } = await supabase
      .from("guests")
      .update({ notes: parsed.data.notes || null })
      .eq("id", guestId)
      .eq("hotel_id", hotelId)
      .select("id");

    if (error) {
      return { success: false, error: error.message };
    }
    if (!data || data.length === 0) {
      return { success: false, error: "Guest not found" };
    }

    return { success: true };
  } catch (err) {
    return toActionError(err, { action: "customers.updateGuestNotes" });
  }
}

// ── Update Guest Tags ────────────────────────────────────────────────

export async function updateGuestTags(
  guestId: string,
  input: z.infer<typeof UpdateTagsSchema>
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const { hotelId } = await requireMinRole("front_desk", "edit guest details");

    const parsed = UpdateTagsSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message || "Validation failed" };
    }

    const supabase = await createClient();

    const { data, error } = await supabase
      .from("guests")
      .update({ tags: parsed.data.tags })
      .eq("id", guestId)
      .eq("hotel_id", hotelId)
      .select("id");

    if (error) {
      return { success: false, error: error.message };
    }
    if (!data || data.length === 0) {
      return { success: false, error: "Guest not found" };
    }

    return { success: true };
  } catch (err) {
    return toActionError(err, { action: "customers.updateGuestTags" });
  }
}

// ── Update Guest Contact ─────────────────────────────────────────────

export async function updateGuestContact(
  guestId: string,
  input: z.infer<typeof UpdateContactSchema>
): Promise<{ success: true } | { success: false; error: string; fieldErrors?: Record<string, string[]> }> {
  try {
    const { hotelId } = await requireMinRole("front_desk", "edit guest details");

    const parsed = UpdateContactSchema.safeParse(input);
    if (!parsed.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of parsed.error.issues) {
        const path = issue.path.join(".");
        if (!fieldErrors[path]) fieldErrors[path] = [];
        fieldErrors[path].push(issue.message);
      }
      return {
        success: false,
        error: "Validation failed",
        fieldErrors,
      };
    }

    const supabase = await createClient();

    const { data, error } = await supabase
      .from("guests")
      .update({
        ...(parsed.data.email !== undefined ? { email: parsed.data.email || null } : {}),
        ...(parsed.data.phone !== undefined ? { phone: parsed.data.phone || null } : {}),
        ...(parsed.data.nationalId !== undefined ? { national_id: parsed.data.nationalId || null } : {}),
        ...(parsed.data.nationality !== undefined ? { nationality: parsed.data.nationality || null } : {}),
      })
      .eq("id", guestId)
      .eq("hotel_id", hotelId)
      .select("id");

    if (error) {
      return { success: false, error: error.message };
    }
    if (!data || data.length === 0) {
      return { success: false, error: "Guest not found" };
    }

    return { success: true };
  } catch (err) {
    return toActionError(err, { action: "customers.updateGuestContact" });
  }
}
