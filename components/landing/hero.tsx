import Link from "next/link";
import { DemoPlayer } from "@/components/landing/demo-player";

export function Hero() {
  return (
    <section className="lp-section relative overflow-hidden">
      <div className="lp-container flex flex-col items-center pt-6 text-center md:pt-14">
        <h1 className="lp-display max-w-3xl">
          Run your whole hotel from one calendar.
        </h1>
        <p className="lp-lead mt-5 max-w-xl">
          Rooms, bookings and mobile money in one place, so the front desk
          never misses a guest.
        </p>
        <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row">
          <Link
            href="/onboarding"
            className="button button--primary inline-flex h-11 items-center rounded-lg px-6 text-[15px] font-semibold"
          >
            Start your free trial
          </Link>
          <a
            href="#demo"
            className="button button--ghost inline-flex h-11 items-center rounded-lg px-6 text-[15px] font-medium"
          >
            See how it works
          </a>
        </div>
        <p className="lp-micro mt-5">
          Works offline. Settles in cedis. 14-day free trial.
        </p>
      </div>

      <div className="lp-container mt-12 md:mt-16">
        <div id="demo" className="scroll-mt-24">
          <DemoPlayer />
        </div>
      </div>
    </section>
  );
}
