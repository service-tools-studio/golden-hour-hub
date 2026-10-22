import { subtractConfirmedBookingsFromAvailability, toAssignmentSchedule } from "./scheduling.ts";
import type { AvailabilitySubmission, AvailabilityWindow, CleanerProfile, JobAssignment } from "./types.ts";
import { addDays, daysBetween, isValidLocalTime, minutesFromTime, timeFromMinutes } from "./time.ts";

/** Business-day edges saved when a cleaner marks a day "All day". */
export const OPEN_DAY_START = "07:00";
export const OPEN_DAY_END = "24:00";

export function listSubmissionStatus(
  cleaners: Array<Pick<CleanerProfile, "cleanerId" | "firstName" | "lastName" | "status">>,
  submissions: Array<Pick<AvailabilitySubmission, "cleanerId" | "weekStart">>,
  weekStart: string,
): Array<{ cleanerId: string; firstName: string; lastName: string; submitted: boolean }> {
  return cleaners
    .filter((cleaner) => cleaner.status === "ACTIVE")
    .map((cleaner) => ({
      cleanerId: cleaner.cleanerId,
      firstName: cleaner.firstName,
      lastName: cleaner.lastName,
      submitted: submissions.some(
        (submission) =>
          submission.cleanerId === cleaner.cleanerId && submission.weekStart === weekStart,
      ),
    }));
}

/** Join same-day windows that meet, such as 8:00–11:00 and 11:00–17:00, into one block. */
export function mergeAdjacentWindows(windows: AvailabilityWindow[]): AvailabilityWindow[] {
  const groups = new Map<string, AvailabilityWindow[]>();
  for (const window of windows) {
    const key = `${window.cleanerId}|${window.date}`;
    const group = groups.get(key) ?? [];
    group.push(window);
    groups.set(key, group);
  }
  const merged: AvailabilityWindow[] = [];
  for (const group of groups.values()) {
    const ordered = [...group].sort((a, b) => minutesFromTime(a.start) - minutesFromTime(b.start));
    let current = ordered[0];
    for (const next of ordered.slice(1)) {
      const currentReady = isValidLocalTime(current.start) && isValidLocalTime(current.end);
      const nextReady = isValidLocalTime(next.start) && isValidLocalTime(next.end);
      const currentEnd = currentReady ? minutesFromTime(current.end) : Number.NaN;
      const nextStart = nextReady ? minutesFromTime(next.start) : Number.NaN;
      const nextEnd = nextReady ? minutesFromTime(next.end) : Number.NaN;
      if (nextStart === currentEnd && nextEnd > nextStart) {
        current = { ...current, end: next.end };
        continue;
      }
      merged.push(current);
      current = next;
    }
    if (current) merged.push(current);
  }
  return merged.sort((a, b) => (a.date === b.date ? a.start.localeCompare(b.start) : a.date.localeCompare(b.date)));
}

/** On-site span from arrival-window start through the cleaning length. 8–9 AM and 3 hours is 8 AM–11 AM. */
export function cleaningTimeSpan(
  arrivalStart: string,
  arrivalEnd: string,
  durationMinutes: number,
): { start: string; end: string } | null {
  if (!Number.isInteger(durationMinutes) || durationMinutes <= 0) return null;
  const start = minutesFromTime(arrivalStart);
  const windowEnd = minutesFromTime(arrivalEnd);
  if (!(windowEnd > start)) return null;
  const end = Math.min(start + durationMinutes, 24 * 60);
  if (!(end > start)) return null;
  return { start: timeFromMinutes(start), end: timeFromMinutes(end) };
}

export type AvailabilityFit = { start: string; end: string; fits: boolean };

/** Sort key for staffing lists: mint (fits span) first, grey pills next, none last. */
export function availabilityStaffingSortRank(pills: AvailabilityFit[]): number {
  if (pills.length === 0) return 2;
  if (pills.some((pill) => pill.fits)) return 0;
  return 1;
}

/** Submitted availability minus confirmed cleanings that day (for admin staffing pickers). */
export function staffingAvailabilityWindows(
  availability: Array<{ cleanerId: string; date: string; start: string; end: string }>,
  assignments: JobAssignment[],
  cleanerId: string,
  date: string,
  ignoreAssignmentId?: string,
): { start: string; end: string }[] {
  const dayWindows = availability
    .filter((window) => window.cleanerId === cleanerId && window.date === date)
    .map((window) => ({ date: window.date, start: window.start, end: window.end }));
  const confirmed = assignments
    .filter(
      (assignment) =>
        assignment.cleanerId === cleanerId &&
        assignment.status === "CONFIRMED" &&
        assignment.serviceDate === date &&
        assignment.assignmentId !== ignoreAssignmentId,
    )
    .map(toAssignmentSchedule);
  return subtractConfirmedBookingsFromAvailability(dayWindows, confirmed).map((window) => ({
    start: window.start,
    end: window.end,
  }));
}

/** Split a cleaner's windows into the part inside a cleaning span and the parts outside it. */
export function availabilityAgainstSpan(
  windows: { start: string; end: string }[],
  span: { start: string; end: string } | null,
): AvailabilityFit[] {
  const merged: { start: number; end: number }[] = [];
  const ordered = windows
    .map((window) => ({ start: minutesFromTime(window.start), end: minutesFromTime(window.end) }))
    .filter((window) => window.end > window.start)
    .sort((a, b) => a.start - b.start);
  for (const window of ordered) {
    const last = merged[merged.length - 1];
    if (last && window.start <= last.end) {
      if (window.end > last.end) last.end = window.end;
      continue;
    }
    merged.push({ ...window });
  }
  const spanStart = span ? minutesFromTime(span.start) : Number.NaN;
  const spanEnd = span ? minutesFromTime(span.end) : Number.NaN;
  const hasSpan = spanEnd > spanStart;
  const fits: AvailabilityFit[] = [];
  for (const window of merged) {
    if (!hasSpan || window.end <= spanStart || window.start >= spanEnd) {
      fits.push({ start: timeFromMinutes(window.start), end: timeFromMinutes(window.end), fits: false });
      continue;
    }
    if (window.start < spanStart) {
      fits.push({ start: timeFromMinutes(window.start), end: timeFromMinutes(spanStart), fits: false });
    }
    fits.push({
      start: timeFromMinutes(Math.max(window.start, spanStart)),
      end: timeFromMinutes(Math.min(window.end, spanEnd)),
      fits: true,
    });
    if (window.end > spanEnd) {
      fits.push({ start: timeFromMinutes(spanEnd), end: timeFromMinutes(window.end), fits: false });
    }
  }
  return fits;
}

export function windowsInWeek(
  windows: AvailabilityWindow[],
  cleanerId: string,
  weekStart: string,
): AvailabilityWindow[] {
  const weekEnd = addDays(weekStart, 6);
  return windows
    .filter(
      (window) =>
        window.cleanerId === cleanerId && window.date >= weekStart && window.date <= weekEnd,
    )
    .sort((a, b) => (a.date === b.date ? a.start.localeCompare(b.start) : a.date.localeCompare(b.date)));
}

export function copyWeekWindows(
  windows: AvailabilityWindow[],
  cleanerId: string,
  fromWeekStart: string,
  toWeekStart: string,
  newId: () => string,
): AvailabilityWindow[] {
  const delta = daysBetween(fromWeekStart, toWeekStart);
  return windowsInWeek(windows, cleanerId, fromWeekStart).map((window) => ({
    ...window,
    availabilityId: newId(),
    date: addDays(window.date, delta),
  }));
}
