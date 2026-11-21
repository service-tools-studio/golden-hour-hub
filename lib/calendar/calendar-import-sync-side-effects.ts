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

/** Cleaners still on the job (invited or confirmed) when Gmail reschedules — needs admin re-invite follow-up. */
export function calendarRescheduleStaffingCleanerIdsFromHub(hub: HubData, jobId: string): string[] {
  return hub.assignments
    .filter(
      (item) =>
        item.jobId === jobId &&
        item.status !== "CANCELED" &&
        item.status !== "EXPIRED_JOB_FILLED" &&
        (item.status === "INVITED" || item.status === "CONFIRMED" || item.status === "NEEDS_ATTENTION"),
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

export function mergeJobPartitionIntoHub(hub: HubData, slice: HubData, jobId: string): HubData {
  const job = slice.jobs.find((item) => item.jobId === jobId);
  if (!job) return hub;
  const jobs = hub.jobs.some((item) => item.jobId === jobId)
    ? hub.jobs.map((item) => (item.jobId === jobId ? job : item))
    : [...hub.jobs, job];
  const sliceAssignments = slice.assignments.filter((item) => item.jobId === jobId);
  const otherAssignments = hub.assignments.filter((item) => item.jobId !== jobId);
  return {
    ...hub,
    jobs,
    assignments: [...otherAssignments, ...sliceAssignments],
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
  const assignments = hub.assignments.map((item) => {
    if (item.jobId !== jobId || item.status === "CANCELED" || item.status === "EXPIRED_JOB_FILLED") {
      return item;
    }
    const tracksDate = item.status === "INVITED" || item.status === "CONFIRMED";
    const baseline = item.notifiedServiceDate ?? item.serviceDate;
    const dateMoved = tracksDate && patch.date !== baseline;
    let needsReinvite = dateMoved;
    if (tracksDate && !needsReinvite) {
      const norm = (value: string | undefined) => value?.trim() || undefined;
      const jobArrival = norm(patch.arrivalWindowStart ?? item.arrivalWindowStart);
      const lastTexted = norm(item.lastNotified?.arrivalWindowStart);
      const assignArrival = norm(item.arrivalWindowStart);
      const arrivalBaseline = lastTexted ?? assignArrival;
      if (jobArrival && arrivalBaseline && jobArrival !== arrivalBaseline) {
        needsReinvite = true;
      }
    }
    const notifiedServiceDate = tracksDate ? baseline : item.notifiedServiceDate;
    const reopenInvite = dateMoved && item.status === "CONFIRMED";
    return {
      ...item,
      serviceDate: patch.date,
      arrivalWindowStart: patch.arrivalWindowStart ?? item.arrivalWindowStart,
      arrivalWindowEnd: patch.arrivalWindowEnd ?? item.arrivalWindowEnd,
      notifiedServiceDate,
      needsDateReinvite: needsReinvite ? true : undefined,
      status: reopenInvite ? "INVITED" : item.status,
      confirmedCrewSize: reopenInvite ? undefined : item.confirmedCrewSize,
      confirmedTotalPayCents: reopenInvite ? undefined : item.confirmedTotalPayCents,
      respondedAt: reopenInvite ? undefined : item.respondedAt,
      invitedAt: reopenInvite ? now : item.invitedAt,
      updatedAt: now,
    };
  });
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
    assignments,
  };
}