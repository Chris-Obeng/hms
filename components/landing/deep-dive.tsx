import Image from "next/image";
import { ArrowRight, BedDouble, Check, CreditCard, DoorOpen } from "lucide-react";
import hotelSuite from "@/public/images/landing/hotel-suite.jpg";

const moments = [
  { icon: DoorOpen, title: "A warmer welcome. A calmer desk.", body: "Find the reservation, confirm the room, and check in your guest. Keep the conversation on their stay." },
  { icon: BedDouble, title: "The right room, ready at the right time.", body: "Room status and availability sit together. See what is occupied, what needs attention, and what is ready." },
  { icon: CreditCard, title: "Every charge has its place.", body: "Room charges, payments, and outstanding balances stay connected to the guest’s folio." },
];

export function DeepDive() {
  return (
    <section id="hospitality" className="lp-section lp-hospitality" aria-labelledby="hospitality-heading">
      <div className="lp-container lp-hospitality-grid">
        <div className="lp-suite-scene"><Image src={hotelSuite} alt="A carefully prepared hotel suite with natural wood and garden views" fill sizes="(max-width: 767px) 90vw, 48vw" placeholder="blur" /><div className="lp-suite-note"><span className="lp-note-check"><Check size={19} aria-hidden="true" /></span><div><strong>Everything in its place.</strong><span>More time for the details guests remember.</span></div></div></div>
        <div className="lp-hospitality-copy"><p className="lp-eyebrow">Less administration. More hospitality.</p><h2 id="hospitality-heading">Give your guests<br />your full attention.</h2><div className="lp-moments">{moments.map(({ icon: Icon, title, body }) => <article key={title}><Icon size={22} strokeWidth={1.5} aria-hidden="true" /><div><h3>{title}</h3><p>{body}</p></div></article>)}</div><a className="lp-text-link" href="#demo">Make room for a better working day<ArrowRight size={17} aria-hidden="true" /></a></div>
      </div>
    </section>
  );
}
