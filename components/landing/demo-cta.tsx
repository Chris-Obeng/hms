"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowRight, Check, Mail } from "lucide-react";
import { Button } from "@heroui/react";

export function DemoCta() {
  const [prepared, setPrepared] = useState(false);
  const [draft, setDraft] = useState("");

  function prepareEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const body = `Hello RoomLine,\n\nI'd like a walkthrough for my property.\n\nName: ${data.get("name")}\nWork email: ${data.get("email")}\nProperty: ${data.get("property")}\nNumber of rooms: ${data.get("rooms")}\n\nPlease get in touch to arrange a demo.`;
    const href = `mailto:hello@roomline.app?subject=${encodeURIComponent(`RoomLine demo — ${data.get("property")}`)}&body=${encodeURIComponent(body)}`;
    setDraft(href);
    setPrepared(true);
    window.location.href = href;
  }

  return (
    <section id="demo" className="lp-section lp-demo-section" aria-labelledby="demo-heading">
      <div className="lp-container lp-demo-grid"><div className="lp-demo-copy"><p className="lp-eyebrow">Let’s make room</p><h2 id="demo-heading">A better day<br />starts here.</h2><p>Tell us a little about your property. We’ll walk through the details that matter to you.</p><a href="mailto:hello@roomline.app" className="lp-contact-link"><Mail size={18} aria-hidden="true" />hello@roomline.app</a><div className="lp-self-start"><span>Prefer to explore on your own?</span><Link href="/onboarding" className="lp-text-link">Get started<ArrowRight size={16} aria-hidden="true" /></Link></div></div>
        <form className="lp-demo-form" onSubmit={prepareEmail} onChange={() => setPrepared(false)}><h3>A closer look at RoomLine</h3><p>A conversation about your hotel, your team, and your day.</p><div className="lp-form-grid"><div><label htmlFor="demo-name">Your name</label><input id="demo-name" name="name" autoComplete="name" required maxLength={100} placeholder="Full name" /></div><div><label htmlFor="demo-email">Work email</label><input id="demo-email" name="email" type="email" autoComplete="email" required maxLength={254} placeholder="you@yourhotel.com" /></div><div><label htmlFor="demo-property">Property name</label><input id="demo-property" name="property" autoComplete="organization" required maxLength={150} placeholder="Your hotel" /></div><div><label htmlFor="demo-rooms">Number of rooms</label><select id="demo-rooms" name="rooms" defaultValue="" required><option value="" disabled>Select a range</option><option>1–20</option><option>21–50</option><option>51–100</option><option>101–250</option><option>251+</option></select></div></div><Button type="submit" className="lp-btn lp-btn--primary lp-submit">Prepare demo email<ArrowRight size={17} aria-hidden="true" /></Button><p className="lp-form-note">Opens your email app with your details. Review and send to request a demo.</p><div aria-live="polite">{prepared && <div className="lp-form-confirmation"><Check size={18} aria-hidden="true" /><p>Your email draft is ready. Send it from your email app to complete your request. <a href={draft}>Open draft again</a>, or email hello@roomline.app directly.</p></div>}</div></form>
      </div>
    </section>
  );
}
