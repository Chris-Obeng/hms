"use client";

import { useState, useEffect, FormEvent } from "react";
import { useOrganizationList, useAuth, useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { AsYouType } from "libphonenumber-js";
import { ArrowRight, ArrowLeft, Loader2, CheckCircle, AlertCircle } from "lucide-react";

import { createHotelProfile, type OnboardingInput as OnboardingInputType } from "@/app/actions/onboarding";
import { StepIndicator } from "./_components/step-indicator";
import { OnboardingInput as OBInput } from "./_components/onboarding-input";
import { OnboardingSelect as OBSelect } from "./_components/onboarding-select";
import { RoomStepper } from "./_components/room-stepper";
import "./onboarding.css";

// ─── Constants ─────────────────────────────────────────────────────────────────

const STORAGE_KEY = "hotelos_onboarding_data";

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

// ─── Motion variants ─────────────────────────────────────────────────────────────

const slideVariants = {
  initial: (dir: number) => ({ opacity: 0, x: dir * 24, filter: "blur(4px)" }),
  animate: { opacity: 1, x: 0, filter: "blur(0px)" },
  exit: (dir: number) => ({ opacity: 0, x: dir * -24, filter: "blur(4px)" }),
};

const TRANSITION = { duration: 0.32, ease: [0.32, 0.72, 0, 1] as const };

// ─── Step metadata ────────────────────────────────────────────────────────────

const STEP_META = [
  {
    label: "Property Details",
    description: "Tell us about your property and what makes it unique.",
  },
  {
    label: "Location & Contact",
    description: "Help guests find you and get in touch.",
  },
  {
    label: "Review & Launch",
    description: "Confirm your details and create your profile.",
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


// ─── Page ──────────────────────────────────────────────────────────────────────

export default function OnboardingPage() {
  const { isLoaded, setActive, createOrganization, userMemberships } =
    useOrganizationList({ userMemberships: true });
  const { orgId } = useAuth();
  const { user } = useUser();
  const router = useRouter();

  const [step, setStep] = useState(1);
  const [direction, setDirection] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState<Partial<OnboardingInputType>>({
    country: "Ghana",
    number_of_rooms: 10,
    star_rating: "Unrated",
    hotel_type: "Hotel",
  });

  // Auto-fill email from Clerk user
  useEffect(() => {
    if (user?.primaryEmailAddress?.emailAddress && !formData.email) {
      setFormData((p) => ({ ...p, email: user.primaryEmailAddress!.emailAddress }));
    }
  }, [user, formData.email]);

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

  // Restore from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        
        // Validate and clamp step to valid range [1, STEP_META.length]
        if (parsed.step) {
          const restoredStep = Number(parsed.step);
          const safeStep = Number.isFinite(restoredStep)
            ? Math.min(STEP_META.length, Math.max(1, restoredStep))
            : 1;
          setStep(safeStep);
        }
        
        if (parsed.data) setFormData((p) => ({ ...p, ...parsed.data }));
      } catch {
        // Ignore parse errors
      }
    }
  }, []);

  const save = (s: number, d: Partial<OnboardingInputType>) =>
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ step: s, data: d }));

  const goNext = (e: FormEvent) => {
    e.preventDefault();
    const n = Math.min(STEP_META.length, step + 1); // Clamp to max step
    setDirection(1);
    setStep(n);
    save(n, formData);
  };

  const goBack = () => {
    const n = Math.max(1, step - 1); // Clamp to min step
    setDirection(-1);
    setStep(n);
    save(n, formData);
  };

  const handlePhoneChange = (raw: string) => {
    const region = COUNTRY_TO_REGION[formData.country ?? "Ghana"] ?? "GH";
    const formatter = new AsYouType(region as any);
    setFormData((p) => ({ ...p, phone: formatter.input(raw) }));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!createOrganization || !setActive) return;

    setLoading(true);
    setError(null);

    try {
      const org = await createOrganization({ name: formData.name! });
      const payload: OnboardingInputType = {
        name: formData.name!,
        clerk_org_id: org.id,
        address: formData.address!,
        city: formData.city!,
        country: formData.country || "Ghana",
        phone: formData.phone!,
        email: formData.email!,
        hotel_type: formData.hotel_type || "Hotel",
        number_of_rooms: Number(formData.number_of_rooms),
        star_rating: formData.star_rating,
        website: formData.website,
      };

      const result = await createHotelProfile(payload);
      if (result?.error) throw new Error(result.error);

      await setActive({ organization: org.id });
      localStorage.removeItem(STORAGE_KEY);
      router.push("/dashboard");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (!isLoaded) return <LoadingSkeleton />;

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
              HotelOS Pro
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

        {/* Bottom: Security badge */}
        <div
          className="rounded-xl p-5 flex items-start gap-3"
          style={{
            backgroundColor: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.07)",
          }}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            className="shrink-0 mt-0.5"
            aria-hidden="true"
          >
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
              Secure & Encrypted
            </p>
            <p className="text-[12px] leading-relaxed" style={{ color: "#64748b" }}>
              Your data is protected with bank-level encryption. We never share your information.
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
            HotelOS Pro
          </span>
        </div>

        {/* Step indicator bar */}
        <div
          className="px-6 sm:px-10 py-5 border-b bg-white"
          style={{ borderColor: "var(--onboarding-border)", backgroundColor: "var(--onboarding-card-bg)" }}
        >
          <StepIndicator currentStep={step} totalSteps={3} />
        </div>

        {/* Scrollable form area */}
        <div
          id="main-content"
          className="flex-1 flex items-start justify-center px-5 sm:px-10 py-8 overflow-y-auto"
        >
          <div className="w-full max-w-[32rem]">
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
                  <p className="onboarding-alert-message">{error}</p>
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
                      <p className="onboarding-eyebrow" style={{ color: "var(--onboarding-text-muted)" }}>
                        Step 1 of 3
                      </p>
                      <h2 className="onboarding-section-title">Tell us about your property</h2>
                      <p className="onboarding-section-desc">
                        This information helps set up your profile and is visible to your team.
                      </p>
                    </div>

                    <form onSubmit={goNext} className="onboarding-form">
                      <OBInput
                        label="Property Name"
                        required
                        autoFocus
                        placeholder="e.g. The Grand Harbour Hotel"
                        value={formData.name ?? ""}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      />

                      <div className="onboarding-form-row">
                        <OBSelect
                          label="Property Type"
                          required
                          options={HOTEL_TYPE_OPTIONS}
                          value={formData.hotel_type ?? "Hotel"}
                          onChange={(e) => setFormData({ ...formData, hotel_type: e.target.value })}
                        />
                        <OBSelect
                          label="Star Rating"
                          options={STAR_RATING_OPTIONS}
                          hint="Optional"
                          value={formData.star_rating ?? "Unrated"}
                          onChange={(e) => setFormData({ ...formData, star_rating: e.target.value })}
                        />
                      </div>

                      <RoomStepper
                        label="Total Rooms"
                        value={formData.number_of_rooms ?? 10}
                        onChange={(val) => setFormData({ ...formData, number_of_rooms: val })}
                        hint="Count all room types including suites"
                      />

                      <div className="pt-2">
                        <button type="submit" className="onboarding-button-primary w-full">
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
                      <p className="onboarding-eyebrow" style={{ color: "var(--onboarding-text-muted)" }}>
                        Step 2 of 3
                      </p>
                      <h2 className="onboarding-section-title">Location & contact</h2>
                      <p className="onboarding-section-desc">
                        Guests use this to find and reach you. Keep it accurate.
                      </p>
                    </div>

                    <form onSubmit={goNext} className="onboarding-form">
                      <OBInput
                        label="Street Address"
                        required
                        autoFocus
                        placeholder="e.g. 14 Independence Avenue"
                        value={formData.address ?? ""}
                        onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                      />

                      <div className="onboarding-form-row">
                        <OBInput
                          label="City"
                          required
                          placeholder="e.g. Accra"
                          value={formData.city ?? ""}
                          onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                        />
                        <OBSelect
                          label="Country"
                          required
                          options={COUNTRY_OPTIONS}
                          value={formData.country ?? "Ghana"}
                          onChange={(e) =>
                            setFormData({ ...formData, country: e.target.value, phone: "" })
                          }
                        />
                      </div>

                      <div className="onboarding-form-row">
                        <OBInput
                          label="Phone Number"
                          required
                          type="tel"
                          placeholder="e.g. 030 200 0000"
                          value={formData.phone ?? ""}
                          onChange={(e) => handlePhoneChange(e.target.value)}
                          hint="Auto-formatted"
                        />
                        <OBInput
                          label="Email Address"
                          required
                          type="email"
                          placeholder="info@yourhotel.com"
                          value={formData.email ?? ""}
                          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        />
                      </div>

                      <OBInput
                        label="Website"
                        type="url"
                        placeholder="https://yourhotel.com"
                        value={formData.website ?? ""}
                        onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                        hint="Optional"
                      />

                      <div className="onboarding-button-group pt-2">
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
                      <p className="onboarding-eyebrow" style={{ color: "var(--onboarding-text-muted)" }}>
                        Step 3 of 3 — Almost there
                      </p>
                      <h2 className="onboarding-section-title">Review your details</h2>
                      <p className="onboarding-section-desc">
                        Everything looks good? Create your property profile.
                      </p>
                    </div>

                    <form onSubmit={handleSubmit} className="onboarding-form">
                      {/* Summary card */}
                      <div className="onboarding-summary-card">
                        <div className="onboarding-summary-row">
                          <span className="onboarding-summary-icon" aria-hidden="true">🏨</span>
                          <div className="onboarding-summary-content">
                            <p className="onboarding-summary-label">Property</p>
                            <p className="onboarding-summary-value">{formData.name}</p>
                            <p className="onboarding-summary-sub">
                              {formData.hotel_type} · {formData.star_rating !== "Unrated" ? `${formData.star_rating}★` : "Unrated"} · {formData.number_of_rooms} rooms
                            </p>
                          </div>
                        </div>

                        <div className="onboarding-summary-row">
                          <span className="onboarding-summary-icon" aria-hidden="true">📍</span>
                          <div className="onboarding-summary-content">
                            <p className="onboarding-summary-label">Location</p>
                            <p className="onboarding-summary-value">{formData.address}</p>
                            <p className="onboarding-summary-sub">
                              {formData.city}, {formData.country}
                            </p>
                          </div>
                        </div>

                        <div className="onboarding-summary-row">
                          <span className="onboarding-summary-icon" aria-hidden="true">📞</span>
                          <div className="onboarding-summary-content">
                            <p className="onboarding-summary-label">Contact</p>
                            <p className="onboarding-summary-value">{formData.phone ?? "—"}</p>
                            <p className="onboarding-summary-sub">{formData.email ?? "—"}</p>
                          </div>
                        </div>

                        {formData.website && (
                          <div className="onboarding-summary-row">
                            <span className="onboarding-summary-icon" aria-hidden="true">🌐</span>
                            <div className="onboarding-summary-content">
                              <p className="onboarding-summary-label">Website</p>
                              <p className="onboarding-summary-value">{formData.website}</p>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Terms notice */}
                      <p className="text-[12px] text-center" style={{ color: "var(--onboarding-text-muted)" }}>
                        By creating your profile you agree to our{" "}
                        <a
                          href="#"
                          className="underline underline-offset-2 hover:text-gray-600 transition-colors"
                        >
                          Terms
                        </a>
                        {" "}and{" "}
                        <a
                          href="#"
                          className="underline underline-offset-2 hover:text-gray-600 transition-colors"
                        >
                          Privacy Policy
                        </a>
                        .
                      </p>

                      <div className="onboarding-button-group">
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
                              Create Property Profile
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
            © 2026 HotelOS Pro
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
              Secured by Clerk · Data encrypted at rest
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
