"use client";

import { sparklinePath } from "./bi-format";

/** 26px gradient area + line, stretched to the card width like the design sparkline. */
export function Sparkline({ values }: { values: (number | null)[] }) {
  const path = sparklinePath(values, 164, 26);
  if (!path) return <div className="h-[26px]" aria-hidden="true" />;
  return <svg viewBox="0 0 164 26" preserveAspectRatio="none" aria-hidden="true" className="h-[26px] w-full">
    <path d={`${path}L164 26L0 26Z`} fill="#0485F740" stroke="none" />
    <path d={path} fill="none" stroke="var(--pen-accent)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
  </svg>;
}
