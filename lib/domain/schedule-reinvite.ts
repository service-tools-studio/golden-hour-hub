import type { Job, JobAssignment } from "./types.ts";

export function dateReinviteNeeded(
  assignment: Pick<JobAssignment, "status" | "serviceDate" | "notifiedServiceDate">,
  date: string,
): boolean {
  if (assignment.status !== "INVITED" && assignment.status !== "CONFIRMED") return false;
  return date !== (assignment.notifiedServiceDate ?? assignment.serviceDate);
}

function normalizeNotifiedArrival(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

export function cleanerNeedsScheduleReinvite(
  assignment: Pick<
    JobAssignment,
    | "status"
    | "serviceDate"
    | "notifiedServiceDate"
    | "needsDateReinvite"
    | "lastNotified"
    | "arrivalWindowStart"
  >,
  job: Pick<Job, "date" | "arrivalWindowStart">,
): boolean {
  if (assignment.status !== "INVITED" && assignment.status !== "CONFIRMED") return false;
  if (assignment.needsDateReinvite) return true;
  if (dateReinviteNeeded(assignment, job.date)) return true;
  const jobArrival = normalizeNotifiedArrival(job.arrivalWindowStart);
  if (!jobArrival) return false;
  const lastTexted = normalizeNotifiedArrival(assignment.lastNotified?.arrivalWindowStart);
  const assignArrival = normalizeNotifiedArrival(assignment.arrivalWindowStart);
  const baseline = lastTexted ?? assignArrival;
  return Boolean(baseline && baseline !== jobArrival);
}

export function jobHasCleanerScheduleReinvite(
  job: Pick<Job, "jobId" | "date" | "arrivalWindowStart">,
  assignments: JobAssignment[],
): boolean {
  return assignments.some(
    (item) =>
      item.jobId === job.jobId &&
      item.status !== "CANCELED" &&
      item.status !== "EXPIRED_JOB_FILLED" &&
      cleanerNeedsScheduleReinvite(item, job),
  );
}