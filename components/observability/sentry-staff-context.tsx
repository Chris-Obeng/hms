"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

/**
 * Attaches the signed-in staff member's tenant scope to every client-side Sentry
 * event for the rest of the session.
 *
 * Mounted from the dashboard layout, which already resolves this data for its
 * access gates. Without it, a browser error carries no tenant — and "one hotel is
 * broken" looks identical to "everyone is broken" in the issue stream.
 *
 * Ids and role only. No name, email or phone: `sendDefaultPii` stays off.
 *
 * The tenant tags are set and cleared together with the user. Clearing matters
 * because these tags live on a scope that outlives the component: after a client
 * -side navigation out of the dashboard — the org switcher, or a staff member
 * opening their own hotel's public booking page in the same tab — an error raised
 * on the next page would otherwise still be tagged with the hotel and org of the
 * dashboard session that unmounted, which is worse than carrying no tenant at all.
 */
export function SentryStaffContext({
  hotelId,
  orgId,
  staffId,
  role,
}: {
  hotelId: string;
  orgId: string;
  staffId: string;
  role?: string | null;
}) {
  useEffect(() => {
    Sentry.setUser({ id: staffId });
    Sentry.setTags({
      "hotel.id": hotelId,
      "org.id": orgId,
      ...(role ? { "staff.role": role } : {}),
    });

    return () => {
      Sentry.setUser(null);
      // `undefined` is how a tag is removed — the scope has no delete, and an
      // undefined value is dropped when the envelope is serialised. Every key set
      // above is listed, including `staff.role` when no role was set, so a
      // remount with a different role cannot leave the old one behind.
      Sentry.setTags({
        "hotel.id": undefined,
        "org.id": undefined,
        "staff.role": undefined,
      });
    };
  }, [hotelId, orgId, staffId, role]);

  return null;
}
