import { confirmedCompensationCents } from "./compensation.ts";
import { hasKnownDurationMinutes } from "./duration.ts";
import {
  availabilityCoversBlockedRange,
  availabilityCoversJobStart,
  calculateBlockedRange,
  calculateConfirmedHeadcount,
  calculateRemainingHeadcount,
  confirmedAssignmentConflictFollowUpReason,
  detectConfirmedAssignmentConflict,
  isConfirmedScheduleConflictReason,
  isUncertainSameDayScheduleReason,
  toAssignmentSchedule,
  validateRequestedCrewSize,
  type ScheduleWindow,
} from "./scheduling.ts";
import { isUnsetArrival } from "./arrival.ts";
import { formatLongDate, mondayOf } from "./time.ts";
import type { CleanerProfile, Job, JobAssignment, Result } from "./types.ts";

export type InvitationDecision =
  | { ok: true; status: "CONFIRMED"; confirmedCrewSize: number; confirmedTotalPayCents: number }
  | { ok: false; message: string };

export function validateInvitationAcceptance(input: {
  assignment: JobAssignment;
  job: Pick<Job, "jobId" | "status" | "headcountNeeded">;
  cleaner: Pick<CleanerProfile, "cleanerId" | "status" | "maxHelperCount">;
  requestedCrewSize: number;
  jobAssignments: JobAssignment[];
  cleanerConfirmedAssignments: JobAssignment[];
  availabilityWindows: ScheduleWindow[];
}): InvitationDecision {
  if (input.assignment.status !== "INVITED") {
    return { ok: false, message: "This invitation is no longer available." };
  }
  if (input.job.status !== "SCHEDULED") {
    return { ok: false, message: "This cleaning was canceled." };
  }
  if (input.assignment.jobId !== input.job.jobId) {
    return { ok: false, message: "This invitation does not match the cleaning." };
  }
  if (input.cleaner.status !== "ACTIVE") {
    return { ok: false, message: "Your account is not active. Please call Kelsey." };
  }
  if (input.cleaner.cleanerId !== input.assignment.cleanerId) {
    return { ok: false, message: "This invitation belongs to someone else." };
  }

  const remainingHeadcount = calculateRemainingHeadcount(
    input.job.headcountNeeded,
    input.jobAssignments.filter((assignment) => assignment.assignmentId !== input.assignment.assignmentId),
  );
  const headcountForInvite = Math.max(remainingHeadcount, input.assignment.proposedCrewSize);
  const crew = validateRequestedCrewSize({
    maxHelperCount: input.cleaner.maxHelperCount,
    requestedCrewSize: input.requestedCrewSize,
    remainingHeadcount: headcountForInvite,
  });
  if (!crew.ok) return crew;

  if (!isUnsetArrival(input.assignment.arrivalWindowStart, input.assignment.arrivalWindowEnd)) {
    const conflict = detectConfirmedAssignmentConflict({
      cleanerId: input.cleaner.cleanerId,
      candidate: {
        serviceDate: input.assignment.serviceDate,
        arrivalWindowStart: input.assignment.arrivalWindowStart!,
        arrivalWindowEnd: input.assignment.arrivalWindowEnd!,
        expectedDurationMinutes: input.assignment.expectedDurationMinutes,
      },
      confirmedAssignments: input.cleanerConfirmedAssignments.map(toAssignmentSchedule),
      ignoreAssignmentId: input.assignment.assignmentId,
    });
    if (conflict) {
      return { ok: false, message: "You already have a confirmed cleaning during this time." };
    }
  }

  return {
    ok: true,
    status: "CONFIRMED",
    confirmedCrewSize: input.requestedCrewSize,
    confirmedTotalPayCents: confirmedCompensationCents({
      payType: input.assignment.payType,
      payPerPersonCents: input.assignment.payPerPersonCents,
      confirmedCrewSize: input.requestedCrewSize,
    }),
  };
}

export function withAssignmentConfirmed(
  assignments: JobAssignment[],
  assignmentId: string,
  confirmedCrewSize: number,
  confirmedTotalPayCents: number,
  nowIso: string,
): JobAssignment[] {
  return assignments.map((assignment) =>
    assignment.assignmentId === assignmentId
      ? {
          ...assignment,
          status: "CONFIRMED",
          confirmedCrewSize,
          confirmedTotalPayCents,
          attentionReason: undefined,
          respondedAt: assignment.respondedAt ?? nowIso,
          updatedAt: nowIso,
        }
      : assignment,
  );
}

export function withAssignmentDeclined(
  assignments: JobAssignment[],
  assignmentId: string,
  nowIso: string,
): JobAssignment[] {
  return assignments.map((assignment) =>
    assignment.assignmentId === assignmentId && assignment.status === "INVITED"
      ? { ...assignment, status: "DECLINED", respondedAt: nowIso, updatedAt: nowIso }
      : assignment,
  );
}

/**
 * When headcount is met, clear outstanding invites only.
 * Committed cleaners (confirmed, needs attention) stay on the job.
 */
export function expireRemainingInvitationsWhenFilled(
  assignments: JobAssignment[],
  headcountNeeded: number,
  nowIso: string,
): JobAssignment[] {
  if (calculateConfirmedHeadcount(assignments) < headcountNeeded) return assignments;
  return assignments.map((assignment) =>
    assignment.status === "INVITED"
      ? { ...assignment, status: "EXPIRED_JOB_FILLED", updatedAt: nowIso }
      : assignment,
  );
}

/** After staffing changes on a job, expire outstanding invites when headcount is met. */
export function expireJobInvitesIfHeadcountMet(
  assignments: JobAssignment[],
  jobId: string,
  headcountNeeded: number,
  nowIso: string,
): JobAssignment[] {
  const onJob = assignments.filter((assignment) => assignment.jobId === jobId);
  const settled = expireRemainingInvitationsWhenFilled(onJob, headcountNeeded, nowIso);
  return [...assignments.filter((assignment) => assignment.jobId !== jobId), ...settled];
}

export function availabilityFollowUpReason(firstName: string, weekStart: string): string {
  const week = formatLongDate(weekStart);
  return `${firstName} submitted availability for the week of ${week}, but this cleaning falls outside those hours. Follow up with ${firstName}.`;
}

function isAvailabilityAttentionReason(
  assignment: Pick<JobAssignment, "attentionReason" | "availabilityConflictWeekStart">,
): boolean {
  if (assignment.availabilityConflictWeekStart) return true;
  const reason = assignment.attentionReason ?? "";
  return reason.includes("submitted availability") || reason.includes("falls outside those hours");
}

/** Re-evaluates a stored availability warning against the schedule shown in the admin form. */
export function liveAvailabilityAttentionMessage(input: {
  assignment: Pick<JobAssignment, "attentionReason" | "availabilityConflictWeekStart" | "assignmentId">;
  cleaner: Pick<CleanerProfile, "cleanerId" | "firstName">;
  serviceDate: string;
  windows: ScheduleWindow[];
  confirmedAssignments: JobAssignment[];
  arrivalWindowStart: string;
  arrivalWindowEnd: string;
  expectedDurationMinutes?: number;
}): string | null {
  const stored = input.assignment.attentionReason;
  if (!stored) return null;
  if (isConfirmedScheduleConflictReason(stored) || isUncertainSameDayScheduleReason(stored)) {
    const conflict = detectConfirmedAssignmentConflict({
      cleanerId: input.cleaner.cleanerId,
      candidate: {
        serviceDate: input.serviceDate,
        arrivalWindowStart: input.arrivalWindowStart,
        arrivalWindowEnd: input.arrivalWindowEnd,
        expectedDurationMinutes: input.expectedDurationMinutes,
      },
      confirmedAssignments: input.confirmedAssignments
        .filter((item) => item.status === "CONFIRMED")
        .map(toAssignmentSchedule),
      ignoreAssignmentId: input.assignment.assignmentId,
    });
    return conflict ? stored : null;
  }
  if (!isAvailabilityAttentionReason(input.assignment)) return stored;

  const fits = hasKnownDurationMinutes(input.expectedDurationMinutes)
    ? availabilityCoversBlockedRange(
        input.windows,
        calculateBlockedRange({
          date: input.serviceDate,
          arrivalWindowStart: input.arrivalWindowStart,
          arrivalWindowEnd: input.arrivalWindowEnd,
          expectedDurationMinutes: input.expectedDurationMinutes,
        }),
      )
    : availabilityCoversJobStart(input.windows, input.serviceDate, input.arrivalWindowStart);
  const conflict = detectConfirmedAssignmentConflict({
    cleanerId: input.cleaner.cleanerId,
    candidate: {
      serviceDate: input.serviceDate,
      arrivalWindowStart: input.arrivalWindowStart,
      arrivalWindowEnd: input.arrivalWindowEnd,
      expectedDurationMinutes: input.expectedDurationMinutes,
    },
    confirmedAssignments: input.confirmedAssignments
      .filter((item) => item.status === "CONFIRMED")
      .map(toAssignmentSchedule),
    ignoreAssignmentId: input.assignment.assignmentId,
  });

  if (fits && !conflict) return null;

  const weekStart = input.assignment.availabilityConflictWeekStart ?? mondayOf(input.serviceDate);
  if (!fits) return availabilityFollowUpReason(input.cleaner.firstName, weekStart);
  if (conflict) return confirmedAssignmentConflictFollowUpReason(input.cleaner.firstName);
  return null;
}

/**
 * After a week of availability is submitted, flag confirmed assignments that no longer
 * fit the submitted windows or conflict with other confirmed work.
 */
export function revalidatePendingAssignments(input: {
  assignments: JobAssignment[];
  cleaner: Pick<CleanerProfile, "cleanerId" | "firstName" | "status" | "maxHelperCount">;
  weekStart: string;
  weekEnd: string;
  windows: ScheduleWindow[];
  jobs: Array<Pick<Job, "jobId" | "status" | "headcountNeeded">>;
  nowIso: string;
}): JobAssignment[] {
  const jobs = new Map(input.jobs.map((job) => [job.jobId, job]));
  let next = input.assignments.map((assignment) => ({ ...assignment }));
  const coveredDates = new Set(input.windows.map((window) => window.date));
  const inWeek = next
    .filter(
      (assignment) =>
        assignment.cleanerId === input.cleaner.cleanerId &&
        (assignment.status === "CONFIRMED" || assignment.status === "NEEDS_ATTENTION") &&
        ((assignment.serviceDate >= input.weekStart && assignment.serviceDate <= input.weekEnd) ||
          coveredDates.has(assignment.serviceDate)),
    )
    .sort((a, b) => a.serviceDate.localeCompare(b.serviceDate) || a.assignmentId.localeCompare(b.assignmentId));

  for (const row of inWeek) {
    const index = next.findIndex((assignment) => assignment.assignmentId === row.assignmentId);
    const current = next[index];
    const crewSize = current.confirmedCrewSize ?? current.proposedCrewSize;
    const job = jobs.get(current.jobId);
    const failure = pendingFailureReason({
      assignment: current,
      job,
      cleaner: input.cleaner,
      crewSize,
      windows: input.windows,
      assignments: next,
    });
    if (failure) {
      if (failure.kind === "conflict") {
        const confirmedTotalPayCents = confirmedCompensationCents({
          payType: current.payType,
          payPerPersonCents: current.payPerPersonCents,
          confirmedCrewSize: crewSize,
        });
        next[index] = {
          ...current,
          status: "CONFIRMED",
          attentionReason: confirmedAssignmentConflictFollowUpReason(input.cleaner.firstName),
          availabilityConflictWeekStart: undefined,
          confirmedCrewSize: crewSize,
          confirmedTotalPayCents,
          respondedAt: current.respondedAt ?? input.nowIso,
          updatedAt: input.nowIso,
        };
        continue;
      }
      const attentionReason =
        failure.kind === "outside"
          ? availabilityFollowUpReason(input.cleaner.firstName, input.weekStart)
          : failure.message;
      next[index] = {
        ...current,
        status: "NEEDS_ATTENTION",
        attentionReason,
        availabilityConflictWeekStart: failure.kind === "outside" ? input.weekStart : undefined,
        confirmedCrewSize: undefined,
        confirmedTotalPayCents: undefined,
        updatedAt: input.nowIso,
      };
      continue;
    }
    const confirmedTotalPayCents = confirmedCompensationCents({
      payType: current.payType,
      payPerPersonCents: current.payPerPersonCents,
      confirmedCrewSize: crewSize,
    });
    next = withAssignmentConfirmed(next, current.assignmentId, crewSize, confirmedTotalPayCents, input.nowIso);
    const settledIndex = next.findIndex((assignment) => assignment.assignmentId === current.assignmentId);
    if (settledIndex >= 0) {
      next[settledIndex] = {
        ...next[settledIndex],
        attentionReason: undefined,
        availabilityConflictWeekStart: undefined,
      };
    }
    if (job) {
      const onJob = next.filter((assignment) => assignment.jobId === job.jobId);
      const settled = expireRemainingInvitationsWhenFilled(onJob, job.headcountNeeded, input.nowIso);
      next = [...next.filter((assignment) => assignment.jobId !== job.jobId), ...settled];
    }
  }
  return next;
}

export const ASSIGNMENT_JOB_NOT_SCHEDULED_REASON = "This cleaning is no longer scheduled." as const;

export const CLEANER_AVAILABILITY_ATTENTION_MESSAGE =
  "You are confirmed for this cleaning but the job time falls outside of the availability you submitted. Please edit your availability to make this time available, or if you are not available for this job, follow up with Kelsey as soon as possible.";

export const CLEANER_SCHEDULE_CONFLICT_ATTENTION_MESSAGE =
  "This cleaning overlaps another job you're confirmed for. Contact Kelsey as soon as possible so we can fix the schedule.";

const LEGACY_AVAILABILITY_FRAMED_CONFLICT =
  /submitted availability for the week of .+ conflicts with another confirmed cleaning/i;

export function isLegacyAvailabilityFramedConflictReason(reason?: string): boolean {
  return LEGACY_AVAILABILITY_FRAMED_CONFLICT.test(reason ?? "");
}

export function isAssignmentAvailabilityOutsideReason(
  assignment: Pick<JobAssignment, "attentionReason" | "availabilityConflictWeekStart">,
): boolean {
  return (
    Boolean(assignment.availabilityConflictWeekStart) &&
    (assignment.attentionReason?.includes("falls outside those hours") ?? false)
  );
}

export function isAssignmentScheduleConflictReason(reason?: string): boolean {
  if (!reason) return false;
  if (isLegacyAvailabilityFramedConflictReason(reason)) return true;
  return isConfirmedScheduleConflictReason(reason) || isUncertainSameDayScheduleReason(reason);
}

export function normalizeAdminAttentionReason(
  reason: string | undefined,
  cleanerFirstName: string,
): string | undefined {
  if (!reason) return undefined;
  if (isLegacyAvailabilityFramedConflictReason(reason)) {
    return confirmedAssignmentConflictFollowUpReason(cleanerFirstName);
  }
  return reason;
}

export function cleanerNeedsAttentionMessage(
  assignment: Pick<JobAssignment, "attentionReason" | "availabilityConflictWeekStart">,
): string {
  if (isAssignmentAvailabilityOutsideReason(assignment)) {
    return CLEANER_AVAILABILITY_ATTENTION_MESSAGE;
  }
  if (isAssignmentScheduleConflictReason(assignment.attentionReason)) {
    return CLEANER_SCHEDULE_CONFLICT_ATTENTION_MESSAGE;
  }
  return assignment.attentionReason ?? "This cleaning needs a schedule change before it can be confirmed.";
}

/** Hide a stale availability flag after the visit was booked. */
export function assignmentAttentionReasonForAdmin(input: {
  job: Pick<Job, "status">;
  assignment: Pick<JobAssignment, "attentionReason">;
  cleanerFirstName?: string;
}): string | null {
  let reason = input.assignment.attentionReason;
  if (!reason) return null;
  if (reason === ASSIGNMENT_JOB_NOT_SCHEDULED_REASON && input.job.status === "SCHEDULED") {
    return null;
  }
  if (input.cleanerFirstName) {
    reason = normalizeAdminAttentionReason(reason, input.cleanerFirstName) ?? reason;
  }
  return reason;
}

/** Clears a draft-era flag once the parent job is `SCHEDULED`. */
export function clearStaleNotScheduledAttention(
  jobs: Array<Pick<Job, "jobId" | "status">>,
  assignments: JobAssignment[],
  nowIso: string,
): JobAssignment[] {
  const jobById = new Map(jobs.map((job) => [job.jobId, job]));
  return assignments.map((assignment) => {
    if (assignment.attentionReason !== ASSIGNMENT_JOB_NOT_SCHEDULED_REASON) return assignment;
    const job = jobById.get(assignment.jobId);
    if (!job || job.status !== "SCHEDULED") return assignment;
    if (assignment.status === "NEEDS_ATTENTION") {
      const crewSize = assignment.confirmedCrewSize ?? assignment.proposedCrewSize;
      const confirmedTotalPayCents = confirmedCompensationCents({
        payType: assignment.payType,
        payPerPersonCents: assignment.payPerPersonCents,
        confirmedCrewSize: crewSize,
      });
      return {
        ...assignment,
        status: "CONFIRMED",
        attentionReason: undefined,
        availabilityConflictWeekStart: undefined,
        confirmedCrewSize: crewSize,
        confirmedTotalPayCents,
        respondedAt: assignment.respondedAt ?? nowIso,
        updatedAt: nowIso,
      };
    }
    return {
      ...assignment,
      attentionReason: undefined,
      updatedAt: nowIso,
    };
  });
}

function pendingFailureReason(input: {
  assignment: JobAssignment;
  job: Pick<Job, "jobId" | "status" | "headcountNeeded"> | undefined;
  cleaner: Pick<CleanerProfile, "cleanerId" | "status" | "maxHelperCount">;
  crewSize: number;
  windows: ScheduleWindow[];
  assignments: JobAssignment[];
}): { kind: "outside" | "conflict" | "other"; message: string } | null {
  if (!input.job || input.job.status !== "SCHEDULED") {
    return { kind: "other", message: ASSIGNMENT_JOB_NOT_SCHEDULED_REASON };
  }
  if (input.cleaner.status !== "ACTIVE") {
    return { kind: "other", message: "This cleaner is not active." };
  }
  const crew = validateRequestedCrewSize({
    maxHelperCount: input.cleaner.maxHelperCount,
    requestedCrewSize: input.crewSize,
    remainingHeadcount: input.crewSize,
    enforceJobHeadcount: false,
  });
  if (!crew.ok) return { kind: "other", message: crew.message };
  if (isUnsetArrival(input.assignment.arrivalWindowStart, input.assignment.arrivalWindowEnd)) {
    return null;
  }
  const fits = hasKnownDurationMinutes(input.assignment.expectedDurationMinutes)
    ? availabilityCoversBlockedRange(
        input.windows,
        calculateBlockedRange({
          date: input.assignment.serviceDate,
          arrivalWindowStart: input.assignment.arrivalWindowStart!,
          arrivalWindowEnd: input.assignment.arrivalWindowEnd!,
          expectedDurationMinutes: input.assignment.expectedDurationMinutes,
        }),
      )
    : availabilityCoversJobStart(
        input.windows,
        input.assignment.serviceDate,
        input.assignment.arrivalWindowStart!,
      );
  if (!fits) {
    return { kind: "outside", message: "This schedule is outside the cleaner's submitted availability." };
  }
  const conflict = detectConfirmedAssignmentConflict({
    cleanerId: input.cleaner.cleanerId,
    candidate: {
      serviceDate: input.assignment.serviceDate,
      arrivalWindowStart: input.assignment.arrivalWindowStart!,
      arrivalWindowEnd: input.assignment.arrivalWindowEnd!,
      expectedDurationMinutes: input.assignment.expectedDurationMinutes,
    },
    confirmedAssignments: input.assignments
      .filter((assignment) => assignment.cleanerId === input.cleaner.cleanerId && assignment.status === "CONFIRMED")
      .map(toAssignmentSchedule),
    ignoreAssignmentId: input.assignment.assignmentId,
  });
  if (conflict) return { kind: "conflict", message: "This cleaning conflicts with another confirmed job." };
  return null;
}
