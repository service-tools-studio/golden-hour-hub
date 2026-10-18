"use client";

import { availabilityAgainstSpan, cleaningTimeSpan } from "@/lib/domain/availability";
import { availabilityCoversBlockedRange, calculateBlockedRange } from "@/lib/domain/scheduling";
import { formatLongDate, formatTimeLabel, hourWindowLabel } from "@/lib/format";

export function CleanerAvailabilityPreview({
  cleanerName,
  date,
  availabilityWindows,
  arrivalStart,
  arrivalEnd,
  durationMinutes,
}: {
  cleanerName: string;
  date: string;
  availabilityWindows: { start: string; end: string }[];
  arrivalStart: string;
  arrivalEnd: string;
  durationMinutes: number;
}) {
  const span = arrivalStart && arrivalEnd ? cleaningTimeSpan(arrivalStart, arrivalEnd, durationMinutes) : null;
  const pills = availabilityAgainstSpan(availabilityWindows, span);
  const fitsSubmitted = Boolean(
    span &&
      availabilityCoversBlockedRange(
        availabilityWindows.map((window) => ({ date, start: window.start, end: window.end })),
        calculateBlockedRange({
          date,
          arrivalWindowStart: arrivalStart,
          arrivalWindowEnd: arrivalEnd,
          expectedDurationMinutes: durationMinutes,
        }),
      ),
  );

  return (
    <div className="rounded-2xl bg-cream px-4 py-3">
      <p className="text-sm font-medium text-ink/80">
        {cleanerName}&apos;s availability · {formatLongDate(date)}
      </p>
      {availabilityWindows.length === 0 ? (
        <p className="mt-2 text-sm text-ink/60">No submitted availability on this day.</p>
      ) : (
        <>
          <div className="mt-2 flex flex-wrap gap-1">
            {pills.map((pill) => (
              <span
                key={`${pill.start}-${pill.end}`}
                className={`rounded-full px-2 py-0.5 text-xs font-semibold ${pill.fits ? "bg-mint text-ink" : "bg-ink/10 text-ink/55"}`}
              >
                {hourWindowLabel(pill.start, pill.end)}
              </span>
            ))}
          </div>
          {span ? (
            <p className="mt-2 text-xs leading-5 text-ink/55">
              Est. on site {formatTimeLabel(span.start)}–{formatTimeLabel(span.end)}
              {fitsSubmitted ? " · fits submitted hours at this estimate" : " · may not fit submitted hours at this estimate"}
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
