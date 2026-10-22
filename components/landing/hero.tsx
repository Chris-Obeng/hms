import Image from "next/image";
import { ArrowDown, Building2, House, Hotel } from "lucide-react";
import { ActionLink } from "./action-link";

export function Hero() {
  return (
    <section className="rl-hero" aria-labelledby="hero-heading">
      <div className="rl-container rl-hero-shell">
        <div className="rl-hero-copy">
          <p className="rl-kicker"><span aria-hidden="true" /> Hotel operations for independent stays</p>
          <h1 id="hero-heading" className="rl-hero-title">Make every stay <em>feel considered.</em></h1>
          <p className="rl-description">RoomLine brings reservations, rooms, payments, and people into one calm place to work.</p>
          <div className="rl-actions">
            <ActionLink />
            <a href="#how-it-works" className="rl-text-link">See the approach <ArrowDown size={16} aria-hidden="true" /></a>
          </div>
          <ul className="rl-hero-proof" aria-label="RoomLine is built for">
            <li><Hotel size={17} aria-hidden="true" /> Hotels</li>
            <li><House size={17} aria-hidden="true" /> Guesthouses</li>
            <li><Building2 size={17} aria-hidden="true" /> Boutique stays</li>
          </ul>
        </div>
        <figure className="rl-hero-visual">
          <Image
            src="/images/landing/hotel-exterior.jpg"
            alt="A warmly lit hotel beside a reflective pool at dusk"
            fill
            priority
            sizes="(max-width: 800px) 100vw, 58vw"
          />
          <figcaption className="rl-hero-visual-caption">
            <span className="rl-visual-label">RoomLine / Front desk</span>
            <strong>More clarity at the door.</strong>
            <span>Reservations, rooms, and payments in step.</span>
          </figcaption>
        </figure>
      </div>
      <div className="rl-container rl-hero-footnote">
        <span>Built for hospitality teams who know every guest by name.</span>
        <span>Ghana · West Africa</span>
      </div>
    </section>
  );
}
