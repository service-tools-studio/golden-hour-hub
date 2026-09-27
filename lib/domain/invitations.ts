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
import type { CleanerProfile, Job, JobAssignment, Result } from "./types.ts";

export function validateInvitationAcceptance(input: {
  assignment: JobAssignment;
  job: Pick<Job, "jobId" | "status" | "headcountNeeded">;
  cleaner: Pick<CleanerProfile, "cleanerId" | "status" | "helpersApproved">;
  requestedCrewSize: number;
  jobAssignments: JobAssignment[];
  cleanerConfirmedAssignments: JobAssignment[];
  availabilityWindows: ScheduleWindow[];
}): Result<{ confirmedCrewSize: number; confirmedTotalPayCents: number }> {
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
    helpersApproved: input.cleaner.helpersApproved,
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
  if (!availabilityCoversBlockedRange(input.availabilityWindows, blocked)) {
    return { ok: false, message: "This schedule is outside your submitted availability." };
  }
  const conflict = detectConfirmedAssignmentConflict({
    cleanerId: input.cleaner.cleanerId,
    blocked,
    confirmedAssignments: input.cleanerConfirmedAssignments.map(toAssignmentSchedule),
    ignoreAssignmentId: input.assignment.assignmentId,
  });
  if (conflict) {
    return { ok: false, message: "You already have a confirmed cleaning during this time." };
  }

  return {
    ok: true,
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
    assignment.status === "INVITED"
      ? { ...assignment, status: "EXPIRED_JOB_FILLED", updatedAt: nowIso }
      : assignment,
  );
}
