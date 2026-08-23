"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@heroui/react";
import { Phone } from "lucide-react";

interface BookingSiteHeaderProps {
  slug: string;
  hotelName: string;
  logoUrl?: string | null;
  phone?: string | null;
  /** `hero` = transparent over cover, solidifies on scroll. `solid` = always sticky chrome. */
  variant?: "hero" | "solid";
}

export function BookingSiteHeader({
  slug,
  hotelName,
  logoUrl,
  phone,
  variant = "hero",
}: BookingSiteHeaderProps) {
  const router = useRouter();
  const [scrolled, setScrolled] = React.useState(false);

  React.useEffect(() => {
    if (variant !== "hero") return;

    const onScroll = () => {
      setScrolled(window.scrollY > 48);
    };

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [variant]);

  const solid = variant === "solid" || scrolled;
  const monogram = hotelName.trim().charAt(0).toUpperCase() || "H";

  return (
    <header
      data-solid={solid ? "true" : "false"}
      className={[
        "fixed top-0 inset-x-0 z-40",
        "pt-[env(safe-area-inset-top)]",
        solid ? "booking-header" : "booking-header-hero",
      ].join(" ")}
    >
      <div className="booking-safe-x mx-auto flex h-12 max-w-6xl items-center justify-between gap-2 sm:gap-3">
        {/* Brand */}
        <Link
          href={`/${slug}`}
          className="group flex min-w-0 max-w-[min(70%,18rem)] items-center gap-2 sm:max-w-none touch-manipulation"
          aria-label={`${hotelName} home`}
        >
          {logoUrl ? (
            <Image
              src={logoUrl}
              alt=""
              width={32}
              height={32}
              className={[
                "size-7 sm:size-8 shrink-0 rounded-lg object-cover",
                "ring-1 transition-[box-shadow,ring-color]",
                solid
                  ? "ring-[var(--bk-line)] shadow-sm"
                  : "ring-white/25 shadow-[0_1px_8px_rgb(0_0_0/0.2)]",
              ].join(" ")}
            />
          ) : (
            <span
              aria-hidden
              className={[
                "flex size-7 sm:size-8 shrink-0 items-center justify-center rounded-lg",
                "booking-heading text-sm font-semibold",
                solid
                  ? "bg-[var(--bk-ink)] text-[var(--bk-on-ink)]"
                  : "bg-white/15 text-white ring-1 ring-white/25 backdrop-blur-sm",
              ].join(" ")}
            >
              {monogram}
            </span>
          )}
          <span
            className={[
              "booking-heading truncate text-sm sm:text-[15px] transition-colors",
              solid ? "text-[var(--bk-ink)]" : "text-white drop-shadow-sm",
            ].join(" ")}
          >
            {hotelName}
          </span>
        </Link>

        {/* Actions */}
        <div className="flex shrink-0 items-center gap-0.5 sm:gap-1.5">
          <nav
            aria-label="Hotel"
            className="hidden items-center gap-0.5 sm:flex"
          >
            <Link
              href={`/${slug}/rooms`}
              className={[
                "rounded-lg px-2.5 py-1.5 text-sm font-medium transition-colors touch-manipulation",
                solid
                  ? "text-[var(--bk-ink-soft)] hover:bg-[var(--bk-surface-soft)] hover:text-[var(--bk-ink)]"
                  : "text-white/80 hover:bg-white/10 hover:text-white",
              ].join(" ")}
            >
              Rooms
            </Link>
            {phone && (
              <a
                href={`tel:${phone}`}
                className={[
                  "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium transition-colors touch-manipulation",
                  solid
                    ? "text-[var(--bk-ink-soft)] hover:bg-[var(--bk-surface-soft)] hover:text-[var(--bk-ink)]"
                    : "text-white/80 hover:bg-white/10 hover:text-white",
                ].join(" ")}
              >
                <Phone className="size-3.5 opacity-80" strokeWidth={1.75} />
                <span className="hidden lg:inline">{phone}</span>
                <span className="lg:hidden">Call</span>
              </a>
            )}
          </nav>

          {phone && (
            <a
              href={`tel:${phone}`}
              aria-label={`Call ${hotelName}`}
              className={[
                "inline-flex size-8 items-center justify-center rounded-full sm:hidden touch-manipulation transition-colors",
                solid
                  ? "text-[var(--bk-ink-soft)] hover:bg-[var(--bk-surface-soft)]"
                  : "text-white/90 hover:bg-white/10",
              ].join(" ")}
            >
              <Phone className="size-4" strokeWidth={1.75} />
            </a>
          )}

          <Button
            variant="primary"
            size="sm"
            aria-label={`Book a stay at ${hotelName}`}
            onPress={() => router.push(`/${slug}/book`)}
            className={[
              "h-8 min-h-8 px-3.5 sm:px-4 rounded-full text-sm font-semibold",
              "touch-manipulation shadow-none",
              solid
                ? "booking-cta"
                : "booking-cta booking-cta-on-hero",
            ].join(" ")}
          >
            Book now
          </Button>
        </div>
      </div>
    </header>
  );
}
