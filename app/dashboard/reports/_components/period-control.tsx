"use client";

import { useId, useState } from "react";
import { Button } from "@heroui/react";
import { shiftReportDate, validateReportRange, type ReportRange } from "./report-utils";

export function PeriodControl({ startDate, endDate, today, onChange }: {
  startDate: string;
  endDate: string;
  today: string;
  onChange: (start: string, end: string) => void;
}) {
  const id = useId();
  const [draft, setDraft] = useState<ReportRange>({ startDate, endDate });
  const [error, setError] = useState<string | null>(null);
  const changed = draft.startDate !== startDate || draft.endDate !== endDate;

  function apply(range: ReportRange) {
    const validation = validateReportRange(range, today);
    setError(validation);
    if (!validation) onChange(range.startDate, range.endDate);
  }

  return (
    <form className="reports-period" noValidate onSubmit={(event) => { event.preventDefault(); apply(draft); }} aria-label="Report date range">
      <div className="reports-presets" role="group" aria-label="Quick date ranges">
        {[7, 30, 90].map((days) => {
          const start = shiftReportDate(today, 1 - days);
          return <Button key={days} variant="ghost" className="reports-control" aria-pressed={startDate === start && endDate === today}
            onPress={() => { const range = { startDate: start, endDate: today }; setDraft(range); apply(range); }}>
            {days} days
          </Button>;
        })}
      </div>
      <div className="reports-date-fields">
        <label htmlFor={`${id}-start`}>Start date
          <input id={`${id}-start`} type="date" value={draft.startDate} max={today}
            aria-invalid={Boolean(error)} aria-describedby={`${id}-hint`}
            onChange={(event) => { setDraft({ ...draft, startDate: event.target.value }); setError(null); }} />
        </label>
        <label htmlFor={`${id}-end`}>End date
          <input id={`${id}-end`} type="date" value={draft.endDate} max={today}
            aria-invalid={Boolean(error)} aria-describedby={`${id}-hint`}
            onChange={(event) => { setDraft({ ...draft, endDate: event.target.value }); setError(null); }} />
        </label>
        <Button type="submit" variant="secondary" className="reports-control reports-apply" isDisabled={!changed && !error}>Apply dates</Button>
      </div>
      <p id={`${id}-hint`} className={error ? "reports-form-error" : "reports-date-hint"} role={error ? "alert" : undefined}>
        {error ?? (changed ? "Dates changed. Apply to update the report." : "Inclusive dates · up to 366 days")}
      </p>
    </form>
  );
}
