"use client";

import { availabilityAgainstSpan, cleaningTimeSpan, staffingAvailabilityWindows } from "@/lib/domain/availability";
import { availabilityCoversBlockedRange, calculateBlockedRange } from "@/lib/domain/scheduling";
import type { JobAssignment } from "@/lib/domain/types";
import { formatLongDate, formatTimeLabel, hourWindowLabel } from "@/lib/format";

export function CleanerAvailabilityPreview({
  cleanerId,
  cleanerName,
  date,
  availabilityWindows,
  assignments,
  ignoreAssignmentId,
  arrivalStart,
  arrivalEnd,
  durationMinutes,
}: {
  cleanerId: string;
  cleanerName: string;
  date: string;
  availabilityWindows: { start: string; end: string }[];
  assignments: JobAssignment[];
  ignoreAssignmentId?: string;
  arrivalStart: string;
  arrivalEnd: string;
  durationMinutes: number;
}) {
  const effectiveWindows = staffingAvailabilityWindows(
    availabilityWindows.map((window) => ({ cleanerId, date, ...window })),
    assignments,
    cleanerId,
    date,
    ignoreAssignmentId,
  );
  const span = arrivalStart && arrivalEnd ? cleaningTimeSpan(arrivalStart, arrivalEnd, durationMinutes) : null;
  const pills = availabilityAgainstSpan(effectiveWindows, span);
  const fitsSubmitted = Boolean(
    span &&
      availabilityCoversBlockedRange(
        effectiveWindows.map((window) => ({ date, start: window.start, end: window.end })),
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
      ) : effectiveWindows.length === 0 ? (
        <p className="mt-2 text-sm text-ink/60">No open hours left after other confirmed cleanings.</p>
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
