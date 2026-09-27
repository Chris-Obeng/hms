import { Lock, RefreshCw, WifiOff } from "lucide-react";
import { Reveal, Stagger, StaggerItem } from "@/components/landing/reveal";

/* Trust/security — guest PII and payment data live here, so this is a real
 * section: encryption, backups, reliability. No decorative badges, no
 * fabricated logos or stats. Placeholders are clearly marked. */

const POINTS = [
  {
    icon: Lock,
    title: "Guest data stays private",
    body: "Encrypted in transit and at rest. Role-based access means reception sees the desk, not the vault — every view of PII is access-logged.",
  },
  {
    icon: RefreshCw,
    title: "Backed up, exportable, yours",
    body: "Nightly encrypted backups with point-in-time recovery. Export every guest, booking and payment any time — no lock-in, no ransom.",
  },
  {
    icon: WifiOff,
    title: "Works when the wifi doesn't",
    body: "A dropped connection never stops check-in. The desk keeps running locally and syncs the moment you're back online.",
  },
] as const;

export function Security() {
  return (
    <section id="security" aria-labelledby="security-heading" className="lp-section scroll-mt-24 border-t border-[var(--lp-line-strong)]">
      <div className="lp-container">
        <Reveal className="max-w-2xl">
          <p className="lp-eyebrow">05 · Trust & security</p>
          <h2 id="security-heading" className="lp-h2 mt-4">
            Guest PII and payment data live here. We treat it that way.
          </h2>
        </Reveal>
        <Stagger className="mt-10 grid gap-px overflow-hidden rounded-xl border border-[var(--lp-line)] bg-[var(--lp-line)] md:grid-cols-3" step={70}>
          {POINTS.map((p) => (
            <StaggerItem key={p.title} className="bg-[var(--lp-surface)] p-7">
              <span className="flex size-9 items-center justify-center rounded-md border border-[var(--lp-line)] bg-[var(--lp-paper)] text-[var(--lp-brand)]" aria-hidden>
                <p.icon size={17} strokeWidth={1.5} />
              </span>
              <h3 className="lp-h3 mt-4 text-[1.2rem]">{p.title}</h3>
              <p className="lp-body mt-2 text-[0.92rem]">{p.body}</p>
            </StaggerItem>
          ))}
        </Stagger>
        <Reveal delay={120}>
          <p className="lp-index mt-8">
            [Placeholder — customer logos and independent audit report will sit here. No names shown until we have written permission.]
          </p>
        </Reveal>
      </div>
    </section>
  );
}
