"use client";

import { useState, type CSSProperties } from "react";
import { Label, Slider } from "@heroui/react";

const formatGhs = (n: number) => `GHS ${Math.round(n).toLocaleString("en-US")}`;

type Field = {
  key: "rooms" | "rate" | "occupancy" | "commission";
  label: string;
  min: number;
  max: number;
  step: number;
  format: (n: number) => string;
};

const FIELDS: Field[] = [
  { key: "rooms", label: "Rooms", min: 1, max: 80, step: 1, format: (n) => `${n} ${n === 1 ? "room" : "rooms"}` },
  { key: "rate", label: "Average nightly rate", min: 100, max: 3000, step: 50, format: (n) => formatGhs(n) },
  { key: "occupancy", label: "Rooms sold, on average", min: 10, max: 100, step: 5, format: (n) => `${n}%` },
  { key: "commission", label: "Booking site commission", min: 5, max: 30, step: 1, format: (n) => `${n}%` },
];

/**
 * "What booking sites take." Plain arithmetic on the visitor's own numbers:
 * nothing here is a claim about Oriel's results or fees.
 */
export function DirectCalculator() {
  const [v, setV] = useState({ rooms: 12, rate: 450, occupancy: 60, commission: 15 });

  const monthly = v.rooms * v.rate * 30 * (v.occupancy / 100);
  const kept = monthly * (v.commission / 100);

  return (
    <section id="direct" data-tone="paper" className="rl-section" aria-labelledby="direct-heading">
      <div className="rl-wrap">
        <div className="rl-calc" data-reveal="">
          <div className="rl-calc-copy rl-r">
            <h2 id="direct-heading" className="rl-h2 rl-h2--split">
              See what booking sites take.{" "}
              <span className="rl-h2-quiet">
                Guests who book on your own Oriel page pay you directly, not through a booking site.
              </span>
            </h2>
          </div>

          <div className="rl-calc-body rl-r" style={{ "--i": 1 } as CSSProperties}>
            <div className="rl-calc-inputs">
              {FIELDS.map((f) => (
                <Slider
                  key={f.key}
                  className="rl-slider"
                  value={v[f.key]}
                  minValue={f.min}
                  maxValue={f.max}
                  step={f.step}
                  onChange={(n) => setV((s) => ({ ...s, [f.key]: n as number }))}
                  aria-valuetext={f.format(v[f.key])}
                >
                  <div className="rl-slider-head">
                    <Label className="rl-slider-label">{f.label}</Label>
                    <output className="rl-slider-value">{f.format(v[f.key])}</output>
                  </div>
                  <Slider.Track>
                    <Slider.Fill />
                    <Slider.Thumb />
                  </Slider.Track>
                </Slider>
              ))}
            </div>

            <div className="rl-calc-result rl-on-ink" aria-live="polite">
              <p className="rl-calc-kicker">Room revenue in a 30-day month</p>
              <p className="rl-calc-revenue">{formatGhs(monthly)}</p>
              <div className="rl-calc-kept">
                <p className="rl-calc-kicker">What a booking site at {v.commission}% would take</p>
                <p className="rl-calc-big">{formatGhs(kept)}</p>
              </div>
              <p className="rl-calc-note">
                An example from your numbers. Commission rates differ by site and contract.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
