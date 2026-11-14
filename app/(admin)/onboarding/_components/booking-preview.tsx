"use client";

import { useSyncExternalStore } from "react";
import { WindowView } from "@/components/brand/window-view";

const noopSubscribe = () => () => {};

/** "https://example.com/" → "example.com", so the preview reads like an address bar. */
function displayHost(raw: string) {
  return raw.replace(/^[a-z]+:\/\//i, "").replace(/\/+$/, "");
}

/**
 * Live preview of the guest booking page, built from what the owner has typed
 * so far. It shows the payoff of the form: the page guests will book on.
 * Decorative (aria-hidden): every value is already in a labelled field.
 */
export function BookingPreview({
  name,
  hotelType,
  rooms,
  city,
  country,
  phone,
  email,
  slug,
  step,
}: {
  name: string;
  hotelType: string;
  rooms: number;
  city: string;
  country: string;
  phone: string;
  email: string;
  slug: string;
  step: number;
}) {
  // The configured booking domain, else this site's host. The server snapshot
  // never reads `window`, so server and client agree on the first frame.
  const configured = process.env.NEXT_PUBLIC_BASE_DOMAIN ?? "";
  const host = useSyncExternalStore(
    noopSubscribe,
    () => displayHost(configured || window.location.host),
    () => displayHost(configured),
  );
  const place = [city, country].filter(Boolean).join(", ");

  return (
    <aside className="ob-preview" aria-hidden="true">
      <div className="ob-preview-device">
        <div className="ob-preview-url">
          {host || "oriel"}/<strong>{slug || "your-property"}</strong>
        </div>

        <div className="ob-preview-cover">
          <WindowView className="ob-preview-art" />
          <span className="ob-preview-cover-note">Your photos go here</span>
        </div>

        <div className="ob-preview-body">
          <div>
            <p className="ob-preview-kicker">
              {hotelType || "Hotel"}
              {place ? ` · ${place}` : ""}
            </p>
            <p className="ob-preview-title" data-empty={name ? undefined : "true"}>
              {name || "Your property"}
            </p>
          </div>

          <div className="ob-preview-search">
            <span>Choose your dates</span>
            <span className="ob-preview-book">Check availability</span>
          </div>

          <p className="ob-preview-meta">
            {rooms} {rooms === 1 ? "room" : "rooms"} · Mobile money and card
          </p>

          <div className="ob-preview-contact" data-on={step >= 2 ? "true" : undefined}>
            <span>{phone || "Phone"}</span>
            <span>{email || "Email"}</span>
          </div>
        </div>
      </div>
      <p className="ob-preview-label">This is the page guests will book on. It fills in as you type.</p>
    </aside>
  );
}
