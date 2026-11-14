/**
 * Clerk appearance for every Oriel-branded auth surface (sign-in, sign-up,
 * staff invite). Clerk renders the form; our shell supplies the frame, so the
 * card is flattened and Clerk's own logo is hidden.
 *
 * Colours are literal hex values (Clerk derives hover and muted shades from
 * them with color-mix, which needs real colours). They mirror app/rl-theme.css.
 */
const INK = "#141413";
const TEXT = "#1F1E1C";
const MUTED = "#5F5B55";
/** Field and button outlines: 3.5:1 on white (WCAG 1.4.11 asks 3:1). */
const FIELD_LINE = "#8C8983";
const SANS = 'var(--rl-font-text), ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif';

export const clerkAppearance = {
  layout: {
    logoPlacement: "none",
    socialButtonsPlacement: "top",
    socialButtonsVariant: "blockButton",
    // Only the fields the instance requires; nothing optional on first contact.
    showOptionalFields: false,
  },
  variables: {
    colorPrimary: INK,
    colorPrimaryForeground: "#FFFFFF",
    colorForeground: TEXT,
    colorMutedForeground: MUTED,
    colorBackground: "#FFFFFF",
    colorInput: "#FFFFFF",
    colorInputForeground: TEXT,
    colorNeutral: INK,
    colorBorder: "#BFBAB1",
    colorRing: INK,
    colorDanger: "#A33A1E",
    colorSuccess: "#1F7A4D",
    colorWarning: "#8A5A00",
    fontFamily: SANS,
    fontFamilyButtons: SANS,
    fontSize: "0.9375rem",
    borderRadius: "0.75rem",
    spacing: "1rem",
  },
  elements: {
    rootBox: { width: "100%" },
    cardBox: {
      width: "100%",
      maxWidth: "100%",
      boxShadow: "none",
      border: "none",
      borderRadius: 0,
      background: "transparent",
      overflow: "visible",
    },
    card: {
      boxShadow: "none",
      border: "none",
      borderRadius: 0,
      background: "transparent",
      padding: 0,
      gap: "1.5rem",
    },
    header: { alignItems: "flex-start", textAlign: "left", gap: "0.5rem" },
    headerTitle: {
      fontFamily: SANS,
      fontWeight: 700,
      fontSize: "clamp(1.75rem, 1.55rem + 0.8vw, 2.25rem)",
      lineHeight: 1.1,
      letterSpacing: "-0.035em",
      color: INK,
      textAlign: "left",
    },
    headerSubtitle: { fontSize: "1rem", lineHeight: 1.5, color: MUTED, textAlign: "left" },
    socialButtonsBlockButton: {
      minHeight: "48px",
      borderRadius: "999px",
      boxShadow: `0 0 0 1px ${FIELD_LINE}`,
      fontWeight: 600,
    },
    dividerLine: { background: "rgba(20, 20, 19, 0.1)" },
    dividerText: { color: MUTED },
    formFieldLabel: { fontSize: "0.875rem", fontWeight: 600, color: INK },
    formFieldInput: {
      minHeight: "48px",
      fontSize: "1rem",
      boxShadow: `0 0 0 1px ${FIELD_LINE}`,
      "&:focus": { boxShadow: "0 0 0 1px #141413, 0 0 0 4px rgba(20, 20, 19, 0.12)" },
    },
    formFieldErrorText: { fontSize: "0.8125rem", color: "#A33A1E" },
    formButtonPrimary: {
      minHeight: "48px",
      fontSize: "0.9375rem",
      fontWeight: 600,
      textTransform: "none",
      borderRadius: "999px",
      boxShadow: "none",
      "&:active": { transform: "scale(0.97)" },
    },
    footer: {
      background: "transparent",
      padding: 0,
      marginTop: "0.5rem",
    },
    footerAction: { justifyContent: "flex-start", padding: 0 },
    footerActionText: { color: MUTED, fontSize: "0.9375rem" },
    footerActionLink: { color: INK, fontWeight: 600, fontSize: "0.9375rem" },
    identityPreview: { borderColor: "#BFBAB1" },
    otpCodeFieldInput: { minHeight: "52px", fontSize: "1.25rem" },
  },
} as const;
