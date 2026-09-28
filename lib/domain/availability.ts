import type { AvailabilitySubmission, AvailabilityWindow, CleanerProfile } from "./types.ts";
import { addDays, daysBetween, isValidLocalTime, minutesFromTime } from "./time.ts";

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
