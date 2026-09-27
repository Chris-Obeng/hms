import { easeOut, easeOutBack, fontData, fontText, mix, money, span, ui } from "../ui";
import { Chip, Label } from "./parts";
import { Frame } from "./frame";

/*
 * The money. A guest folio is settled — mobile money is picked here, cash and
 * card sit beside it — the figure counts up, the status flips from awaiting to
 * paid, and the entry is recorded against tonight's audit. Real flows, real
 * statuses. A short outro fade lets the loop restart without a hard cut.
 */

const TOTAL = 1548;

export function PaymentScreen({ frame, wide }: { frame: number; wide: boolean }) {
  const enter = easeOut(span(frame, 0, 18));
  const selected = easeOut(span(frame, 16, 30));
  const counting = easeOut(span(frame, 38, 96));
  const paid = span(frame, 100, 110);
  const sms = easeOut(span(frame, 108, 122));
  const audited = easeOut(span(frame, 128, 142));
  const pressed = span(frame, 92, 100);
  const outro = easeOut(span(frame, 250, 268));
  const shown = Math.round(mix(0, TOTAL, counting));

  return (
    <Frame wide={wide} title="Folio · James Carter" active="Payments">
      <div
        style={{
          height: "100%",
          display: "grid",
          gridTemplateColumns: wide ? "1.02fr 1fr" : "1fr",
          gap: wide ? 20 : 0,
          padding: wide ? "20px 22px" : "14px",
          fontFamily: fontText,
          opacity: enter * (1 - outro),
          transform: `translateY(${(1 - enter) * 10}px)`,
        }}
      >
        {/* The folio, written as a ledger */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <Label size={11}>Folio #F-1188 · Deluxe 204</Label>
          <div
            style={{
              marginTop: 14,
              display: "flex",
              flexDirection: "column",
            }}
          >
            {[
              ["Night 1 · Mon 24 Aug", "516"],
              ["Night 2 · Tue 25 Aug", "516"],
              ["Night 3 · Wed 26 Aug", "516"],
            ].map(([label, amount], i) => (
              <div
                key={label}
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  justifyContent: "space-between",
                  gap: 12,
                  padding: "11px 0",
                  borderBottom: `1px solid ${ui.line}`,
                  opacity: easeOut(span(frame, 6 + i * 5, 24 + i * 5)),
                }}
              >
                <span style={{ fontSize: wide ? 14 : 13.5, color: ui.inkSoft }}>{label}</span>
                <span
                  style={{
                    fontFamily: fontData,
                    fontSize: wide ? 14 : 13.5,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {money(Number(amount))}
                </span>
              </div>
            ))}
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                justifyContent: "space-between",
                gap: 12,
                paddingTop: 12,
                paddingBottom: 4,
              }}
            >
              <span
                style={{
                  fontSize: wide ? 14.5 : 14,
                  fontWeight: 600,
                  letterSpacing: -0.1,
                }}
              >
                Balance due
              </span>
              <span
                style={{
                  fontFamily: fontData,
                  fontSize: wide ? 27 : 30,
                  fontWeight: 500,
                  letterSpacing: -1,
                  fontVariantNumeric: "tabular-nums",
                  color: paid > 0.5 ? ui.brand : ui.ink,
                }}
              >
                {money(TOTAL - shown)}
              </span>
            </div>
          </div>

          <div
            style={{
              marginTop: "auto",
              display: "flex",
              alignItems: "center",
              gap: 10,
              opacity: audited,
              transform: `translateY(${(1 - audited) * 8}px)`,
              paddingTop: 12,
              borderTop: `1px solid ${ui.line}`,
            }}
          >
            <Chip tone={paid > 0.5 ? "clear" : "await"} dot size={wide ? 12 : 11}>
              {paid > 0.5 ? "Paid · Mobile Money" : "Awaiting"}
            </Chip>
            <span style={{ fontSize: wide ? 13 : 12.5, color: ui.muted }}>
              Recorded in night audit · Mon 24 Aug
            </span>
          </div>
        </div>

        {/* Method panel */}
        <div
          style={{
            background: ui.surface,
            border: `1px solid ${ui.line}`,
            borderRadius: 10,
            padding: wide ? "18px 18px 16px" : "14px",
            display: "flex",
            flexDirection: "column",
            boxShadow: "0 10px 26px rgba(21,26,24,0.06)",
          }}
        >
          <Label size={11}>Take payment</Label>
          <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
            {[
              { name: "Mobile Money", note: "Prompt sent to guest" },
              { name: "Cash at desk", note: "Till 01" },
              { name: "Card", note: "Visa · Mastercard" },
            ].map((m, i) => {
              const on = i === 0;
              return (
                <div
                  key={m.name}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    height: wide ? 52 : 48,
                    padding: "0 12px",
                    borderRadius: 8,
                    border: `1px solid ${on ? ui.brand : ui.line}`,
                    background: on ? ui.brandWash : ui.surface,
                    boxShadow: on ? `0 0 0 ${2 * selected}px ${ui.brandLine}` : "none",
                    opacity: easeOut(span(frame, 12 + i * 6, 28 + i * 6)),
                  }}
                >
                  <span
                    style={{
                      width: 15,
                      height: 15,
                      borderRadius: 9999,
                      border: `1.5px solid ${on ? ui.brand : ui.rule}`,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    {on ? (
                      <span
                        style={{
                          width: 15 * mix(0, 1, selected),
                          height: 15 * mix(0, 1, selected),
                          borderRadius: 9999,
                          background: ui.brand,
                        }}
                      />
                    ) : null}
                  </span>
                  <span style={{ fontSize: wide ? 14 : 13.5, fontWeight: on ? 600 : 500 }}>
                    {m.name}
                  </span>
                  <span style={{ fontSize: wide ? 12 : 11.5, color: ui.faint }}>{m.note}</span>
                  {on && counting > 0.02 ? (
                    <span
                      style={{
                        marginLeft: "auto",
                        fontFamily: fontData,
                        fontSize: wide ? 14 : 13,
                        fontVariantNumeric: "tabular-nums",
                        color: ui.brand,
                        fontWeight: 500,
                      }}
                    >
                      {money(shown)}
                    </span>
                  ) : null}
                </div>
              );
            })}
          </div>

          <div
            style={{
              marginTop: 14,
              height: wide ? 46 : 44,
              borderRadius: 7,
              background: paid > 0.5 ? ui.brandDeep : ui.brand,
              color: "#F6F1E9",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              fontSize: wide ? 14.5 : 14,
              fontWeight: 600,
              letterSpacing: -0.1,
              transform: `scale(${mix(1, 0.985, easeOutBack(pressed) > 1 ? 1 : pressed)})`,
              opacity: paid > 0.5 ? 0.72 : 1,
            }}
          >
            {paid > 0.5 ? "Payment recorded" : `Charge ${money(TOTAL)}`}
          </div>

          <div
            style={{
              marginTop: 12,
              display: "flex",
              alignItems: "center",
              gap: 8,
              opacity: sms,
              transform: `translateX(${(1 - sms) * 10}px)`,
            }}
          >
            <span
              style={{
                width: 18,
                height: 18,
                borderRadius: 9999,
                background: ui.brandWash,
                border: `1px solid ${ui.brandLine}`,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                color: ui.brand,
                fontSize: 11,
              }}
            >
              ✓
            </span>
            <span style={{ fontSize: wide ? 12.5 : 12, color: ui.muted }}>
              Receipt sent to James Carter
            </span>
          </div>
        </div>
      </div>
    </Frame>
  );
}
