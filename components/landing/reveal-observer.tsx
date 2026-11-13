"use client";

import { useEffect } from "react";

/**
 * One observer for the whole page. Server-rendered blocks marked
 * `data-reveal` stay visible by default; after hydration, blocks that are
 * still below the fold are set to `pending` (hidden) and flip to `shown` as
 * they scroll in, which plays their CSS transitions. Nothing happens when the
 * visitor prefers reduced motion or IntersectionObserver is missing, so the
 * content never depends on this script.
 */
export function RevealObserver() {
  useEffect(() => {
    if (
      typeof IntersectionObserver === "undefined" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }

    const blocks = Array.from(
      document.querySelectorAll<HTMLElement>(".rl-landing [data-reveal]"),
    );
    const fold = window.innerHeight * 0.92;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          (entry.target as HTMLElement).dataset.reveal = "shown";
          observer.unobserve(entry.target);
        }
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.01 },
    );

    for (const el of blocks) {
      if (el.getBoundingClientRect().top < fold) continue;
      el.dataset.reveal = "pending";
      observer.observe(el);
    }

    return () => observer.disconnect();
  }, []);

  return null;
}
