import { confirmedCompensationCents } from "./compensation.ts";
import {
  availabilityCoversBlockedRange,
  calculateBlockedRange,
  calculateRemainingHeadcount,
  detectConfirmedAssignmentConflict,
  toAssignmentSchedule,
  validateRequestedCrewSize,
  type ScheduleWindow,
} from "./scheduling.ts";
import { formatLongDate } from "./time.ts";
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
  const crew = validateRequestedCrewSize({
    maxHelperCount: input.cleaner.maxHelperCount,
    requestedCrewSize: input.requestedCrewSize,
    remainingHeadcount,
  });
  if (!crew.ok) return crew;

  const blocked = calculateBlockedRange({
    date: input.assignment.serviceDate,
    arrivalWindowStart: input.assignment.arrivalWindowStart,
    arrivalWindowEnd: input.assignment.arrivalWindowEnd,
    expectedDurationMinutes: input.assignment.expectedDurationMinutes,
  });
  const conflict = detectConfirmedAssignmentConflict({
    cleanerId: input.cleaner.cleanerId,
    candidate: {
      serviceDate: input.assignment.serviceDate,
      arrivalWindowStart: input.assignment.arrivalWindowStart,
      arrivalWindowEnd: input.assignment.arrivalWindowEnd,
      expectedDurationMinutes: input.assignment.expectedDurationMinutes,
    },
    confirmedAssignments: input.cleanerConfirmedAssignments.map(toAssignmentSchedule),
    ignoreAssignmentId: input.assignment.assignmentId,
  });
  if (conflict) {
    return { ok: false, message: "You already have a confirmed cleaning during this time." };
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
          pendingCrewSize: undefined,
          attentionReason: undefined,
          respondedAt: assignment.respondedAt ?? nowIso,
          updatedAt: nowIso,
        }
      : assignment,
  );
}

export function withAssignmentPendingAvailability(
  assignments: JobAssignment[],
  assignmentId: string,
  pendingCrewSize: number,
  nowIso: string,
): JobAssignment[] {
  return assignments.map((assignment) =>
    assignment.assignmentId === assignmentId
      ? {
          ...assignment,
          status: "PENDING_AVAILABILITY",
          pendingCrewSize,
          confirmedCrewSize: undefined,
          confirmedTotalPayCents: undefined,
          attentionReason: undefined,
          respondedAt: nowIso,
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

export function expireRemainingInvitationsWhenFilled(
  assignments: JobAssignment[],
  headcountNeeded: number,
  nowIso: string,
): JobAssignment[] {
  const confirmed = assignments.reduce((sum, assignment) => {
    if (assignment.status !== "CONFIRMED") return sum;
    return sum + (assignment.confirmedCrewSize ?? 0);
  }, 0);
  if (confirmed < headcountNeeded) return assignments;
  return assignments.map((assignment) =>
    assignment.status === "INVITED" || assignment.status === "PENDING_AVAILABILITY"
      ? { ...assignment, status: "EXPIRED_JOB_FILLED", pendingCrewSize: undefined, updatedAt: nowIso }
      : assignment,
  );
}

export function availabilityFollowUpReason(
  firstName: string,
  weekStart: string,
  kind: "outside" | "conflict",
): string {
  const week = formatLongDate(weekStart);
  if (kind === "outside") {
    return `${firstName} submitted availability for the week of ${week}, but this cleaning falls outside those hours. Follow up with ${firstName}.`;
  }
  return `${firstName}'s submitted availability for the week of ${week} conflicts with another confirmed cleaning. Follow up with ${firstName}.`;
}

/**
 * After a week of availability is submitted, confirm pending rows that fit and flag
 * confirmed or pending assignments that no longer fit the submitted windows.
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
        (assignment.status === "PENDING_AVAILABILITY" ||
          assignment.status === "CONFIRMED" ||
          assignment.status === "NEEDS_ATTENTION") &&
        ((assignment.serviceDate >= input.weekStart && assignment.serviceDate <= input.weekEnd) ||
          coveredDates.has(assignment.serviceDate)),
    )
    .sort((a, b) => a.serviceDate.localeCompare(b.serviceDate) || a.assignmentId.localeCompare(b.assignmentId));

  for (const row of inWeek) {
    const index = next.findIndex((assignment) => assignment.assignmentId === row.assignmentId);
    const current = next[index];
    const crewSize = current.confirmedCrewSize ?? current.pendingCrewSize ?? current.proposedCrewSize;
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
      const attentionReason =
        failure.kind === "outside"
          ? availabilityFollowUpReason(input.cleaner.firstName, input.weekStart, "outside")
          : failure.kind === "conflict"
            ? availabilityFollowUpReason(input.cleaner.firstName, input.weekStart, "conflict")
            : failure.message;
      next[index] = {
        ...current,
        status: "NEEDS_ATTENTION",
        attentionReason,
        availabilityConflictWeekStart:
          failure.kind === "outside" || failure.kind === "conflict" ? input.weekStart : undefined,
        confirmedCrewSize: undefined,
        confirmedTotalPayCents: undefined,
        pendingCrewSize: undefined,
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
        pendingCrewSize: undefined,
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

function pendingFailureReason(input: {
  assignment: JobAssignment;
  job: Pick<Job, "jobId" | "status" | "headcountNeeded"> | undefined;
  cleaner: Pick<CleanerProfile, "cleanerId" | "status" | "maxHelperCount">;
  crewSize: number;
  windows: ScheduleWindow[];
  assignments: JobAssignment[];
}): { kind: "outside" | "conflict" | "other"; message: string } | null {
  if (!input.job || input.job.status !== "SCHEDULED") {
    return { kind: "other", message: "This cleaning is no longer scheduled." };
  }
  if (input.cleaner.status !== "ACTIVE") {
    return { kind: "other", message: "This cleaner is not active." };
  }
  const crew = validateRequestedCrewSize({
    maxHelperCount: input.cleaner.maxHelperCount,
    requestedCrewSize: input.crewSize,
    remainingHeadcount: calculateRemainingHeadcount(
      input.job.headcountNeeded,
      input.assignments.filter(
        (assignment) =>
          assignment.jobId === input.job!.jobId && assignment.assignmentId !== input.assignment.assignmentId,
      ),
    ),
  });
  if (!crew.ok) return { kind: "other", message: crew.message };
  const blocked = calculateBlockedRange({
    date: input.assignment.serviceDate,
    arrivalWindowStart: input.assignment.arrivalWindowStart,
    arrivalWindowEnd: input.assignment.arrivalWindowEnd,
    expectedDurationMinutes: input.assignment.expectedDurationMinutes,
  });
  if (!availabilityCoversBlockedRange(input.windows, blocked)) {
    return { kind: "outside", message: "This schedule is outside the cleaner's submitted availability." };
  }
  const conflict = detectConfirmedAssignmentConflict({
    cleanerId: input.cleaner.cleanerId,
    candidate: {
      serviceDate: input.assignment.serviceDate,
      arrivalWindowStart: input.assignment.arrivalWindowStart,
      arrivalWindowEnd: input.assignment.arrivalWindowEnd,
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
