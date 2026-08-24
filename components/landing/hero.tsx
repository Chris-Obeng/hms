import Link from "next/link";
import { DemoPlayer } from "@/components/landing/demo-player";

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.015]"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, var(--color-ivory) 1px, transparent 0)",
          backgroundSize: "40px 40px",
        }}
        aria-hidden="true"
      />
      <div className="relative mx-auto max-w-6xl px-5 pb-16 pt-14 sm:pt-20 lg:px-8">
        <div className="grid items-center gap-10 lg:grid-cols-12 lg:gap-8">
          <div className="max-w-xl lg:col-span-5">
            <h1 className="text-[2.1rem] font-extrabold leading-[1.08] tracking-tight sm:text-5xl">
              Run your whole hotel from one screen.
            </h1>
            <p className="mt-5 max-w-md text-base leading-relaxed text-ivory/55 sm:text-lg">
              Bookings, payments, housekeeping and night audit in one place — built for hotels
              in Ghana, priced for the way you already work.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/onboarding"
                className="inline-flex h-12 items-center justify-center rounded-xl bg-gold px-7 text-base font-semibold text-forest transition-transform hover:-translate-y-px active:translate-y-0 active:scale-[0.99]"
              >
                Set up your hotel
              </Link>
              <a
                href="#demo"
                className="inline-flex h-12 items-center justify-center rounded-xl border border-ivory/15 px-7 text-base font-medium text-ivory/75 transition-colors hover:bg-ivory/[0.04] hover:text-ivory"
              >
                See it work
              </a>
            </div>
            <p className="mt-6 text-sm text-ivory/40">
              Set up takes minutes — you see exact pricing before you commit.
            </p>
          </div>

          <div id="demo" className="scroll-mt-24 lg:col-span-7">
            <DemoPlayer />
          </div>
        </div>
      </div>
    </section>
  );
}
