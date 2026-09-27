import type { AvailabilitySubmission, AvailabilityWindow, CleanerProfile } from "./types.ts";
import { addDays, daysBetween } from "./time.ts";

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
