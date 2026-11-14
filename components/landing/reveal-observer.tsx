"use client";

import { useEffect } from "react";

/**
 * Two small scroll behaviours for the landing page, one client component.
 *
 * Reveals: server-rendered blocks marked `data-reveal` stay visible by
 * default; after hydration, blocks still below the fold are set to `pending`
 * and flip to `shown` as they scroll in, which plays their CSS transitions.
 * Skipped under reduced motion or without IntersectionObserver.
 *
 * Tones: each section names a colour with `data-tone`. Whichever section
 * crosses the middle of the screen sets the page's tone, and the whole page
 * (header included) eases to that colour. Without this script every section
 * simply paints its own tone, so nothing depends on it.
 */
export function RevealObserver() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>(".rl-landing");
    if (!root || typeof IntersectionObserver === "undefined") return;

    const toneSections = Array.from(root.querySelectorAll<HTMLElement>("section[data-tone]"));
    const toneObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          root.dataset.tone = (entry.target as HTMLElement).dataset.tone;
        }
      },
      { rootMargin: "-50% 0px -50% 0px" },
    );
    for (const section of toneSections) toneObserver.observe(section);
    root.dataset.tones = "live";

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return () => toneObserver.disconnect();
    }

    const blocks = Array.from(root.querySelectorAll<HTMLElement>("[data-reveal]"));
    const fold = window.innerHeight * 0.92;
    const revealObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          (entry.target as HTMLElement).dataset.reveal = "shown";
          revealObserver.unobserve(entry.target);
        }
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.01 },
    );
    for (const el of blocks) {
      if (el.getBoundingClientRect().top < fold) continue;
      el.dataset.reveal = "pending";
      revealObserver.observe(el);
    }

    return () => {
      toneObserver.disconnect();
      revealObserver.disconnect();
    };
  }, []);

  return null;
}
