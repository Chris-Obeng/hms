import { Plus_Jakarta_Sans } from "next/font/google";

/**
 * Brand-surface font: the landing page, auth, onboarding, the staff invite
 * page and the account-status pages. Imported from those route trees only, so
 * Next preloads it there; the dashboard keeps the root layout's preload:false
 * copy.
 *
 * One family, used two ways: tight 700–800 for display, 400–600 for text. It
 * is the product's own face, so marketing and app read as one thing.
 *
 * Apply `brandFontVariables` next to `rl-theme` on the outer wrapper.
 */
const brandText = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--rl-font-text",
  display: "swap",
});

export const brandFontVariables = brandText.variable;
