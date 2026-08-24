import Link from "next/link";
import { Logo } from "@/components/landing/site-header";

export function SiteFooter() {
  return (
    <footer className="border-t border-ivory/[0.06]">
      <div className="mx-auto max-w-6xl px-5 py-12 lg:px-8">
        <div className="flex flex-col gap-10 sm:flex-row sm:justify-between">
          <div className="max-w-xs">
            <Link href="/" className="flex items-center gap-2.5" aria-label="RoomLine home">
              <Logo size={24} />
              <span className="text-[15px] font-bold tracking-tight text-ivory">RoomLine</span>
            </Link>
            <p className="mt-3 text-sm leading-relaxed text-ivory/40">
              Hotel management for guesthouses and hotels in Ghana and across
              Africa. Bookings, payments, housekeeping and night audit on one
              screen.
            </p>
          </div>

          <nav aria-label="Footer" className="grid grid-cols-2 gap-x-14 gap-y-2.5 text-sm">
            <div className="space-y-2.5">
              <p className="text-xs font-semibold uppercase tracking-wider text-ivory/30">Product</p>
              <a href="#how-it-works" className="block text-ivory/55 transition-colors hover:text-ivory">
                How it works
              </a>
              <a href="#see-it-work" className="block text-ivory/55 transition-colors hover:text-ivory">
                See it work
              </a>
              <Link href="/onboarding" className="block text-ivory/55 transition-colors hover:text-ivory">
                Set up your hotel
              </Link>
            </div>
            <div className="space-y-2.5">
              <p className="text-xs font-semibold uppercase tracking-wider text-ivory/30">For hotels</p>
              <Link href="/sign-in" className="block text-ivory/55 transition-colors hover:text-ivory">
                Sign in
              </Link>
              <a href="#demo" className="block text-ivory/55 transition-colors hover:text-ivory">
                Product demo
              </a>
            </div>
          </nav>
        </div>

        <div className="mt-12 flex flex-col gap-3 border-t border-ivory/[0.06] pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-ivory/30">
            © {new Date().getFullYear()} RoomLine. All rights reserved.
          </p>
          <p className="text-xs text-ivory/30">
            Payments processed by Paystack · Settled in GHS
          </p>
        </div>
      </div>
    </footer>
  );
}
