import type { CSSProperties } from "react";
import { ProductFilm } from "./film/product-film";

const POINTS = [
  {
    term: "One bill per guest",
    detail: "Mobile money, card and cash land on the same folio in GHS, whoever took the payment.",
  },
  {
    term: "Paid out to your account",
    detail: "Online payments settle to your bank account or mobile money wallet.",
  },
  {
    term: "The day closes in one click",
    detail: "The night audit matches every payment and locks the day.",
  },
] as const;

export function Showcase() {
  return (
    <section id="product" data-tone="lagoon" className="rl-section rl-showcase" aria-labelledby="product-heading">
      <div className="rl-wrap rl-showcase-grid">
        <div className="rl-showcase-copy" data-reveal="">
          <h2 id="product-heading" className="rl-h2 rl-h2--split rl-r">
            From booking to bank.{" "}
            <span className="rl-h2-quiet">A guest pays from their phone, the bill balances and the day closes.</span>
          </h2>
          <dl className="rl-points">
            {POINTS.map((p, i) => (
              <div key={p.term} className="rl-point rl-r" style={{ "--i": i + 1 } as CSSProperties}>
                <dt>{p.term}</dt>
                <dd>{p.detail}</dd>
              </div>
            ))}
          </dl>
        </div>

        <figure className="rl-showcase-film" data-reveal="">
          <figcaption className="rl-fig rl-r" aria-hidden="true">
            <span>Fig. 02</span>
            <span>Folio and night audit</span>
          </figcaption>
          <div className="rl-r rl-tile rl-tile--laterite" style={{ "--i": 1 } as CSSProperties}>
            <ProductFilm
              film="folio"
              label="Oriel guest folio and night audit"
              description="A guest folio for Kwame Asante, room 204, totals GHS 1,360. A mobile money payment is approved, the balance drops to zero and shows Settled. Then the night audit shows 42 of 42 payments matched, 18 of 24 rooms sold and GHS 12,480 revenue, and the day is closed."
            />
          </div>
        </figure>
      </div>
    </section>
  );
}
