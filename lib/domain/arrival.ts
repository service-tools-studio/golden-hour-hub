import { isValidLocalTime, minutesFromTime } from "./time.ts";
import type { AssignmentNotice, Result } from "./types.ts";

/** Cleaners are scheduled at a single start time; end mirrors start in storage. */
export function normalizeArrivalWindow(start: string): { arrivalWindowStart: string; arrivalWindowEnd: string } {
  return { arrivalWindowStart: start, arrivalWindowEnd: start };
}

export function validateArrivalWindow(
  start: string,
  end: string,
): Result<{ arrivalWindowStart: string; arrivalWindowEnd: string }> {
  if (!isValidLocalTime(start) || !isValidLocalTime(end)) {
    return { ok: false, message: "Enter a valid start time." };
  }
  if (minutesFromTime(end) < minutesFromTime(start)) {
    return { ok: false, message: "Enter a valid start time." };
  }
  return { ok: true, ...normalizeArrivalWindow(start) };
}

/** Visit-level start time may be unset until the admin picks a time or leaves it TBD. */
export function validateOptionalVisitArrival(
  start?: string,
  end?: string,
): Result<{ arrivalWindowStart?: string; arrivalWindowEnd?: string }> {
  if (start === undefined && end === undefined) return { ok: true };
  if (start === undefined || end === undefined) {
    return { ok: false, message: "Enter a valid start time." };
  }
  const parsed = validateArrivalWindow(start, end);
  if (!parsed.ok) return parsed;
  return {
    ok: true,
    arrivalWindowStart: parsed.arrivalWindowStart,
    arrivalWindowEnd: parsed.arrivalWindowEnd,
  };
}

/** Whether the cleaner-facing assignment details match what they were last told. */
export function assignmentNoticeInSync(lastNotified: AssignmentNotice, current: AssignmentNotice): boolean {
  return (
    lastNotified.arrivalWindowStart === current.arrivalWindowStart &&
    lastNotified.expectedDurationMinutes === current.expectedDurationMinutes &&
    lastNotified.proposedCrewSize === current.proposedCrewSize &&
    lastNotified.payType === current.payType &&
    lastNotified.payPerPersonCents === current.payPerPersonCents
  );
}
