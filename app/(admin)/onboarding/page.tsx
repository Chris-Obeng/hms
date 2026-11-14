"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import Link from "next/link";
import { useOrganizationList, useAuth, useUser, useClerk } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import {
  AsYouType,
  getCountryCallingCode,
  type CountryCode,
} from "libphonenumber-js";
import {
  ArrowRight,
  ArrowLeft,
  Loader2,
  Check,
  AlertCircle,
  Copy,
} from "lucide-react";

import {
  createHotelProfile,
  type OnboardingInput as OnboardingInputType,
} from "@/app/actions/onboarding";
import { slugify } from "@/lib/utils";
import { StepIndicator } from "./_components/step-indicator";
import { OnboardingInput as OBInput } from "./_components/onboarding-input";
import { OnboardingSelect as OBSelect } from "./_components/onboarding-select";
import { RoomStepper } from "./_components/room-stepper";
import "./onboarding.css";
import { OrielGlyph } from "@/components/brand/oriel-mark";
import { BookingPreview } from "./_components/booking-preview";

// ─── Draft persistence ─────────────────────────────────────────────────────────

const STORAGE_KEY = "roomline.onboarding.v2";
const LEGACY_STORAGE_KEYS = ["RoomLine_onboarding_data"];
const STEP_COUNT = 2;

type DraftData = Partial<OnboardingInputType>;

type Draft = {
  v: 2;
  step: number;
  data: DraftData;
  orgId?: string | null;
};

const DEFAULT_DATA: DraftData = {
  country: "Ghana",
  number_of_rooms: 10,
  star_rating: "Unrated",
  hotel_type: "Hotel",
};

function sanitizeData(raw: unknown): DraftData {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_DATA };
  const r = raw as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? v : undefined);
  const num = Number(r.number_of_rooms);
  return {
    name: str(r.name),
    hotel_type: str(r.hotel_type) ?? DEFAULT_DATA.hotel_type,
    star_rating: str(r.star_rating) ?? DEFAULT_DATA.star_rating,
    number_of_rooms:
      Number.isFinite(num) && num > 0
        ? Math.floor(num)
        : DEFAULT_DATA.number_of_rooms,
    address: str(r.address),
    city: str(r.city),
    country: str(r.country) ?? DEFAULT_DATA.country,
    phone: str(r.phone),
    email: str(r.email),
  };
}

function loadDraft(): Draft | null {
  for (const legacy of LEGACY_STORAGE_KEYS) {
    try {
      localStorage.removeItem(legacy);
    } catch {}
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const p = parsed as Record<string, unknown>;
    if (p.v !== 2) return null;
    const stepNum = Number(p.step);
    const step = Number.isFinite(stepNum)
      ? Math.min(STEP_COUNT, Math.max(1, Math.floor(stepNum)))
      : 1;
    return {
      v: 2,
      step,
      data: sanitizeData(p.data),
      orgId:
        typeof p.orgId === "string" && p.orgId.length > 0 ? p.orgId : null,
    };
  } catch {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {}
    return null;
  }
}

function writeDraft(draft: Draft) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
  } catch {}
}

function clearDraft() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {}
}

function stripDialPrefix(raw: string | undefined, dialPrefix: string | undefined): string {
  if (!raw) return "";
  if (!dialPrefix) return raw;
  const escaped = dialPrefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return raw.replace(new RegExp(`^\\s*${escaped}\\s*`), "");
}

function normalizePhoneForSubmit(
  raw: string | undefined,
  dialPrefix: string | undefined
): string {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("+")) return trimmed;
  if (!dialPrefix) return trimmed;
  const withoutTrunkZero = trimmed.replace(/^0+\s*/, "") || trimmed;
  return `${dialPrefix} ${withoutTrunkZero}`.trim();
}

// ─── Validation ───────────────────────────────────────────────────────────────

type FieldErrors = Partial<Record<keyof DraftData, string>>;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateStep(step: number, d: DraftData): FieldErrors {
  const errors: FieldErrors = {};
  if (step === 1) {
    const name = (d.name ?? "").trim();
    if (!name) {
      errors.name = "Enter your property name.";
    } else if (name.length < 2) {
      errors.name = "Property name must be at least 2 characters.";
    }
  }
  if (step === 2) {
    if (!(d.address ?? "").trim()) {
      errors.address = "Enter the street address.";
    }
    if (!(d.city ?? "").trim()) {
      errors.city = "Enter the town or city.";
    }
    if (!(d.phone ?? "").trim()) {
      errors.phone = "Enter a contact phone number.";
    } else if ((d.phone ?? "").replace(/\D/g, "").length < 7) {
      errors.phone = "Enter a complete phone number.";
    }
    const email = (d.email ?? "").trim();
    if (!email) {
      errors.email = "Enter an email for booking confirmations.";
    } else if (!EMAIL_RE.test(email)) {
      errors.email = "Enter a valid email address.";
    }
  }
  return errors;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const HOTEL_TYPE_OPTIONS = [
  { value: "Hotel", label: "Hotel" },
  { value: "Boutique Hotel", label: "Boutique Hotel" },
  { value: "Guesthouse", label: "Guesthouse" },
  { value: "Serviced Apartment", label: "Serviced Apartment" },
  { value: "Resort", label: "Resort" },
  { value: "Lodge", label: "Lodge" },
  { value: "Motel", label: "Motel" },
];

const COUNTRY_OPTIONS = [
  { value: "Ghana", label: "Ghana" },
  { value: "Nigeria", label: "Nigeria" },
  { value: "Kenya", label: "Kenya" },
  { value: "South Africa", label: "South Africa" },
  { value: "Tanzania", label: "Tanzania" },
  { value: "Uganda", label: "Uganda" },
  { value: "Rwanda", label: "Rwanda" },
  { value: "Ethiopia", label: "Ethiopia" },
  { value: "Senegal", label: "Senegal" },
  { value: "Côte d'Ivoire", label: "Côte d'Ivoire" },
  { value: "Cameroon", label: "Cameroon" },
  { value: "Zambia", label: "Zambia" },
  { value: "Zimbabwe", label: "Zimbabwe" },
  { value: "Botswana", label: "Botswana" },
  { value: "Namibia", label: "Namibia" },
  { value: "Mauritius", label: "Mauritius" },
  { value: "United Kingdom", label: "United Kingdom" },
  { value: "United States", label: "United States" },
  { value: "Canada", label: "Canada" },
  { value: "Germany", label: "Germany" },
  { value: "France", label: "France" },
  { value: "Netherlands", label: "Netherlands" },
  { value: "United Arab Emirates", label: "United Arab Emirates" },
  { value: "India", label: "India" },
  { value: "China", label: "China" },
  { value: "Australia", label: "Australia" },
  { value: "New Zealand", label: "New Zealand" },
  { value: "Other", label: "Other" },
];

const COUNTRY_TO_REGION: Record<string, CountryCode> = {
  Ghana: "GH",
  Nigeria: "NG",
  Kenya: "KE",
  "South Africa": "ZA",
  Tanzania: "TZ",
  Uganda: "UG",
  Rwanda: "RW",
  Ethiopia: "ET",
  Senegal: "SN",
  "Côte d'Ivoire": "CI",
  Cameroon: "CM",
  Zambia: "ZM",
  Zimbabwe: "ZW",
  Botswana: "BW",
  Namibia: "NA",
  Mauritius: "MU",
  "United Kingdom": "GB",
  "United States": "US",
  Canada: "CA",
  Germany: "DE",
  France: "FR",
  Netherlands: "NL",
  "United Arab Emirates": "AE",
  India: "IN",
  China: "CN",
  Australia: "AU",
  "New Zealand": "NZ",
};

const PHONE_PLACEHOLDERS: Partial<Record<CountryCode, string>> = {
  GH: "030 274 8900",
  NG: "0803 123 4567",
  KE: "0712 345 678",
  ZA: "021 555 0192",
  GB: "020 7946 0921",
  US: "(415) 555-0132",
};

const STEP_LABELS = ["Property", "Location & contact"];

// ─── Brand Mark ───────────────────────────────────────────────────────────────

function BrandLink() {
  return (
    <Link href="/" className="ob-brand" aria-label="Oriel home">
      <OrielGlyph size={24} />
      <span className="ob-brand-name">oriel</span>
    </Link>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="ob-root" aria-busy="true" aria-label="Loading property setup">
      <header className="ob-topbar">
        <div className="ob-topbar-inner">
          <BrandLink />
          <div className="ob-skel" style={{ width: "6rem", height: "1.25rem" }} />
        </div>
      </header>
      <main className="ob-main">
        <div className="ob-column">
          <div className="ob-skel" style={{ width: "6rem", height: "0.25rem", marginBottom: "1.75rem" }} />
          <div className="ob-skel" style={{ width: "13rem", height: "1.75rem" }} />
          <div className="ob-skel" style={{ width: "18rem", height: "1rem", marginTop: "0.5rem", marginBottom: "1.75rem" }} />
          <div style={{ display: "grid", gap: "1.25rem" }}>
            <div className="ob-skel" style={{ width: "100%", height: "var(--ob-control-h)" }} />
            <div className="ob-skel" style={{ width: "100%", height: "var(--ob-control-h)" }} />
            <div className="ob-skel" style={{ width: "100%", height: "var(--ob-control-h)" }} />
          </div>
        </div>
      </main>
    </div>
  );
}

// ─── Auth Gate ────────────────────────────────────────────────────────────────

interface OrgBridge {
  isLoaded: boolean;
  hasExistingMembership: boolean;
  firstMembershipOrgId: string | null;
  ownsDraftOrg: (draftOrgId: string | null) => boolean;
  createOrg: ((name: string) => Promise<{ id: string }>) | null;
  activateOrg: ((orgId: string) => Promise<unknown>) | null;
}

export default function OnboardingPage() {
  const { orgId, userId, isLoaded: authLoaded } = useAuth();
  const { user } = useUser();
  const { signOut } = useClerk();
  const router = useRouter();

  useEffect(() => {
    if (authLoaded && !userId) {
      router.replace("/sign-up");
    }
  }, [authLoaded, userId, router]);

  if (!authLoaded || !userId) return <LoadingSkeleton />;

  return (
    <AuthenticatedOnboarding
      orgId={orgId ?? null}
      clerkEmail={user?.primaryEmailAddress?.emailAddress ?? ""}
      onSignOut={() => signOut({ redirectUrl: "/sign-in" })}
    />
  );
}

function AuthenticatedOnboarding({
  orgId,
  clerkEmail,
  onSignOut,
}: {
  orgId: string | null;
  clerkEmail: string;
  onSignOut: () => void;
}) {
  const { isLoaded, setActive, createOrganization, userMemberships } =
    useOrganizationList({ userMemberships: true });

  const memberships = userMemberships?.data;
  const bridge: OrgBridge = useMemo(
    () => ({
      isLoaded,
      hasExistingMembership: Boolean(memberships?.length),
      firstMembershipOrgId: memberships?.[0]?.organization.id ?? null,
      ownsDraftOrg: (targetId: string | null) =>
        Boolean(
          targetId &&
            memberships?.some(
              (m) => m.organization.id === targetId && m.role === "org:admin"
            )
        ),
      createOrg: createOrganization
        ? (name: string) => createOrganization({ name })
        : null,
      activateOrg: setActive
        ? (targetId: string) => setActive({ organization: targetId })
        : null,
    }),
    [isLoaded, memberships, createOrganization, setActive]
  );

  return (
    <OnboardingWizard
      orgId={orgId}
      clerkEmail={clerkEmail}
      hasSession
      onSignOut={onSignOut}
      bridge={bridge}
    />
  );
}

// ─── Wizard ───────────────────────────────────────────────────────────────────

function OnboardingWizard({
  orgId,
  clerkEmail,
  hasSession,
  onSignOut,
  bridge,
}: {
  orgId: string | null;
  clerkEmail: string;
  hasSession: boolean;
  onSignOut?: () => void;
  bridge: OrgBridge;
}) {
  const router = useRouter();
  const shouldReduceMotion = useReducedMotion();
  const isLoaded = bridge.isLoaded;

  const [boot] = useState<Draft | null>(() =>
    typeof window === "undefined" ? null : loadDraft()
  );
  const [step, setStep] = useState(boot?.step ?? 1);
  const [direction, setDirection] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flagged, setFlagged] = useState<Partial<Record<keyof DraftData, boolean>>>({});
  const [draftOrgId, setDraftOrgId] = useState<string | null>(boot?.orgId ?? null);
  const [done, setDone] = useState<{ name: string; slug: string | null } | null>(null);

  const submittingOrDoneRef = useRef(false);
  const didMountRef = useRef(false);
  const stepHeadingRef = useRef<HTMLHeadingElement>(null);

  const nameRef = useRef<HTMLInputElement>(null);
  const addressRef = useRef<HTMLInputElement>(null);
  const cityRef = useRef<HTMLInputElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);

  const [rawData, setRawData] = useState<DraftData>(() => ({
    ...DEFAULT_DATA,
    ...(boot?.data ?? {}),
  }));

  const values: DraftData = useMemo(
    () => ({
      ...DEFAULT_DATA,
      ...rawData,
      email: rawData.email || clerkEmail,
    }),
    [rawData, clerkEmail]
  );

  useEffect(() => {
    if (isLoaded && orgId && !done && !submittingOrDoneRef.current) {
      router.push("/dashboard");
    }
  }, [isLoaded, orgId, done, router]);

  useEffect(() => {
    if (
      isLoaded &&
      !orgId &&
      !draftOrgId &&
      !done &&
      !submittingOrDoneRef.current &&
      bridge.hasExistingMembership &&
      bridge.firstMembershipOrgId &&
      bridge.activateOrg
    ) {
      bridge.activateOrg(bridge.firstMembershipOrgId);
    }
  }, [isLoaded, orgId, draftOrgId, done, bridge]);

  useEffect(() => {
    if (done) return;
    writeDraft({ v: 2, step, data: values, orgId: draftOrgId });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, rawData, draftOrgId, clerkEmail, done]);

  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }
    const id = window.requestAnimationFrame(() => {
      stepHeadingRef.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(id);
  }, [step]);

  const isDirty = useMemo(() => {
    if (done) return false;
    const base: DraftData = { ...DEFAULT_DATA, email: clerkEmail };
    const touched = Object.keys(values).some(
      (k) =>
        String((values as Record<string, unknown>)[k] ?? "") !==
        String((base as Record<string, unknown>)[k] ?? "")
    );
    return touched || step > 1 || !!draftOrgId;
  }, [values, step, draftOrgId, done, clerkEmail]);

  useEffect(() => {
    if (!isDirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [isDirty]);

  const updateField = useCallback((patch: Partial<DraftData>) => {
    setRawData((prev) => ({ ...prev, ...patch }));
  }, []);

  const focusFirstError = (errs: FieldErrors) => {
    if (errs.name) nameRef.current?.focus();
    else if (errs.address) addressRef.current?.focus();
    else if (errs.city) cityRef.current?.focus();
    else if (errs.phone) phoneRef.current?.focus();
    else if (errs.email) emailRef.current?.focus();
  };

  const goNext = (e: FormEvent) => {
    e.preventDefault();
    const errs = validateStep(1, values);
    const flags: Partial<Record<keyof DraftData, boolean>> = {};
    for (const k of Object.keys(errs) as Array<keyof DraftData>) flags[k] = true;
    setFlagged(flags);
    if (Object.values(errs).some(Boolean)) {
      focusFirstError(errs);
      return;
    }
    setDirection(1);
    setFlagged({});
    setStep(2);
    setError(null);
  };

  const jumpToStep = (target: number) => {
    if (loading || target === step || target < 1 || target > STEP_COUNT) return;
    setDirection(target < step ? -1 : 1);
    setFlagged({});
    setStep(target);
    setError(null);
  };

  const goBack = () => jumpToStep(1);

  const regionCode: CountryCode | undefined =
    COUNTRY_TO_REGION[values.country ?? "Ghana"];

  const dialPrefix = useMemo(() => {
    if (!regionCode) return undefined;
    try {
      return `+${getCountryCallingCode(regionCode)}`;
    } catch {
      return undefined;
    }
  }, [regionCode]);

  const phonePlaceholder =
    (regionCode && PHONE_PLACEHOLDERS[regionCode]) || "Phone number";

  const handlePhoneChange = (rawText: string) => {
    const stripped = stripDialPrefix(rawText, dialPrefix);
    const prevPhone = values.phone ?? "";
    if (!regionCode || stripped.length < prevPhone.length) {
      updateField({ phone: stripped });
      return;
    }
    const formatter = new AsYouType(regionCode);
    updateField({ phone: stripDialPrefix(formatter.input(stripped), dialPrefix) });
  };

  const activeErrors = validateStep(step, values);
  const errFor = (k: keyof DraftData) => (flagged[k] ? activeErrors[k] : undefined);

  const submit = useCallback(async () => {
    if (!bridge.createOrg || !bridge.activateOrg) return;

    const step1Errs = validateStep(1, values);
    if (Object.values(step1Errs).some(Boolean)) {
      const flags: Partial<Record<keyof DraftData, boolean>> = {};
      for (const k of Object.keys(step1Errs) as Array<keyof DraftData>) flags[k] = true;
      setDirection(-1);
      setStep(1);
      setFlagged(flags);
      window.requestAnimationFrame(() => focusFirstError(step1Errs));
      return;
    }

    const step2Errs = validateStep(2, values);
    if (Object.values(step2Errs).some(Boolean)) {
      const flags: Partial<Record<keyof DraftData, boolean>> = {};
      for (const k of Object.keys(step2Errs) as Array<keyof DraftData>) flags[k] = true;
      setFlagged(flags);
      focusFirstError(step2Errs);
      return;
    }

    submittingOrDoneRef.current = true;
    setLoading(true);
    setError(null);

    try {
      let targetOrgId = draftOrgId;
      const ownsDraftOrg = bridge.ownsDraftOrg(targetOrgId);

      if (!ownsDraftOrg) {
        const org = await bridge.createOrg(values.name!.trim());
        targetOrgId = org.id;
        setDraftOrgId(targetOrgId);
        writeDraft({ v: 2, step, data: values, orgId: targetOrgId });
      }

      const payload: OnboardingInputType = {
        name: values.name!.trim(),
        clerk_org_id: targetOrgId!,
        address: values.address!.trim(),
        city: values.city!.trim(),
        country: values.country || "Ghana",
        phone: normalizePhoneForSubmit(values.phone, dialPrefix),
        email: values.email!.trim(),
        hotel_type: values.hotel_type || "Hotel",
        number_of_rooms: Number(values.number_of_rooms),
        star_rating: values.star_rating ?? "Unrated",
      };

      const result = await createHotelProfile(payload);
      if ("error" in result) throw new Error(result.error);

      try {
        await bridge.activateOrg(targetOrgId!);
      } catch {}

      clearDraft();
      setDone({ name: payload.name, slug: result.slug });
    } catch (err: unknown) {
      submittingOrDoneRef.current = false;
      setError(
        err instanceof Error && err.message
          ? err.message
          : "Couldn't finish setup right now. Your details are saved — try again."
      );
    } finally {
      setLoading(false);
    }
  }, [bridge, draftOrgId, values, step, dialPrefix]);

  const handleFinalSubmit = (e: FormEvent) => {
    e.preventDefault();
    submit();
  };

  const stepMotion = shouldReduceMotion
    ? {
        initial: { opacity: 0 },
        animate: { opacity: 1, transition: { duration: 0.12 } },
        exit: { opacity: 0, transition: { duration: 0.1 } },
      }
    : {
        initial: {
          opacity: 0,
          transform: `translateX(${direction * 12}px)`,
        },
        animate: {
          opacity: 1,
          transform: "translateX(0px)",
          transition: {
            duration: 0.18,
            ease: [0.23, 1, 0.32, 1] as const,
          },
        },
        exit: {
          opacity: 0,
          transform: `translateX(${direction * -10}px)`,
          transition: {
            duration: 0.11,
            ease: [0.23, 1, 0.32, 1] as const,
          },
        },
      };

  if (!isLoaded) return <LoadingSkeleton />;

  if (done) {
    return (
      <CompletionScreen
        name={done.name}
        slug={done.slug}
        email={clerkEmail}
        onSignOut={hasSession ? onSignOut : undefined}
      />
    );
  }

  const trimmedName = (values.name ?? "").trim();
  const slugPreview = trimmedName ? slugify(trimmedName, 32) : "";
  const roomCount = values.number_of_rooms ?? 10;

  return (
    <div className="ob-root">
      <a href="#main-content" className="ob-skip">
        Skip to setup
      </a>

      <div role="status" aria-live="polite" className="visually-hidden">
        {`Step ${step} of ${STEP_COUNT}: ${STEP_LABELS[step - 1]}`}
      </div>

      {/* Minimal Borderless Top Chrome */}
      <header className="ob-topbar">
        <div className="ob-topbar-inner">
          <BrandLink />

          <div className="ob-topbar-right">
            {clerkEmail && (
              <span className="ob-user-email" title={clerkEmail}>
                {clerkEmail}
              </span>
            )}
            {hasSession && onSignOut && (
              <button
                type="button"
                className="ob-ghost-btn"
                onClick={onSignOut}
              >
                Sign out
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Focused Single-Axis Onboarding Column */}
      <main id="main-content" className="ob-main" tabIndex={-1}>
        <div className="ob-layout">
        <div className="ob-column">
          <StepIndicator
            currentStep={step}
            totalSteps={STEP_COUNT}
            labels={STEP_LABELS}
            onStepSelect={jumpToStep}
            disabled={loading}
            aside={
              isDirty ? (
                <span className="ob-saved-note">
                  <span className="ob-saved-dot" aria-hidden="true" />
                  Draft saved
                </span>
              ) : null
            }
          />

          {error && (
            <div className="ob-alert" role="alert">
              <AlertCircle size={16} strokeWidth={2} aria-hidden="true" />
              <div>
                <p>{error}</p>
                {!loading && (
                  <button
                    type="button"
                    onClick={submit}
                    className="ob-alert-retry"
                  >
                    Try again
                  </button>
                )}
              </div>
            </div>
          )}

          <AnimatePresence mode="wait" initial={false}>
            {step === 1 && (
              <motion.div
                key="step-1"
                initial={stepMotion.initial}
                animate={stepMotion.animate}
                exit={stepMotion.exit}
              >
                <div className="ob-header-block">
                  <h1
                    id="ob-step-heading"
                    ref={stepHeadingRef}
                    tabIndex={-1}
                    className="ob-title"
                  >
                    Name your property
                  </h1>
                  <p className="ob-subtitle">
                    Three basics. You can change any of it later in Settings.
                  </p>
                </div>

                <form onSubmit={goNext} className="ob-form" noValidate>
                  <div>
                    <OBInput
                      ref={nameRef}
                      label="Property name"
                      required
                      autoComplete="organization"
                      placeholder="Labadi Courtyard Hotel"
                      value={values.name ?? ""}
                      error={errFor("name")}
                      onChange={(e) => updateField({ name: e.target.value })}
                    />
                    {slugPreview && !errFor("name") && (
                      <p className="ob-slug-preview" style={{ marginTop: "0.5rem" }}>
                        Booking link: <strong>/{slugPreview}</strong>
                      </p>
                    )}
                  </div>

                  <div className="ob-row-2">
                    <OBSelect
                      label="Property type"
                      required
                      options={HOTEL_TYPE_OPTIONS}
                      value={values.hotel_type ?? "Hotel"}
                      onChange={(e) => updateField({ hotel_type: e.target.value })}
                    />
                    <RoomStepper
                      label="Number of rooms"
                      value={roomCount}
                      onChange={(val) => updateField({ number_of_rooms: val })}
                    />
                  </div>

                  <div className="ob-actions">
                    <button type="submit" className="ob-btn-primary">
                      <span>Continue</span>
                      <ArrowRight
                        size={15}
                        strokeWidth={2.2}
                        className="ob-btn-arrow"
                        aria-hidden="true"
                      />
                    </button>
                  </div>
                </form>
              </motion.div>
            )}

            {step === 2 && (
              <motion.div
                key="step-2"
                initial={stepMotion.initial}
                animate={stepMotion.animate}
                exit={stepMotion.exit}
              >
                <div className="ob-header-block">
                  <h1
                    id="ob-step-heading"
                    ref={stepHeadingRef}
                    tabIndex={-1}
                    className="ob-title"
                  >
                    Where guests will find you
                  </h1>
                  <p className="ob-subtitle">
                    Shown on booking confirmations once we verify your property.
                  </p>
                </div>

                <form onSubmit={handleFinalSubmit} className="ob-form" noValidate>
                  <OBInput
                    ref={addressRef}
                    label="Street address"
                    required
                    autoComplete="street-address"
                    placeholder="14 Liberation Road, Airport Residential"
                    value={values.address ?? ""}
                    error={errFor("address")}
                    disabled={loading}
                    onChange={(e) => updateField({ address: e.target.value })}
                  />

                  <div className="ob-row-2">
                    <OBInput
                      ref={cityRef}
                      label="Town or city"
                      required
                      autoComplete="address-level2"
                      placeholder="Accra"
                      value={values.city ?? ""}
                      error={errFor("city")}
                      disabled={loading}
                      onChange={(e) => updateField({ city: e.target.value })}
                    />
                    <OBSelect
                      label="Country"
                      required
                      disabled={loading}
                      options={COUNTRY_OPTIONS}
                      value={values.country ?? "Ghana"}
                      onChange={(e) =>
                        updateField({ country: e.target.value, phone: "" })
                      }
                    />
                  </div>

                  <div className="ob-row-2">
                    <OBInput
                      ref={phoneRef}
                      label="Phone number"
                      required
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel"
                      spellCheck={false}
                      mono
                      disabled={loading}
                      prefixText={dialPrefix}
                      placeholder={phonePlaceholder}
                      value={values.phone ?? ""}
                      error={errFor("phone")}
                      onChange={(e) => handlePhoneChange(e.target.value)}
                    />
                    <OBInput
                      ref={emailRef}
                      label="Booking email"
                      required
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      autoCapitalize="none"
                      spellCheck={false}
                      disabled={loading}
                      placeholder="stay@yourhotel.com"
                      value={values.email ?? ""}
                      error={errFor("email")}
                      onChange={(e) => updateField({ email: e.target.value })}
                    />
                  </div>

                  <p className="ob-verify-caption">
                    Public booking activates once we verify the property — usually within 24 hours.
                  </p>

                  <div className="ob-actions">
                    <button
                      type="button"
                      onClick={goBack}
                      disabled={loading}
                      className="ob-btn-secondary"
                    >
                      <ArrowLeft size={14} strokeWidth={2} aria-hidden="true" />
                      <span>Back</span>
                    </button>
                    <button
                      type="submit"
                      disabled={loading}
                      className="ob-btn-primary"
                    >
                      {loading ? (
                        <>
                          <Loader2
                            size={15}
                            strokeWidth={2.2}
                            className="animate-spin"
                            aria-hidden="true"
                          />
                          <span>Setting up your hotel…</span>
                        </>
                      ) : (
                        <span>Finish setup</span>
                      )}
                    </button>
                  </div>
                </form>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <BookingPreview
          name={trimmedName}
          hotelType={values.hotel_type ?? "Hotel"}
          rooms={roomCount}
          city={(values.city ?? "").trim()}
          country={values.country ?? ""}
          phone={values.phone ? `${dialPrefix ?? ""} ${values.phone}`.trim() : ""}
          email={(values.email ?? "").trim()}
          slug={slugPreview}
          step={step}
        />
        </div>
      </main>
    </div>
  );
}

// ─── Completion Screen ─────────────────────────────────────────────────────────

function CompletionScreen({
  name,
  slug,
  email,
  onSignOut,
}: {
  name: string;
  slug: string | null;
  email?: string;
  onSignOut?: () => void;
}) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);

  const bookingUrl =
    slug && typeof window !== "undefined"
      ? `${window.location.origin}/${slug}`
      : slug
        ? `/${slug}`
        : null;

  const copyBookingUrl = async () => {
    if (!bookingUrl) return;
    try {
      await navigator.clipboard.writeText(bookingUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  return (
    <div className="ob-root">
      <header className="ob-topbar">
        <div className="ob-topbar-inner">
          <BrandLink />
          <div className="ob-topbar-right">
            {email && (
              <span className="ob-user-email" title={email}>
                {email}
              </span>
            )}
            {onSignOut && (
              <button
                type="button"
                className="ob-ghost-btn"
                onClick={onSignOut}
              >
                Sign out
              </button>
            )}
          </div>
        </div>
      </header>

      <main id="main-content" className="ob-main">
        <div className="ob-column">
          <div className="ob-done-icon" aria-hidden="true">
            <OrielGlyph size={48} />
          </div>

          <div className="ob-header-block">
            <h1 className="ob-title">{name} is ready</h1>
            <p className="ob-subtitle">
              Your front desk is ready to use. Your booking page opens once we verify the property, usually within a day.
            </p>
          </div>

          <div className="ob-form">
            {slug && bookingUrl && (
              <div className="ob-field">
                <div className="ob-label-row">
                  <span className="ob-label">Booking link</span>
                  <span className="ob-optional">Live after verification</span>
                </div>
                <div className="ob-copy-field">
                  <code className="ob-copy-url" title={bookingUrl}>
                    {bookingUrl}
                  </code>
                  <button
                    type="button"
                    onClick={copyBookingUrl}
                    data-copied={copied ? "true" : undefined}
                    className="ob-copy-btn"
                    aria-live="polite"
                  >
                    {copied ? (
                      <>
                        <Check size={13} strokeWidth={2.4} aria-hidden="true" />
                        <span>Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy size={13} strokeWidth={2} aria-hidden="true" />
                        <span>Copy</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}

            <ol className="ob-next" aria-label="Next steps">
              {[
                { href: "/dashboard/rooms", title: "Add rooms and rates", body: "Room types, numbers and nightly prices." },
                { href: "/dashboard/staff", title: "Invite your team", body: "Send a link; each person gets their own role." },
                { href: "/dashboard/settings/payments", title: "Connect payouts", body: "Where online payments settle: bank or MoMo." },
              ].map((item, i) => (
                <li key={item.href}>
                  <button type="button" className="ob-next-item" onClick={() => router.push(item.href)}>
                    <span className="ob-next-no" aria-hidden="true">{i + 1}</span>
                    <span className="ob-next-text">
                      <span className="ob-next-title">{item.title}</span>
                      <span className="ob-next-body">{item.body}</span>
                    </span>
                    <ArrowRight size={16} strokeWidth={2} aria-hidden="true" className="ob-next-arrow" />
                  </button>
                </li>
              ))}
            </ol>
          </div>

          <div className="ob-secondary-links">
            <button
              type="button"
              onClick={() => router.push("/dashboard")}
              className="ob-text-action"
            >
              <span>Skip to the dashboard</span>
              <ArrowRight size={13} strokeWidth={2} aria-hidden="true" />
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
