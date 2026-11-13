"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  Description,
  Label,
  ListBox,
  NumberField,
  Radio,
  RadioGroup,
  Select,
  toast,
} from "@heroui/react";
import { Info } from "lucide-react";
import { SUPPORTED_CURRENCIES, getCurrencySymbol } from "@/lib/money";
import { updatePlatformFeeSettings, type PlatformFeeInput } from "./_actions";
import {
  MAX_PLATFORM_FEE_PERCENT,
  MIN_PLATFORM_FEE_PERCENT,
  type PlatformFeeType,
} from "@/lib/platform/fees";

interface FormValues {
  feeType: PlatformFeeType;
  feePercent: number;
  feeFlatMajor: number;
  feeFlatCurrency: string;
}

const round2 = (n: number) => Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;
const num = (n: number) => (Number.isFinite(n) ? n : 0);

// Mirror the server's MAX_FLAT_FEE_MAJOR guardrail for instant feedback.
const MAX_FLAT_FEE_MAJOR = 1_000_000;

// The action persists all four columns every save, so a change to any one
// (even the inactive model's) is a real change — compare them all.
function serialize(v: FormValues): string {
  return JSON.stringify({
    t: v.feeType,
    p: round2(v.feePercent),
    f: round2(v.feeFlatMajor),
    c: v.feeFlatCurrency,
  });
}

export function PlatformFeeSettingsForm({ initial }: { initial: FormValues }) {
  const router = useRouter();
  const [values, setValues] = React.useState<FormValues>(initial);
  const [baseline, setBaseline] = React.useState<FormValues>(initial);
  const [saving, setSaving] = React.useState(false);

  const dirty = serialize(values) !== serialize(baseline);

  function set<K extends keyof FormValues>(key: K, val: FormValues[K]) {
    setValues((p) => ({ ...p, [key]: val }));
  }

  // Warn before navigating away with unsaved edits.
  React.useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  async function handleSave() {
    if (saving || !dirty) return;

    // Mirror the server guardrails for instant feedback; the server is
    // authoritative and re-validates + re-asserts admin.
    const roundedPct = round2(values.feePercent);
    if (
      values.feeType === "percentage" &&
      (roundedPct < 0 || roundedPct > MAX_PLATFORM_FEE_PERCENT)
    ) {
      toast.danger(
        `Percentage fee must be 0% or between ${MIN_PLATFORM_FEE_PERCENT.toFixed(1)}% and ${MAX_PLATFORM_FEE_PERCENT.toFixed(1)}%.`
      );
      return;
    }
    if (
      values.feeType === "percentage" &&
      roundedPct > 0 &&
      roundedPct < MIN_PLATFORM_FEE_PERCENT
    ) {
      toast.danger(
        `Percentage fee must be 0% or at least ${MIN_PLATFORM_FEE_PERCENT.toFixed(1)}% because RoomLine absorbs Paystack's 1.95% processing fee.`
      );
      return;
    }
    if (
      values.feeType === "flat" &&
      !(values.feeFlatMajor >= 0 && values.feeFlatMajor <= MAX_FLAT_FEE_MAJOR)
    ) {
      toast.danger(`Flat fee must be between 0 and ${MAX_FLAT_FEE_MAJOR.toLocaleString()}.`);
      return;
    }

    setSaving(true);
    try {
      const payload: PlatformFeeInput = {
        feeType: values.feeType,
        feePercent: round2(values.feePercent),
        feeFlatMajor: round2(values.feeFlatMajor),
        feeFlatCurrency: values.feeFlatCurrency,
      };
      const res = await updatePlatformFeeSettings(payload);
      if (res.success) {
        toast.success("Fee updated. Applies to the next transaction.");
        setBaseline(values);
        router.refresh();
      } else {
        toast.danger(res.error ?? "Could not update the fee.");
      }
    } catch {
      toast.danger("Could not update the fee.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Fee model + amount */}
      <section className="rounded-2xl border border-border/60 bg-card p-5 sm:p-6">
        <RadioGroup
          value={values.feeType}
          onChange={(v) => set("feeType", v as PlatformFeeType)}
        >
          <Label className="text-sm font-medium text-foreground">
            Fee model
          </Label>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <Radio
              value="percentage"
              className="rounded-xl border border-border/60 p-4"
            >
              <Radio.Content>
                <Radio.Control>
                  <Radio.Indicator />
                </Radio.Control>
                Percentage
              </Radio.Content>
              <Description>A share of each booking total.</Description>
            </Radio>
            <Radio
              value="flat"
              className="rounded-xl border border-border/60 p-4"
            >
              <Radio.Content>
                <Radio.Control>
                  <Radio.Indicator />
                </Radio.Control>
                Flat fee
              </Radio.Content>
              <Description>A fixed amount per transaction.</Description>
            </Radio>
          </div>
        </RadioGroup>

        <div className="mt-6 border-t border-border/50 pt-6">
          {values.feeType === "percentage" ? (
            <NumberField
              value={num(values.feePercent)}
              onChange={(n) => set("feePercent", num(n))}
              minValue={0}
              maxValue={MAX_PLATFORM_FEE_PERCENT}
              step={0.25}
              formatOptions={{ minimumFractionDigits: 0, maximumFractionDigits: 2 }}
            >
              <Label>Percentage per transaction</Label>
              <NumberField.Group className="mt-2 max-w-[220px]">
                <NumberField.DecrementButton />
                <NumberField.Input />
                <NumberField.IncrementButton />
              </NumberField.Group>
              <Description>
                Enter 0% for no platform fee, or {MIN_PLATFORM_FEE_PERCENT.toFixed(1)}%–{MAX_PLATFORM_FEE_PERCENT.toFixed(1)}% (RoomLine absorbs Paystack&apos;s 1.95% processing fee out of this commission).
              </Description>
            </NumberField>
          ) : (
            <div className="space-y-5">
              <NumberField
                value={num(values.feeFlatMajor)}
                onChange={(n) => set("feeFlatMajor", num(n))}
                minValue={0}
                maxValue={MAX_FLAT_FEE_MAJOR}
                step={1}
                formatOptions={{ style: "currency", currency: values.feeFlatCurrency }}
              >
                <Label>Flat fee per transaction</Label>
                <NumberField.Group className="mt-2 max-w-[220px]">
                  <NumberField.DecrementButton />
                  <NumberField.Input />
                  <NumberField.IncrementButton />
                </NumberField.Group>
                <Description>Charged only when the payment is in this currency. Ghana cedis only.</Description>
              </NumberField>

              <Select
                className="max-w-[220px]"
                value={values.feeFlatCurrency}
                onChange={(v) => v && set("feeFlatCurrency", String(v))}
              >
                <Label>Flat-fee currency</Label>
                <Select.Trigger className="mt-2">
                  <Select.Value />
                  <Select.Indicator />
                </Select.Trigger>
                <Select.Popover>
                  <ListBox>
                    {SUPPORTED_CURRENCIES.map((c) => (
                      <ListBox.Item key={c} id={c} textValue={c}>
                        {c} · {getCurrencySymbol(c)}
                        <ListBox.ItemIndicator />
                      </ListBox.Item>
                    ))}
                  </ListBox>
                </Select.Popover>
              </Select>
            </div>
          )}
        </div>
      </section>

      {/* How it works */}
      <section className="rounded-2xl border border-border/60 bg-muted/40 p-5">
        <div className="flex gap-3">
          <Info className="mt-1 size-4 shrink-0 text-muted-foreground" />
          <div className="space-y-2 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">How the fee is applied</p>
              <p>
                The guest is charged the full booking total. When a platform fee is
                active, RoomLine bears Paystack&apos;s 1.95% Ghana processing fee out
                of RoomLine&apos;s commission (<code>bearer: &quot;account&quot;</code>) and the
                hotel&apos;s subaccount receives the full remaining balance net.
              </p>
              <p>
                A 0% fee takes no cut and leaves Paystack&apos;s standard subaccount
                fee-bearing rule untouched. If a flat fee is smaller than Paystack&apos;s
                1.95% charge on a large booking, the platform fee is automatically
                waived on that booking so guest checkout never fails.
              </p>
          </div>
        </div>
      </section>

      {/* Save bar */}
      <div className="sticky bottom-4 flex items-center gap-3 rounded-2xl border border-border/60 bg-background/90 px-4 py-3 backdrop-blur">
        <span className="mr-auto text-xs text-muted-foreground">
          {dirty ? "Unsaved changes" : "All changes saved"}
        </span>
        <Button
          variant="tertiary"
          isDisabled={!dirty || saving}
          onPress={() => setValues(baseline)}
        >
          Discard
        </Button>
        <Button
          variant="primary"
          isDisabled={!dirty}
          isPending={saving}
          onPress={handleSave}
        >
          Save changes
        </Button>
      </div>
    </div>
  );
}
