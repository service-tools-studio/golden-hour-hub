import { CALENDAR_IMPORT_HORIZON_DAYS } from "../domain/calendar-import.ts";
import { addDays } from "../domain/time.ts";
import type { CalendarImport, Job } from "../domain/types.ts";
import type { HubData } from "../mock/seed.ts";

export const CALENDAR_SYNC_ACTOR = "calendar-sync";

export function calendarImportSyncHorizonEnd(today: string): string {
  return addDays(today, CALENDAR_IMPORT_HORIZON_DAYS);
}

/** Pending or approved staging row no longer returned by Google Calendar for this window. */
export function calendarImportMissingFromGoogleSync(
  row: Pick<CalendarImport, "googleCalendarEventId" | "serviceDate" | "status">,
  seenGoogleEventIds: Set<string>,
  today: string,
  horizonEnd: string,
): boolean {
  if (seenGoogleEventIds.has(row.googleCalendarEventId)) return false;
  if (row.serviceDate < today || row.serviceDate > horizonEnd) return false;
  return (
    row.status === "PENDING_REVIEW" ||
    row.status === "APPROVED" ||
    row.status === "CALENDAR_CANCELED"
  );
}

/** Whether a calendar import should be withdrawn when Google removes or cancels the event. */
export function calendarImportShouldWithdrawFromGoogleSync(
  row: CalendarImport,
  activeJobId: string | undefined,
): boolean {
  if (row.status === "CALENDAR_CANCELED") return Boolean(activeJobId);
  if (row.status === "REJECTED" || row.status === "WITHDRAWN") return Boolean(activeJobId);
  return row.status === "PENDING_REVIEW" || row.status === "APPROVED";
}

export function calendarCanceledCleanerIdsFromHub(hub: HubData, jobId: string): string[] {
  return hub.assignments
    .filter(
      (item) =>
        item.jobId === jobId &&
        item.status !== "CANCELED" &&
        item.status !== "EXPIRED_JOB_FILLED" &&
        (item.status === "CONFIRMED" || item.status === "NEEDS_ATTENTION"),
    )
    .map((item) => item.cleanerId);
}

export function cancelJobFromCalendarSync(hub: HubData, jobId: string): HubData {
  const job = hub.jobs.find((item) => item.jobId === jobId);
  if (!job || job.status === "CANCELED") return hub;
  const now = new Date().toISOString();
  return {
    ...hub,
    jobs: hub.jobs.map((item) =>
      item.jobId === jobId
        ? { ...item, status: "CANCELED", updatedAt: now, updatedBy: CALENDAR_SYNC_ACTOR }
        : item,
    ),
    assignments: hub.assignments.map((item) =>
      item.jobId === jobId && item.status !== "CANCELED" && item.status !== "EXPIRED_JOB_FILLED"
        ? { ...item, status: "CANCELED", updatedAt: now }
        : item,
    ),
  };
}

export function rescheduleJobFromCalendarSync(
  hub: HubData,
  jobId: string,
  patch: Pick<Job, "date" | "arrivalWindowStart" | "arrivalWindowEnd">,
): HubData {
  const job = hub.jobs.find((item) => item.jobId === jobId);
  if (!job || job.status === "CANCELED") return hub;
  const now = new Date().toISOString();
  return {
    ...hub,
    jobs: hub.jobs.map((item) =>
      item.jobId === jobId
        ? {
            ...item,
            date: patch.date,
            arrivalWindowStart: patch.arrivalWindowStart,
            arrivalWindowEnd: patch.arrivalWindowEnd,
            updatedAt: now,
            updatedBy: CALENDAR_SYNC_ACTOR,
          }
        : item,
    ),
  };
}