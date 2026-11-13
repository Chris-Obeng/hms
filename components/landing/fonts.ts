import { Fraunces, Plus_Jakarta_Sans } from "next/font/google";

/**
 * Landing-only font instances. Imported from the page tree, so Next preloads
 * them on `/` alone; the app's root layout keeps its own preload:false copies.
 * The variables are applied on the `.rl-landing` wrapper and nowhere else.
 */
export const landingDisplay = Fraunces({
  subsets: ["latin"],
  axes: ["opsz"],
  variable: "--rl-font-display",
  display: "swap",
});

export const landingText = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--rl-font-text",
  display: "swap",
});
