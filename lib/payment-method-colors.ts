/**
 * One colour per payment method for every payments chart (reports, night
 * audit). They follow the chart tokens, so they inherit the theme. Online
 * payments get a teal of their own; red would read as a failed payment.
 */
export const PAYMENT_METHOD_COLORS: Record<string, string> = {
  cash: "var(--chart-1)",
  card: "var(--chart-2)",
  mobile_money: "var(--chart-3)",
  bank_transfer: "var(--chart-4)",
  pos: "var(--chart-5)",
  paystack_link: "color-mix(in oklch, var(--chart-2) 55%, var(--chart-1))",
};

/** Colour for a folded "Other" slice or a method with no token. */
export const OTHER_PAYMENT_METHOD_COLOR = "var(--muted-foreground)";
