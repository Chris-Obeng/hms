import type { createClient } from "@/lib/supabase/server";
import { captureSupabaseError } from "@/lib/observability/sentry";
import { NIGHT_AUDIT_SETUP_ERROR, readNightAuditSummary, validateAuditDate } from "./summary";

type Client = Awaited<ReturnType<typeof createClient>>;
type RpcResult = { data: unknown; error: { message: string; code?: string } | null };
const MISSING_SCHEMA = new Set(["PGRST202", "PGRST205", "42883", "42P01"]);

/** Required persistence path. Never use the generic best-effort audit logger. */
export async function requestNightAudit(
  supabase: Client,
  hotelId: string,
  request: { close: boolean; date?: string; notes?: string },
) {
  if (request.date !== undefined) validateAuditDate(request.date);
  if (request.close && request.date === undefined) throw new Error("A business date is required to close.");
  if (request.notes !== undefined && (typeof request.notes !== "string" || request.notes.length > 1000)) {
    throw new Error("Notes must be text of at most 1000 characters.");
  }
  // Generated remote types predate this forward migration. Keep the typed RPC
  // seam local until db:types is regenerated against the migrated database.
  const rpc = supabase.rpc.bind(supabase) as unknown as (
    name: "get_night_audit_summary" | "close_night_audit",
    args: { p_hotel_id: string; p_business_date: string | null; p_notes?: string | null },
  ) => PromiseLike<RpcResult>;
  const name = request.close ? "close_night_audit" : "get_night_audit_summary";
  const { data, error } = await rpc(name, {
    p_hotel_id: hotelId,
    p_business_date: request.date ?? null,
    ...(request.close ? { p_notes: request.notes?.trim() || null } : {}),
  });
  if (error) {
    if (MISSING_SCHEMA.has(error.code ?? "")) throw new Error(NIGHT_AUDIT_SETUP_ERROR);
    captureSupabaseError(error, name, { hotelId, tags: { "action.name": "night-audit" } });
    if (["22023", "23514", "42501"].includes(error.code ?? "")) throw new Error(error.message);
    throw new Error("Night Audit could not confirm a durable result. Refresh this business date to check its receipt before retrying.");
  }
  const summary = readNightAuditSummary(data);
  if (request.date !== undefined && summary.auditDate !== request.date) throw new Error("Night Audit returned a different business date.");
  if (request.close && (!summary.isClosed || !summary.closeId)) throw new Error("Night Audit did not confirm a persisted close. Refresh to check its status.");
  return summary;
}
