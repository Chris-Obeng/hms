import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "Set up your property",
  description: "Set up your property on Oriel: front desk and direct booking page.",
};

/**
 * Override root maximumScale: 1 so hotel owners can pinch-zoom freely (WCAG),
 * and resize layout viewport when mobile software keyboard opens so primary
 * actions remain reachable. Inputs use >= 16px on coarse pointers so iOS
 * Safari never auto-zooms on focus.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
  colorScheme: "light",
};

export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
