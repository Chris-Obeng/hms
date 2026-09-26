/*
 * Demo palette — the same tokens the page uses, spelled out here because the
 * Remotion comp must also render outside the page.
 * Signals follow one rule: amber = money not yet cleared, rose = outstanding
 * or blocked, slate = walk-in / neutral, evergreen = clear.
 */
export const ui = {
  paper: "#FBFAF8",
  surface: "#FFFFFF",
  ink: "#151A18",
  inkSoft: "#3A423F",
  muted: "#5B6561",
  faint: "#676F6B",
  line: "#E5E2DC",
  rule: "#D3D1C9",
  brand: "#145C4A",
  brandDeep: "#0F4A3B",
  brandWash: "#E9F1EE",
  brandLine: "#C8DDD5",
  await: "#9A5B12",
  awaitWash: "#F7F0E4",
  awaitLine: "#E6D3B4",
  due: "#B42318",
  dueWash: "#FAEEED",
  dueLine: "#F0CFCB",
  house: "#5B6570",
  houseWash: "#F0F1F3",
  houseLine: "#D9DDE1",
  night: "#0F241F",
  nightRaised: "#16302A",
  nightLine: "#24413A",
  nightFg: "#FBFAF8",
  nightMuted: "#C9D3CE",
  nightBrand: "#8FD9B8",
  nightBrass: "#E7C46A",
} as const;

export const fontText =
  "var(--font-jakarta), ui-sans-serif, system-ui, sans-serif";
export const fontData =
  "var(--font-geist-mono), ui-monospace, SFMono-Regular, monospace";
export const fontDisplay =
  "var(--font-fraunces), ui-serif, Georgia, 'Times New Roman', serif";

/* ── Interpolation helpers (no Remotion imports, so these stay SSR-safe) ── */

export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** 0→1 across [from, to] frames — the demo's only clock. */
export const span = (frame: number, from: number, to: number) =>
  clamp01((frame - from) / Math.max(1, to - from));

export const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
export const easeOutBack = (t: number) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

export const mix = (a: number, b: number, t: number) => a + (b - a) * t;

/** Tabular money, always grouped — a report figure, never a stringly label. */
export const money = (n: number, decimals = 0) =>
  `$${n.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
