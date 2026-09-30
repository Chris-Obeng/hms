import Image from "next/image";
import { ArrowDown, ArrowRight, Check, CornerDownRight } from "lucide-react";
import hotelExterior from "@/public/images/landing/hotel-exterior.jpg";

export function Hero() {
  return (
    <section className="lp-hero" aria-labelledby="hero-heading">
      <div className="lp-container lp-hero-intro">
        <div>
          <p className="lp-eyebrow"><span className="lp-brand-line" />Property management, thoughtfully connected</p>
          <h1 id="hero-heading">Your hotel.<br /><span>Perfectly in sync.</span></h1>
        </div>
        <div className="lp-hero-copy">
          <p>Reservations, rooms, payments, and people. One considered system for the way your hotel runs.</p>
          <div className="lp-hero-actions">
            <a href="#demo" className="lp-btn lp-btn--primary">Book a demo<ArrowRight size={17} aria-hidden="true" /></a>
            <a href="#platform" className="lp-text-link">Explore the platform<ArrowDown size={16} aria-hidden="true" /></a>
          </div>
        </div>
      </div>
      <div className="lp-container">
        <div className="lp-hero-scene">
          <Image src={hotelExterior} alt="A warmly lit hotel and quiet pool at dusk" fill preload sizes="(max-width: 767px) 100vw, (max-width: 1440px) 94vw, 1344px" className="lp-hero-photo" placeholder="blur" />
          <div className="lp-photo-caption"><span>Made for the people</span><strong>behind every great stay.</strong></div>
          <div className="lp-day-card">
            <div className="lp-day-card-heading"><span className="lp-mini-mark" aria-hidden="true">r.</span><span>The Palm House<small>Illustrative property</small></span><span className="lp-status"><Check size={12} aria-hidden="true" />All in view</span></div>
            <div className="lp-day-title"><h2>A good day, at a glance.</h2><span>Tuesday, 29 September</span></div>
            <dl className="lp-day-metrics"><div><dt>Occupancy</dt><dd>83<span>%</span></dd></div><div><dt>Arrivals</dt><dd>08</dd></div><div><dt>Departures</dt><dd>05</dd></div></dl>
            <div className="lp-day-event"><span className="lp-event-icon"><Check size={16} aria-hidden="true" /></span><span><strong>Room 204 is ready</strong><small>Inspected. Ready for the next arrival.</small></span></div>
            <a href="#platform" className="lp-day-link">Take a look inside<ArrowRight size={16} aria-hidden="true" /></a>
          </div>
          <div className="lp-scene-label"><CornerDownRight size={14} aria-hidden="true" />Hospitality in focus. Operations in order.</div>
        </div>
        <div className="lp-property-strip"><p>Independent spirit.<br /><strong>Professional operations.</strong></p><div><span>Boutique hotels</span><span>City hotels</span><span>Resorts & retreats</span><span>Guesthouses</span></div></div>
      </div>
    </section>
  );
}
