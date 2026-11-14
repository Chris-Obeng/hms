import type { CSSProperties } from "react";
import { ProductFilm } from "./film/product-film";

const POINTS = [
  {
    term: "Mobile money, card and cash",
    detail: "Every payment lands on the guest's bill in GHS, whoever took it.",
  },
  {
    term: "Paid out to your account",
    detail: "Online payments settle to your bank account or MoMo wallet.",
  },
  {
    term: "The day closes itself",
    detail: "The night audit matches payments and locks the day in one click.",
  },
] as const;

export function Showcase() {
  return (
    <section
      id="product"
      data-tone="lagoon"
      className="rl-section rl-showcase"
      aria-labelledby="product-heading"
    >
      <div className="rl-wrap rl-showcase-grid">
        <div className="rl-showcase-copy" data-reveal="">
          <h2 id="product-heading" className="rl-h2 rl-r">
            From booking to bank, on one&nbsp;bill.
          </h2>
          <p className="rl-lead rl-muted rl-r" style={{ "--i": 1 } as CSSProperties}>
            A guest pays with MoMo from their phone. The folio balances, and the
            night audit closes the day without a spreadsheet.
          </p>
          <dl className="rl-points">
            {POINTS.map((p, i) => (
              <div key={p.term} className="rl-point rl-r" style={{ "--i": i + 2 } as CSSProperties}>
                <dt>{p.term}</dt>
                <dd>{p.detail}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="rl-showcase-film" data-reveal="">
          <div className="rl-r rl-tile rl-tile--laterite">
            <ProductFilm
              film="folio"
              label="RoomLine guest folio and night audit"
              description="A guest folio for Kwame Asante, room 204, totals GHS 1,360. A mobile money payment is approved, the balance drops to zero and shows Settled. Then the night audit shows 42 of 42 payments matched, 18 of 24 rooms sold and GHS 12,480 revenue, and the day is closed."
            />
          </div>
        </div>
      </div>
    </section>
  );
}
