"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export type BookingStepId = 1 | 2 | 3;

export interface BookingStep {
  num: BookingStepId;
  label: string;
}

export const BOOKING_STEPS: BookingStep[] = [
  { num: 1, label: "Choose stay" },
  { num: 2, label: "Personal details" },
  { num: 3, label: "Confirmation" },
];

interface BookingHeaderProps {
  hotelName: string;
  logoUrl?: string | null;
  currentStep: BookingStepId;
  /** Optional href when brand acts as a link (e.g. on Confirmation page). */
  brandHref?: string;
  /** Optional handler when brand is clicked inside the wizard (e.g. Step 2 -> Step 1). */
  onBrandClick?: () => void;
  /** Optional step navigation inside the wizard. */
  canReachStep?: (step: BookingStepId) => boolean;
  onStepChange?: (step: BookingStepId) => void;
}

/**
 * Shared top navigation bar + 3-step checkout stepper matching `pencil-booking.pen`:
 * - Desktop: 64px white bar, 28x28 rounded-xl logo + hotel name on left, centered
 *   3-step stepper (`1 Choose stay` — `2 Personal details` — `3 Confirmation`),
 *   balanced 260px right slot.
 * - Mobile: 56px white bar, 32x32 rounded-xl logo on left, compact centered stepper
 *   where only the active step displays its text label, balanced 64px right slot.
 */
export function BookingHeader({
  hotelName,
  logoUrl,
  currentStep,
  brandHref,
  onBrandClick,
  canReachStep,
  onStepChange,
}: BookingHeaderProps) {
  const monogram = hotelName.trim().charAt(0).toUpperCase() || "H";

  const logoElement = logoUrl ? (
    <Image
      src={logoUrl}
      alt=""
      width={32}
      height={32}
      className="size-8 md:size-7 shrink-0 rounded-xl object-cover ring-1 ring-black/5"
    />
  ) : (
    <span
      aria-hidden
      className="flex size-8 md:size-7 shrink-0 items-center justify-center rounded-xl bg-[#0485F7] text-[#FCFCFC] text-xs font-semibold"
    >
      {monogram}
    </span>
  );

  const brandContent = (
    <span className="inline-flex items-center gap-2 min-w-0">
      {logoElement}
      <span className="hidden md:inline truncate text-sm font-semibold tracking-[-0.2px] text-[#18181B]">
        {hotelName}
      </span>
    </span>
  );

  return (
    <header className="sticky top-0 z-40 w-full bg-white border-b border-[#E4E4E7] pt-[env(safe-area-inset-top)]">
      <div className="mx-auto flex h-14 md:h-16 max-w-[1440px] items-center justify-between booking-safe-x">
        {/* Left brand slot */}
        <div className="flex w-16 md:w-[260px] shrink-0 items-center min-w-0">
          {brandHref ? (
            <Link
              href={brandHref}
              aria-label={`${hotelName} booking page`}
              className="min-w-0 hover:opacity-80 transition-opacity touch-manipulation"
            >
              {brandContent}
            </Link>
          ) : onBrandClick ? (
            <button
              type="button"
              onClick={onBrandClick}
              aria-label={`Return to room selection at ${hotelName}`}
              className="min-w-0 text-left cursor-pointer hover:opacity-80 transition-opacity touch-manipulation"
            >
              {brandContent}
            </button>
          ) : (
            <div className="min-w-0">{brandContent}</div>
          )}
        </div>

        {/* Center 3-step stepper */}
        <nav
          aria-label="Checkout progress"
          className="flex flex-1 items-center justify-center gap-2 md:gap-3 min-w-0"
        >
          {BOOKING_STEPS.map((step, index) => {
            const isCompleted = currentStep > step.num;
            const isActive = currentStep === step.num;
            const interactive =
              !!onStepChange &&
              !!canReachStep &&
              canReachStep(step.num) &&
              step.num !== currentStep;

            const badge = (
              <span
                className={cn(
                  "flex size-6 md:size-6 shrink-0 items-center justify-center rounded-full text-2xs font-semibold transition-colors",
                  isCompleted || isActive
                    ? "bg-[#0485F7] text-[#FCFCFC]"
                    : "bg-[#EBEBEC] text-[#71717A]"
                )}
              >
                {isCompleted ? (
                  <Check className="size-3 stroke-[2.75]" aria-hidden />
                ) : (
                  step.num
                )}
              </span>
            );

            const label = (
              <span
                className={cn(
                  "truncate",
                  isActive
                    ? "inline text-2xs md:text-sm font-semibold text-[#18181B]"
                    : "hidden md:inline text-sm font-medium text-[#71717A]"
                )}
              >
                {step.label}
              </span>
            );

            return (
              <React.Fragment key={step.num}>
                {index > 0 && (
                  <span
                    aria-hidden
                    className="h-px w-3 md:w-12 shrink-0 bg-[#E4E4E7]"
                  />
                )}
                {interactive ? (
                  <button
                    type="button"
                    onClick={() => onStepChange(step.num)}
                    aria-current={isActive ? "step" : undefined}
                    className="inline-flex items-center gap-2 md:gap-3 rounded-full py-1 cursor-pointer hover:opacity-80 transition-opacity touch-manipulation"
                  >
                    {badge}
                    {label}
                  </button>
                ) : (
                  <span
                    aria-current={isActive ? "step" : undefined}
                    className="inline-flex items-center gap-2 md:gap-3 py-1"
                  >
                    {badge}
                    {label}
                  </span>
                )}
              </React.Fragment>
            );
          })}
        </nav>

        {/* Right symmetric balance slot */}
        <div className="flex w-16 md:w-[260px] shrink-0 items-center justify-end" />
      </div>
    </header>
  );
}
