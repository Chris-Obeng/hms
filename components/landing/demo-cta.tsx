"use client";

import { useState } from "react";
import Link from "next/link";
import { Magnetic, Reveal } from "@/components/landing/reveal";

/* CTA/demo — direct. Request a demo or start a trial, with a short form.
 * The form is honest: it opens a mailto with the details prefilled, so no
 * demo request ever disappears into a void. */

export function DemoCta() {
  const [name, setName] = useState("");
  const [property, setProperty] = useState("");
  const [rooms, setRooms] = useState("");
  const [contact, setContact] = useState("");
  const href = `mailto:hello@roomline.app?subject=${encodeURIComponent(
    `Demo request — ${property || "my property"}`
  )}&body=${encodeURIComponent(
    `Name: ${name}\nProperty: ${property}\nRooms: ${rooms}\nContact: ${contact}\n\nWe'd like a 20-minute walkthrough of RoomLine.`
  )}`;

  const input =
    "min-h-[3rem] w-full rounded-lg border border-[var(--lp-line)] bg-[var(--lp-surface)] px-3.5 text-[0.95rem] text-[var(--lp-ink)] placeholder:text-[var(--lp-faint)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--lp-brand)]";
  const label = "lp-index mb-2 block";

  return (
    <section id="demo" className="lp-section scroll-mt-24 border-t border-[var(--lp-line-strong)]">
      <div className="lp-container grid gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16">
        <Reveal>
          <p className="lp-eyebrow">06 · Request a demo</p>
          <h2 className="lp-h2 mt-4">See your property on RoomLine in 20 minutes.</h2>
          <p className="lp-lead mt-4">
            A walkthrough on your rooms and your rates — or skip the call and
            start the 14-day trial now.
          </p>
          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <Magnetic>
              <Link href="/onboarding" className="lp-btn lp-btn--solid">
                Start free trial
                <span className="lp-arrow" aria-hidden>→</span>
              </Link>
            </Magnetic>
            <a href={href} className="lp-btn lp-btn--ghost">
              Send demo request
            </a>
          </div>
          <p className="lp-index mt-6">No card required · Replies within one business day</p>
        </Reveal>
        <Reveal delay={120}>
          <form
            className="rounded-xl border border-[var(--lp-line)] bg-[var(--lp-surface)] p-6 sm:p-8"
            onSubmit={(e) => {
              e.preventDefault();
              window.location.href = href;
            }}
          >
            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <label htmlFor="demo-name" className={label}>Your name</label>
                <input id="demo-name" className={input} placeholder="Ama Serwaa" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div>
                <label htmlFor="demo-property" className={label}>Property name</label>
                <input id="demo-property" className={input} placeholder="Meridian Hotel" autoComplete="organization" value={property} onChange={(e) => setProperty(e.target.value)} />
              </div>
              <div>
                <label htmlFor="demo-rooms" className={label}>Rooms</label>
                <input id="demo-rooms" className={input} placeholder="52" inputMode="numeric" value={rooms} onChange={(e) => setRooms(e.target.value)} />
              </div>
              <div>
                <label htmlFor="demo-contact" className={label}>Email or phone</label>
                <input id="demo-contact" className={input} placeholder="ama@meridian.com" autoComplete="email" value={contact} onChange={(e) => setContact(e.target.value)} />
              </div>
            </div>
            <button type="submit" className="lp-btn lp-btn--solid mt-6 w-full">
              Request a demo
              <span className="lp-arrow" aria-hidden>→</span>
            </button>
            <p className="lp-index mt-4 text-center">Prefer to talk? hello@roomline.app</p>
          </form>
        </Reveal>
      </div>
    </section>
  );
}
