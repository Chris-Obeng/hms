import { Building2, Hotel, KeyRound, Palmtree } from "lucide-react";

/*
 * Proof strip — the property types RoomLine is built for, as a quiet band
 * between hero and platform. Icons carry the meaning; the words carry the
 * breadth. No logo wall we cannot back up.
 */

const PROPERTIES = [
  { icon: Hotel, label: "Boutique hotels" },
  { icon: Building2, label: "City hotels" },
  { icon: Palmtree, label: "Resorts" },
  { icon: KeyRound, label: "Guesthouses" },
] as const;

export function ProofStrip() {
  return (
    <section className="lp-strip" aria-label="Property types RoomLine supports">
      <div className="lp-container lp-strip-inner">
        <p>Built for</p>
        <ul>
          {PROPERTIES.map(({ icon: Icon, label }) => (
            <li key={label}>
              <Icon size={17} strokeWidth={1.6} aria-hidden="true" />
              {label}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
