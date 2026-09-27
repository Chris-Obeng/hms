/*
 * Demo palette — the same tokens the page uses, spelled out here because the
 * Remotion comp must also render outside the page.
 * Signals follow one rule: amber = money not yet cleared, rose = outstanding
 * or blocked, slate = walk-in / neutral, evergreen = clear.
 */
export const ui = {
  paper: "#F6F1E9",
  surface: "#FBF8F3",
  ink: "#1C1815",
  inkSoft: "#3A332D",
  muted: "#57504A",
  faint: "#645C52",
  line: "#E4DCCB",
  rule: "#D3C8B2",
  brand: "#1F3D2B",
  brandDeep: "#162E21",
  brandWash: "#E7ECE4",
  brandLine: "#B9C8B8",
  brass: "#B9975B",
  await: "#6B5320",
  awaitWash: "#F1E8D2",
  awaitLine: "#D9C9A6",
  due: "#B42318",
  dueWash: "#FAEEED",
  dueLine: "#F0CFCB",
  house: "#5B6570",
  houseWash: "#F0F1F3",
  houseLine: "#D9DDE1",
  night: "#1F3D2B",
  nightRaised: "#2A4C38",
  nightLine: "#3D5C4B",
  nightFg: "#F6F1E9",
  nightMuted: "#CBC2B2",
  nightBrand: "#D9CFAE",
  nightBrass: "#E3C87F",
} as const;

export const fontText =
  "var(--font-inter), var(--font-jakarta), ui-sans-serif, system-ui, sans-serif";
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
