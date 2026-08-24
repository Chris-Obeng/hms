"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useOrganizationList, useAuth, useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { AsYouType, CountryCode } from "libphonenumber-js";
import {
  ArrowRight,
  ArrowLeft,
  Loader2,
  CheckCircle,
  AlertCircle,
  Check,
  Copy,
  Users,
  LayoutDashboard,
  Link2,
} from "lucide-react";

import { createHotelProfile, type OnboardingInput as OnboardingInputType } from "@/app/actions/onboarding";
import { StepIndicator } from "./_components/step-indicator";
import { OnboardingInput as OBInput } from "./_components/onboarding-input";
import { OnboardingSelect as OBSelect } from "./_components/onboarding-select";
import { RoomStepper } from "./_components/room-stepper";
import "./onboarding.css";

// ─── Draft persistence ─────────────────────────────────────────────────────────
// Versioned key: bump v whenever the draft shape changes. Old keys are purged
// so a stale shape can never hydrate the form.

const STORAGE_KEY = "roomline.onboarding.v2";
const LEGACY_STORAGE_KEYS = ["RoomLine_onboarding_data"];
const STEP_COUNT = 3;

type DraftData = Partial<OnboardingInputType>;

type Draft = {
  v: 2;
  step: number;
  data: DraftData;
  /** Org created in a previous attempt whose hotel insert failed. Reused so retries never duplicate organizations. */
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
    number_of_rooms: Number.isFinite(num) && num > 0 ? Math.floor(num) : DEFAULT_DATA.number_of_rooms,
    address: str(r.address),
    city: str(r.city),
    country: str(r.country) ?? DEFAULT_DATA.country,
    phone: str(r.phone),
    email: str(r.email),
    website: str(r.website),
  };
}

function loadDraft(): Draft | null {
  // Purge pre-versioning keys first.
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
    const step =
      Number.isFinite(stepNum) ? Math.min(STEP_COUNT, Math.max(1, Math.floor(stepNum))) : 1;
    return {
      v: 2,
      step,
      data: sanitizeData(p.data),
      orgId: typeof p.orgId === "string" && p.orgId.length > 0 ? p.orgId : null,
    };
  } catch {
    // Corrupt draft: discard rather than block the owner at the door.
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

// ─── Validation ────────────────────────────────────────────────────────────────
// Messages written for an exhausted owner reading once, at midnight, on a phone.

type FieldErrors = Partial<Record<keyof DraftData, string>>;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateStep(step: number, d: DraftData): FieldErrors {
  const errors: FieldErrors = {};
  if (step === 1) {
    const name = (d.name ?? "").trim();
    if (!name) errors.name = "Enter the name guests know your place by.";
    else if (name.length < 2) errors.name = "That name looks too short — enter the full property name.";
  }
  if (step === 2) {
    if (!(d.address ?? "").trim()) errors.address = "Enter the street address guests will use to find you.";
    if (!(d.city ?? "").trim()) errors.city = "Which town or city is the property in?";
    if (!(d.phone ?? "").trim()) errors.phone = "Enter a phone number guests can reach you on.";
    else if ((d.phone ?? "").replace(/\D/g, "").length < 9) errors.phone = "That number looks incomplete — include all digits.";
    const email = (d.email ?? "").trim();
    if (!email) errors.email = "Enter an email for booking confirmations.";
    else if (!EMAIL_RE.test(email)) errors.email = "That email doesn't look right — check it once more.";
  }
  return errors;
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const HOTEL_TYPE_OPTIONS = [
  { value: "Hotel", label: "Hotel" },
  { value: "Guesthouse", label: "Guesthouse" },
  { value: "Motel", label: "Motel" },
  { value: "Serviced Apartment", label: "Serviced Apartment" },
  { value: "Lodge", label: "Lodge" },
  { value: "Boutique Hotel", label: "Boutique Hotel" },
  { value: "Resort", label: "Resort" },
];

const STAR_RATING_OPTIONS = [
  { value: "Unrated", label: "Unrated" },
  { value: "1", label: "★ 1 Star" },
  { value: "2", label: "★★ 2 Stars" },
  { value: "3", label: "★★★ 3 Stars" },
  { value: "4", label: "★★★★ 4 Stars" },
  { value: "5", label: "★★★★★ 5 Stars" },
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

const COUNTRY_TO_REGION: Record<string, string> = {
  Ghana: "GH", Nigeria: "NG", Kenya: "KE", "South Africa": "ZA",
  Tanzania: "TZ", Uganda: "UG", Rwanda: "RW", Ethiopia: "ET",
  Senegal: "SN", "Côte d'Ivoire": "CI", Cameroon: "CM", Zambia: "ZM",
  Zimbabwe: "ZW", Botswana: "BW", Namibia: "NA", Mauritius: "MU",
  "United Kingdom": "GB", "United States": "US", Canada: "CA",
  Germany: "DE", France: "FR", Netherlands: "NL",
  "United Arab Emirates": "AE", India: "IN", China: "CN",
  Australia: "AU", "New Zealand": "NZ",
};

// ─── Motion variants ───────────────────────────────────────────────────────────

const slideVariants = {
  initial: (dir: number) => ({ opacity: 0, x: dir * 24, filter: "blur(4px)" }),
  animate: { opacity: 1, x: 0, filter: "blur(0px)" },
  exit: (dir: number) => ({ opacity: 0, x: dir * -24, filter: "blur(4px)" }),
};

const TRANSITION = { duration: 0.32, ease: [0.32, 0.72, 0, 1] as const };

// ─── Step metadata ─────────────────────────────────────────────────────────────

const STEP_META = [
  {
    label: "Property Details",
    description: "Name, room count and property type. You can adjust these later in Settings.",
  },
  {
    label: "Location & Contact",
    description: "How guests find you and reach you. Kept private until you publish.",
  },
  {
    label: "Review & Launch",
    description: "Check everything once, then create your workspace.",
  },
];

// ─── Loading skeleton ──────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="onboarding-container" style={{ alignItems: "center", justifyContent: "center" }}>
      <div className="flex flex-col items-center gap-3">
        <div
          className="w-8 h-8 rounded-full border-2 animate-spin"
          style={{ borderColor: "var(--onboarding-accent)", borderTopColor: "transparent" }}
          aria-label="Loading"
        />
        <p className="text-[13px]" style={{ color: "var(--onboarding-text-muted)" }}>
          Loading…
        </p>
      </div>
    </div>
  );
}

// ─── Summary icons (inline SVG — no emoji) ─────────────────────────────────────

function SummaryIconBuilding() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="4" y="3" width="16" height="18" rx="2" stroke="currentColor" strokeWidth="1.7" />
      <path d="M9 8h2M13 8h2M9 12h2M13 12h2M10 21v-4h4v4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function SummaryIconPin() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 21s-7-5.1-7-11a7 7 0 1114 0c0 5.9-7 11-7 11z" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="12" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

function SummaryIconPhone() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M5 4h4l2 5-2.5 1.5a12 12 0 005 5L15 13l5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SummaryIconGlobe() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.7" />
      <path d="M3 12h18M12 3c2.5 2.6 3.8 5.7 3.8 9S14.5 18.4 12 21c-2.5-2.6-3.8-5.7-3.8-9S9.5 5.6 12 3z" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function OnboardingPage() {
  const { isLoaded, setActive, createOrganization, userMemberships } =
    useOrganizationList({ userMemberships: true });
  const { orgId } = useAuth();
  const { user } = useUser();
  const router = useRouter();

  /*
   * Draft restore happens in lazy initializers: the first client render still
   * outputs the loading skeleton (Clerk !isLoaded), so localStorage-backed
   * state is ready before the wizard ever mounts — no setState-in-effect,
   * no hydration mismatch.
   */
  const [boot] = useState<Draft | null>(() =>
    typeof window === "undefined" ? null : loadDraft()
  );
  const [step, setStep] = useState(boot?.step ?? 1);
  const [direction, setDirection] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Fields flagged by step-boundary validation; messages are re-derived live so fixes clear instantly. */
  const [flagged, setFlagged] = useState<Partial<Record<keyof DraftData, boolean>>>({});
  const [draftOrgId, setDraftOrgId] = useState<string | null>(boot?.orgId ?? null);
  const [done, setDone] = useState<{ name: string; slug: string | null } | null>(null);

  const [rawData, setRawData] = useState<DraftData>(() => ({
    ...DEFAULT_DATA,
    ...(boot?.data ?? {}),
  }));

  // Smart prefill from the Clerk account, derived at render — no effect needed.
  const clerkEmail = user?.primaryEmailAddress?.emailAddress ?? "";
  const values: DraftData = useMemo(
    () => ({
      ...DEFAULT_DATA,
      ...rawData,
      email: rawData.email || clerkEmail,
    }),
    [rawData, clerkEmail]
  );

  // Redirect if already has org
  useEffect(() => {
    if (isLoaded && orgId) router.push("/dashboard");
  }, [isLoaded, orgId, router]);

  // Auto-select first org if user has one
  useEffect(() => {
    if (isLoaded && !orgId && userMemberships?.data?.length && setActive) {
      setActive({ organization: userMemberships.data[0].organization.id });
    }
  }, [isLoaded, orgId, userMemberships, setActive]);

  // Persist every change so a crash or dead battery loses nothing.
  useEffect(() => {
    writeDraft({ v: 2, step, data: values, orgId: draftOrgId });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, rawData, draftOrgId, clerkEmail]);

  // Exit warning — same pattern as the hotel settings dirty guard.
  const isDirty = useMemo(() => {
    if (done) return false;
    const base: DraftData = { ...DEFAULT_DATA, email: clerkEmail };
    const touched = Object.keys(values).some(
      (k) =>
        String((values as Record<string, unknown>)[k]) !==
        String((base as Record<string, unknown>)[k])
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

  const goNext = (e: FormEvent) => {
    e.preventDefault();
    const errs = validateStep(step, values);
    const flags: Partial<Record<keyof DraftData, boolean>> = {};
    for (const k of Object.keys(errs) as Array<keyof DraftData>) flags[k] = true;
    setFlagged(flags);
    if (Object.values(errs).some(Boolean)) return;
    const n = Math.min(STEP_COUNT, step + 1);
    setDirection(1);
    setStep(n);
    setError(null);
  };

  const goBack = () => {
    const n = Math.max(1, step - 1);
    setDirection(-1);
    setStep(n);
    setError(null);
  };

  const handlePhoneChange = (rawText: string) => {
    const region = COUNTRY_TO_REGION[values.country ?? "Ghana"] ?? "GH";
    const formatter = new AsYouType(region as CountryCode);
    updateField({ phone: formatter.input(rawText) });
  };

  const activeErrors = validateStep(step, values);
  const errFor = (k: keyof DraftData) => (flagged[k] ? activeErrors[k] : undefined);

  const submit = useCallback(async () => {
    if (!createOrganization || !setActive) return;

    setLoading(true);
    setError(null);

    try {
      /*
       * Reuse an org from an earlier partial attempt so a failed hotel insert
       * can never leave two organizations behind.
       */
      let targetOrgId = draftOrgId;
      const ownsDraftOrg =
        !!targetOrgId &&
        !!userMemberships?.data?.some(
          (m) => m.organization.id === targetOrgId && m.role === "org:admin"
        );

      if (!ownsDraftOrg) {
        const org = await createOrganization({ name: values.name!.trim() });
        targetOrgId = org.id;
        setDraftOrgId(targetOrgId);
        // Persist immediately — the next lines are the ones that can fail.
        writeDraft({ v: 2, step, data: values, orgId: targetOrgId });
      }

      const payload: OnboardingInputType = {
        name: values.name!.trim(),
        clerk_org_id: targetOrgId!,
        address: values.address!.trim(),
        city: values.city!.trim(),
        country: values.country || "Ghana",
        phone: values.phone!.trim(),
        email: values.email!.trim(),
        hotel_type: values.hotel_type || "Hotel",
        number_of_rooms: Number(values.number_of_rooms),
        star_rating: values.star_rating,
        website: values.website,
      };

      const result = await createHotelProfile(payload);
      if ("error" in result) throw new Error(result.error);

      try {
        await setActive({ organization: targetOrgId! });
      } catch {
        // Org activation is recoverable later; the workspace itself exists.
      }

      clearDraft();
      setDone({ name: payload.name, slug: result.slug });
    } catch (err: unknown) {
      setError(
        err instanceof Error && err.message
          ? err.message
          : "Something went wrong. Your details are saved — try again."
      );
    } finally {
      setLoading(false);
    }
  }, [createOrganization, setActive, userMemberships, draftOrgId, values, step]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    submit();
  };

  if (!isLoaded) return <LoadingSkeleton />;

  if (done) return <CompletionScreen name={done.name} slug={done.slug} />;

  return (
    <div className="onboarding-container">
      {/* Skip link for accessibility */}
      <a href="#main-content" className="visually-hidden">
        Skip to main content
      </a>

      {/* ── LEFT SIDEBAR ───────────────────────────────────────────────────────── */}
      <aside className="onboarding-sidebar" aria-label="Onboarding information">
        <div className="onboarding-sidebar-texture" aria-hidden="true" />

        <div>
          {/* Logo */}
          <div className="flex items-center gap-2.5 mb-16">
            <div
              className="flex items-center justify-center w-8 h-8 rounded-lg"
              style={{ backgroundColor: "rgba(255,255,255,0.1)" }}
              aria-hidden="true"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <rect x="1" y="7" width="6" height="8" rx="0.5" fill="white" fillOpacity="0.9" />
                <rect x="9" y="4" width="6" height="11" rx="0.5" fill="white" fillOpacity="0.6" />
                <rect x="3" y="1" width="10" height="1" rx="0.5" fill="white" fillOpacity="0.4" />
              </svg>
            </div>
            <span className="text-[15px] font-semibold text-white tracking-[-0.01em]">
              RoomLine
            </span>
          </div>

          {/* Step-aware content */}
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.35, ease: [0.32, 0.72, 0, 1] }}
            >
              <p className="onboarding-eyebrow">
                Step {step} of {STEP_META.length}
              </p>
              <h1 className="onboarding-heading">{STEP_META[step - 1].label}</h1>
              <p className="onboarding-subheading">{STEP_META[step - 1].description}</p>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Bottom: reassurance */}
        <div
          className="rounded-xl p-5 flex items-start gap-3"
          style={{
            backgroundColor: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.07)",
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="shrink-0 mt-0.5" aria-hidden="true">
            <path
              d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"
              stroke="#94a3b8"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <div>
            <p className="text-[13px] font-medium mb-1" style={{ color: "#e2e8f0" }}>
              Your progress is saved
            </p>
            <p className="text-[12px] leading-relaxed" style={{ color: "#64748b" }}>
              Close this page anytime and pick up where you left off on this device.
            </p>
          </div>
        </div>
      </aside>

      {/* ── RIGHT CONTENT AREA ─────────────────────────────────────────────────── */}
      <main className="onboarding-content">
        {/* Mobile header */}
        <div
          className="lg:hidden flex items-center gap-2.5 px-5 py-4 border-b"
          style={{ backgroundColor: "var(--onboarding-card-bg)", borderColor: "var(--onboarding-border)" }}
        >
          <div
            className="flex items-center justify-center w-7 h-7 rounded-lg"
            style={{ backgroundColor: "var(--onboarding-sidebar-bg)" }}
            aria-hidden="true"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <rect x="1" y="7" width="6" height="8" rx="0.5" fill="white" fillOpacity="0.9" />
              <rect x="9" y="4" width="6" height="11" rx="0.5" fill="white" fillOpacity="0.6" />
            </svg>
          </div>
          <span className="text-[14px] font-semibold" style={{ color: "var(--onboarding-text-primary)" }}>
            RoomLine
          </span>
        </div>

        {/* Step indicator bar */}
        <div
          className="px-6 sm:px-10 py-5 border-b bg-card"
          style={{ borderColor: "var(--onboarding-border)", backgroundColor: "var(--onboarding-card-bg)" }}
        >
          <StepIndicator currentStep={step} totalSteps={STEP_COUNT} labels={STEP_META.map((m) => m.label)} />
        </div>

        {/* Scrollable form area */}
        <div
          id="main-content"
          className="flex-1 flex items-start justify-center px-5 sm:px-10 py-8 overflow-y-auto native-scroll"
        >
          <div className="w-full max-w-[32rem] pb-2">
            {/* Error banner */}
            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={TRANSITION}
                  className="onboarding-alert onboarding-alert-error"
                  role="alert"
                >
                  <AlertCircle size={16} className="onboarding-alert-icon" aria-hidden="true" />
                  <div className="onboarding-alert-message">
                    <p>{error}</p>
                    {!loading && (
                      <button
                        type="button"
                        onClick={submit}
                        className="mt-1 font-semibold underline underline-offset-2"
                      >
                        Try again
                      </button>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Step content with animations */}
            <div className="overflow-hidden">
              <AnimatePresence mode="wait" custom={direction} initial={false}>
                {/* ── Step 1: Property Details ──────────────────────────────────── */}
                {step === 1 && (
                  <motion.div
                    key="step-1"
                    custom={direction}
                    variants={slideVariants}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                    transition={TRANSITION}
                  >
                    <div className="mb-8">
                      <h2 className="onboarding-section-title">Tell us about your property</h2>
                      <p className="onboarding-section-desc">
                        Three details to open your workspace. Everything here stays editable in
                        Settings later.
                      </p>
                    </div>

                    <form onSubmit={goNext} className="onboarding-form" noValidate>
                      <OBInput
                        label="Property Name"
                        required
                        autoFocus
                        autoComplete="organization"
                        placeholder="e.g. Ashanti Suites"
                        value={values.name ?? ""}
                        error={errFor("name")}
                        onChange={(e) => updateField({ name: e.target.value })}
                      />

                      <RoomStepper
                        label="Total Rooms"
                        value={values.number_of_rooms ?? 10}
                        onChange={(val) => updateField({ number_of_rooms: val })}
                        hint="All rooms, including suites. Affects how availability is tracked."
                      />

                      <div className="onboarding-form-row">
                        <OBSelect
                          label="Property Type"
                          required
                          options={HOTEL_TYPE_OPTIONS}
                          value={values.hotel_type ?? "Hotel"}
                          onChange={(e) => updateField({ hotel_type: e.target.value })}
                        />
                        <OBSelect
                          label="Star Rating"
                          options={STAR_RATING_OPTIONS}
                          hint="Optional — change later in Settings"
                          value={values.star_rating ?? "Unrated"}
                          onChange={(e) => updateField({ star_rating: e.target.value })}
                        />
                      </div>

                      <div className="onboarding-action-bar">
                        <button type="submit" className="onboarding-button-primary flex-1">
                          Continue
                          <ArrowRight size={15} strokeWidth={2.5} aria-hidden="true" />
                        </button>
                      </div>
                    </form>
                  </motion.div>
                )}

                {/* ── Step 2: Location & Contact ────────────────────────────────── */}
                {step === 2 && (
                  <motion.div
                    key="step-2"
                    custom={direction}
                    variants={slideVariants}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                    transition={TRANSITION}
                  >
                    <div className="mb-8">
                      <h2 className="onboarding-section-title">Location & contact</h2>
                      <p className="onboarding-section-desc">
                        Where the property is and how guests reach you. Nothing is published yet.
                      </p>
                    </div>

                    <form onSubmit={goNext} className="onboarding-form" noValidate>
                      <OBInput
                        label="Street Address"
                        required
                        autoFocus
                        autoComplete="street-address"
                        placeholder="e.g. 14 Independence Avenue"
                        value={values.address ?? ""}
                        error={errFor("address")}
                        onChange={(e) => updateField({ address: e.target.value })}
                      />

                      <div className="onboarding-form-row">
                        <OBInput
                          label="City"
                          required
                          autoComplete="address-level2"
                          placeholder="e.g. Accra"
                          value={values.city ?? ""}
                          error={errFor("city")}
                          onChange={(e) => updateField({ city: e.target.value })}
                        />
                        <OBSelect
                          label="Country"
                          required
                          options={COUNTRY_OPTIONS}
                          value={values.country ?? "Ghana"}
                          onChange={(e) =>
                            updateField({ country: e.target.value, phone: "" })
                          }
                        />
                      </div>

                      <div className="onboarding-form-row">
                        <OBInput
                          label="Phone Number"
                          required
                          type="tel"
                          inputMode="tel"
                          autoComplete="tel"
                          placeholder="e.g. 030 200 0000"
                          value={values.phone ?? ""}
                          error={errFor("phone")}
                          onChange={(e) => handlePhoneChange(e.target.value)}
                          hint="Formatted for you"
                        />
                        <OBInput
                          label="Email Address"
                          required
                          type="email"
                          inputMode="email"
                          autoComplete="email"
                          placeholder="info@yourhotel.com"
                          value={values.email ?? ""}
                          error={errFor("email")}
                          onChange={(e) => updateField({ email: e.target.value })}
                          hint="Booking confirmations go here"
                        />
                      </div>

                      <OBInput
                        label="Website"
                        type="url"
                        inputMode="url"
                        autoComplete="url"
                        placeholder="https://yourhotel.com"
                        value={values.website ?? ""}
                        onChange={(e) => updateField({ website: e.target.value })}
                        hint="Optional — shown on your public page"
                      />

                      <div className="onboarding-action-bar">
                        <button
                          type="button"
                          onClick={goBack}
                          className="onboarding-button-secondary"
                        >
                          <ArrowLeft size={14} strokeWidth={2} aria-hidden="true" />
                          Back
                        </button>
                        <button type="submit" className="onboarding-button-primary flex-1">
                          Review & Confirm
                          <ArrowRight size={15} strokeWidth={2.5} aria-hidden="true" />
                        </button>
                      </div>
                    </form>
                  </motion.div>
                )}

                {/* ── Step 3: Review & Launch ───────────────────────────────────── */}
                {step === 3 && (
                  <motion.div
                    key="step-3"
                    custom={direction}
                    variants={slideVariants}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                    transition={TRANSITION}
                  >
                    <div className="mb-8">
                      <h2 className="onboarding-section-title">Review your details</h2>
                      <p className="onboarding-section-desc">
                        One last look. Creating your workspace takes a few seconds.
                      </p>
                    </div>

                    <form onSubmit={handleSubmit} className="onboarding-form" noValidate>
                      {/* Summary card */}
                      <div className="onboarding-summary-card">
                        <div className="onboarding-summary-row">
                          <span className="onboarding-summary-icon" aria-hidden="true">
                            <SummaryIconBuilding />
                          </span>
                          <div className="onboarding-summary-content">
                            <p className="onboarding-summary-label">Property</p>
                            <p className="onboarding-summary-value">{values.name}</p>
                            <p className="onboarding-summary-sub">
                              {values.hotel_type} ·{" "}
                              {values.star_rating !== "Unrated"
                                ? `${values.star_rating}★`
                                : "Unrated"}{" "}
                              · {values.number_of_rooms} rooms
                            </p>
                          </div>
                        </div>

                        <div className="onboarding-summary-row">
                          <span className="onboarding-summary-icon" aria-hidden="true">
                            <SummaryIconPin />
                          </span>
                          <div className="onboarding-summary-content">
                            <p className="onboarding-summary-label">Location</p>
                            <p className="onboarding-summary-value">{values.address}</p>
                            <p className="onboarding-summary-sub">
                              {values.city}, {values.country}
                            </p>
                          </div>
                        </div>

                        <div className="onboarding-summary-row">
                          <span className="onboarding-summary-icon" aria-hidden="true">
                            <SummaryIconPhone />
                          </span>
                          <div className="onboarding-summary-content">
                            <p className="onboarding-summary-label">Contact</p>
                            <p className="onboarding-summary-value">{values.phone ?? "—"}</p>
                            <p className="onboarding-summary-sub">{values.email ?? "—"}</p>
                          </div>
                        </div>

                        {values.website && (
                          <div className="onboarding-summary-row">
                            <span className="onboarding-summary-icon" aria-hidden="true">
                              <SummaryIconGlobe />
                            </span>
                            <div className="onboarding-summary-content">
                              <p className="onboarding-summary-label">Website</p>
                              <p className="onboarding-summary-value">{values.website}</p>
                            </div>
                          </div>
                        )}
                      </div>

                      <p className="text-[12px] text-center" style={{ color: "var(--onboarding-text-muted)" }}>
                        Your booking page goes live after we verify the property — usually within
                        a day. Terms are shared at that point.
                      </p>

                      <div className="onboarding-action-bar">
                        <button
                          type="button"
                          onClick={goBack}
                          disabled={loading}
                          className="onboarding-button-secondary"
                        >
                          <ArrowLeft size={14} strokeWidth={2} aria-hidden="true" />
                          Back
                        </button>
                        <button
                          type="submit"
                          disabled={loading}
                          className="onboarding-button-primary flex-1"
                        >
                          {loading ? (
                            <>
                              <Loader2 size={15} strokeWidth={2} className="animate-spin" aria-hidden="true" />
                              Setting up…
                            </>
                          ) : (
                            <>
                              <CheckCircle size={15} strokeWidth={2} aria-hidden="true" />
                              Create my workspace
                            </>
                          )}
                        </button>
                      </div>
                    </form>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          className="px-6 py-4 flex items-center justify-between border-t"
          style={{
            borderColor: "var(--onboarding-border)",
            backgroundColor: "var(--onboarding-card-bg)",
          }}
        >
          <p className="text-[11px]" style={{ color: "var(--onboarding-text-muted)" }}>
            © 2026 RoomLine
          </p>
          <div className="flex items-center gap-1.5">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
              <path
                d="M6 1a5 5 0 100 10A5 5 0 006 1zM4 6l1.5 1.5L8 4"
                stroke="#16a34a"
                strokeWidth="1.3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <p className="text-[11px]" style={{ color: "var(--onboarding-text-muted)" }}>
              Sign-in secured by Clerk
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}

// ─── Completion screen ─────────────────────────────────────────────────────────

function CompletionScreen({ name, slug }: { name: string; slug: string | null }) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);

  const bookingUrl = slug ? `${window.location.origin}/${slug}` : null;

  const copyBookingUrl = async () => {
    if (!bookingUrl) return;
    try {
      await navigator.clipboard.writeText(bookingUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  return (
    <div className="onboarding-container" style={{ justifyContent: "center" }}>
      <div className="w-full max-w-[34rem] px-5 sm:px-10 py-10">
        <div className="onboarding-success-badge" aria-hidden="true">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
            <path
              d="M5 12.5l4.5 4.5L19 7.5"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>

        <h1 className="onboarding-section-title mt-5" style={{ fontSize: "1.75rem" }}>
          {name} is ready.
        </h1>
        <p className="onboarding-section-desc mt-2">
          Your workspace is live and you&apos;re signed in as its admin. The public booking page
          switches on after we verify the property — usually within a day.
        </p>

        <div className="mt-8 flex flex-col gap-3">
          {slug && (
            <div className="onboarding-next-card">
              <div className="flex items-start gap-3.5">
                <span className="onboarding-next-icon" aria-hidden="true">
                  <Link2 size={17} strokeWidth={2} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold" style={{ color: "var(--onboarding-text-primary)" }}>
                    Share your booking link
                  </p>
                  <p className="text-[12px] mt-0.5 mb-3" style={{ color: "var(--onboarding-text-secondary)" }}>
                    Put it on WhatsApp, socials or your site. It opens for guests once
                    verification completes.
                  </p>
                  <div className="flex items-stretch gap-2">
                    <code
                      className="onboarding-booking-url"
                      title={bookingUrl ?? `/${slug}`}
                    >
                      {`/${slug}`}
                    </code>
                    <button
                      type="button"
                      onClick={copyBookingUrl}
                      className="onboarding-button-secondary shrink-0"
                      aria-live="polite"
                    >
                      {copied ? (
                        <>
                          <Check size={13} strokeWidth={2.5} aria-hidden="true" /> Copied
                        </>
                      ) : (
                        <>
                          <Copy size={13} strokeWidth={2} aria-hidden="true" /> Copy
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="onboarding-next-card">
            <div className="flex items-center gap-3.5">
              <span className="onboarding-next-icon" aria-hidden="true">
                <Users size={17} strokeWidth={2} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold" style={{ color: "var(--onboarding-text-primary)" }}>
                  Invite your staff
                </p>
                <p className="text-[12px] mt-0.5" style={{ color: "var(--onboarding-text-secondary)" }}>
                  Create join links for front desk, managers and housekeeping.
                </p>
              </div>
              <button
                type="button"
                onClick={() => router.push("/dashboard/staff")}
                className="onboarding-button-secondary shrink-0"
              >
                Invite staff
                <ArrowRight size={13} strokeWidth={2.5} aria-hidden="true" />
              </button>
            </div>
          </div>

          <div className="onboarding-next-card">
            <div className="flex items-center gap-3.5">
              <span className="onboarding-next-icon" aria-hidden="true">
                <LayoutDashboard size={17} strokeWidth={2} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold" style={{ color: "var(--onboarding-text-primary)" }}>
                  Set up rooms and rates
                </p>
                <p className="text-[12px] mt-0.5" style={{ color: "var(--onboarding-text-secondary)" }}>
                  Add room types from the dashboard — takes about five minutes.
                </p>
              </div>
              <button
                type="button"
                onClick={() => router.push("/dashboard/rooms/types")}
                className="onboarding-button-primary shrink-0"
              >
                Go to dashboard
                <ArrowRight size={13} strokeWidth={2.5} aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
