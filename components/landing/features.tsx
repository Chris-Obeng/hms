"use client";

import type { ReactNode } from "react";
import { Tabs } from "@heroui/react";

/**
 * A short product tour in tabs (after Squarespace's "Grow your business"):
 * one colour field per part of the day, each with a small piece of the
 * product. Fragments are decorative (aria-hidden); the copy carries meaning.
 */
type Stop = {
  id: string;
  tab: string;
  tone: "lagoon" | "sun" | "dusk" | "ink" | "laterite";
  title: string;
  body: string;
  fragment: ReactNode;
};

const STOPS: Stop[] = [
  {
    id: "calendar",
    tab: "Calendar",
    tone: "lagoon",
    title: "One calendar, no double bookings",
    body: "Walk-ins, phone calls, WhatsApp and web bookings land on the same live calendar. A room can't be sold twice.",
    fragment: (
      <ul className="rl-frag rl-frag-list">
        {[
          ["Walk-in", "Efua Mensah", "Room 101"],
          ["WhatsApp", "Kojo Badu", "Room 204"],
          ["Booking page", "Nana Yaa Asare", "Room 202"],
          ["Phone", "Daniel Okafor", "Room 102"],
        ].map(([source, guest, room]) => (
          <li key={guest}>
            <span className="rl-frag-chip">{source}</span>
            <span className="rl-frag-strong">{guest}</span>
            <span className="rl-frag-muted">{room}</span>
          </li>
        ))}
      </ul>
    ),
  },
  {
    id: "payments",
    tab: "Payments",
    tone: "sun",
    title: "Every cedi on one bill",
    body: "Mobile money and card online, cash and transfer at the desk. Each payment lands on the guest's folio in GHS.",
    fragment: (
      <ul className="rl-frag rl-frag-list">
        {[
          ["MTN MoMo", "Online", "GHS 1,350"],
          ["Visa", "Online", "GHS 900"],
          ["Cash", "Taken by Esi", "GHS 450"],
          ["Bank transfer", "Taken by Kojo", "GHS 2,100"],
        ].map(([method, who, amount]) => (
          <li key={method}>
            <span className="rl-frag-paid" aria-hidden="true" />
            <span className="rl-frag-strong">
              {method} <span className="rl-frag-muted">· {who}</span>
            </span>
            <span className="rl-frag-amount">{amount}</span>
          </li>
        ))}
      </ul>
    ),
  },
  {
    id: "booking-page",
    tab: "Booking page",
    tone: "dusk",
    title: "Your own booking page",
    body: "Share one link on WhatsApp, Instagram and Google Maps. Guests pick a room, pay online and get a confirmation.",
    fragment: (
      <div className="rl-frag rl-frag-page">
        <div className="rl-frag-url">book.labadicourtyard.com</div>
        {[
          ["Deluxe room", "GHS 450 a night · Breakfast"],
          ["Family room", "GHS 680 a night · Sleeps 4"],
        ].map(([room, meta]) => (
          <div key={room} className="rl-frag-room">
            <div>
              <div className="rl-frag-strong">{room}</div>
              <div className="rl-frag-muted">{meta}</div>
            </div>
            <span className="rl-frag-button">Book</span>
          </div>
        ))}
      </div>
    ),
  },
  {
    id: "night-audit",
    tab: "Night audit",
    tone: "ink",
    title: "Close the day in one click",
    body: "The night audit checks every payment, locks the day and shows occupancy and revenue before you go home.",
    fragment: (
      <div className="rl-frag rl-frag-dark">
        <p className="rl-frag-head">Friday 14 Nov</p>
        <ul className="rl-frag-list">
          {[
            ["Payments matched", "42 of 42"],
            ["Rooms sold", "18 of 24"],
            ["Revenue", "GHS 12,480"],
          ].map(([k, v]) => (
            <li key={k}>
              <span className="rl-frag-check" aria-hidden="true">
                ✓
              </span>
              <span className="rl-frag-strong">{k}</span>
              <span className="rl-frag-amount">{v}</span>
            </li>
          ))}
        </ul>
        <p className="rl-frag-done">Day closed · 23:58</p>
      </div>
    ),
  },
  {
    id: "team",
    tab: "Team",
    tone: "laterite",
    title: "A team that sees what it should",
    body: "Owner, manager, front desk and view-only roles. Every change is logged with a name and a time.",
    fragment: (
      <div className="rl-frag">
        <ul className="rl-frag-list">
          {[
            ["AM", "Akua Mensah", "Owner"],
            ["KA", "Kojo Asare", "Manager"],
            ["EO", "Esi Owusu", "Front desk"],
          ].map(([initials, name, role]) => (
            <li key={name}>
              <span className="rl-frag-avatar">{initials}</span>
              <span className="rl-frag-strong">{name}</span>
              <span className="rl-frag-muted">{role}</span>
            </li>
          ))}
        </ul>
        <p className="rl-frag-log">Kojo changed the Deluxe rate · 09:42</p>
      </div>
    ),
  },
];

export function Features() {
  return (
    <section id="features" data-tone="paper" className="rl-section" aria-labelledby="features-heading">
      <div className="rl-wrap">
        <div className="rl-tour-head" data-reveal="">
          <h2 id="features-heading" className="rl-h2 rl-r">
            The whole day, on one&nbsp;screen.
          </h2>
          <p className="rl-lead rl-muted rl-r">From the first booking to the night audit.</p>
        </div>

        <Tabs className="rl-tour" defaultSelectedKey="calendar">
          <Tabs.ListContainer className="rl-tour-tabs">
            <Tabs.List aria-label="Parts of the day">
              {STOPS.map((s) => (
                <Tabs.Tab key={s.id} id={s.id} className="rl-tour-tab">
                  {s.tab}
                  <Tabs.Indicator className="rl-tour-indicator" />
                </Tabs.Tab>
              ))}
            </Tabs.List>
          </Tabs.ListContainer>
          {STOPS.map((s) => (
            <Tabs.Panel key={s.id} id={s.id} className={`rl-tour-panel rl-card--${s.tone}${s.tone === "ink" ? " rl-on-ink" : ""}`}>
              <div className="rl-tour-copy">
                <h3 className="rl-tour-title">{s.title}</h3>
                <p className="rl-tour-body">{s.body}</p>
              </div>
              <div className="rl-tour-frag" aria-hidden="true">
                {s.fragment}
              </div>
            </Tabs.Panel>
          ))}
        </Tabs>
      </div>
    </section>
  );
}
