import type { CalendarEvent } from "../calendar.ts";
import { isUnsetArrival } from "../domain/arrival.ts";
import { hasKnownDurationMinutes } from "../domain/duration.ts";
import { calculateBlockedRange } from "../domain/scheduling.ts";
import type { Job, JobAssignment } from "../domain/types.ts";
import { cleanerServiceLabel, customerFirstNameForCleaner, formatArrival } from "../format.ts";

/** When no on-site estimate is set, cleaner calendar exports use a 1-hour block. */
export const CLEANER_CALENDAR_DEFAULT_DURATION_MINUTES = 60;

function calendarEventLocation(snapshot: Job["snapshot"]): string {
  const unit = snapshot.unit?.trim();
  const street = [snapshot.streetAddress.trim(), unit].filter(Boolean).join(", ");
  const cityLine = [snapshot.city, snapshot.state, snapshot.zip].filter(Boolean).join(" ");
  return cityLine ? `${street}, ${cityLine}` : street;
}

/** Build a calendar event for a cleaner's confirmed assignment, or null if start time is TBD. */
export function buildCleanerAssignmentCalendarEvent(
  job: Job,
  assignment: JobAssignment,
): CalendarEvent | null {
  if (isUnsetArrival(assignment.arrivalWindowStart, assignment.arrivalWindowEnd)) return null;
  const durationMinutes = hasKnownDurationMinutes(assignment.expectedDurationMinutes)
    ? assignment.expectedDurationMinutes
    : CLEANER_CALENDAR_DEFAULT_DURATION_MINUTES;
  const range = calculateBlockedRange({
    date: assignment.serviceDate,
    arrivalWindowStart: assignment.arrivalWindowStart!,
    arrivalWindowEnd: assignment.arrivalWindowEnd!,
    expectedDurationMinutes: durationMinutes,
  });
  const notes = [
    `Start time: ${formatArrival(assignment.arrivalWindowStart, assignment.arrivalWindowEnd)}`,
    job.snapshot.preferences ? `Preferences: ${job.snapshot.preferences}` : "",
    job.specialInstructions ? `Instructions: ${job.specialInstructions}` : "",
  ].filter(Boolean);
  return {
    uid: `${assignment.assignmentId}@goldenhourhub`,
    title: `Golden Hour: ${customerFirstNameForCleaner(job.snapshot)} – ${cleanerServiceLabel(job.serviceType)}`,
    start: range.startUtc,
    end: range.endUtc,
    location: calendarEventLocation(job.snapshot),
    notes: notes.join("\n"),
  };
}