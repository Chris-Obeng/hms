"use client";

/**
 * Live preview of the guest booking page, built from what the owner has typed
 * so far. Decorative (aria-hidden): every value is already in a labelled field.
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
  const host =
    process.env.NEXT_PUBLIC_BASE_DOMAIN ?? (typeof window !== "undefined" ? window.location.host : "oriel");
  const title = name || "Your property";
  const place = [city, country].filter(Boolean).join(", ");
  const initial = (name.trim().charAt(0) || "O").toUpperCase();

  return (
    <aside className="ob-preview" aria-hidden="true">
      <p className="ob-preview-label">Your booking page, as guests will see it</p>
      <div className="ob-preview-device">
        <div className="ob-preview-url">
          <span className="ob-preview-lock" />
          {host}/{slug || "your-property"}
        </div>
        <div className="ob-preview-cover">
          <span className="ob-preview-initial">{initial}</span>
        </div>
        <div className="ob-preview-body">
          <p className="ob-preview-kicker">
            {hotelType || "Hotel"}
            {place ? ` · ${place}` : ""}
          </p>
          <p className="ob-preview-title" data-empty={name ? undefined : "true"}>
            {title}
          </p>

          <div className="ob-preview-dates">
            <div>
              <span>Check-in</span>
              <strong>Fri 14 Nov</strong>
            </div>
            <div>
              <span>Check-out</span>
              <strong>Sun 16 Nov</strong>
            </div>
          </div>

          <div className="ob-preview-room">
            <div>
              <strong>Choose a room</strong>
              <span>
                {rooms} {rooms === 1 ? "room" : "rooms"} on your calendar
              </span>
            </div>
            <span className="ob-preview-book">Book</span>
          </div>

          <div className="ob-preview-contact" data-on={step >= 2 ? "true" : undefined}>
            <span>{phone || "Phone number"}</span>
            <span>{email || "Booking email"}</span>
          </div>
        </div>
      </div>
      <p className="ob-preview-note">Guests pay with mobile money or card. You can add photos and rates next.</p>
    </aside>
  );
}
