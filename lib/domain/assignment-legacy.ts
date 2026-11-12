import { confirmedCompensationCents } from "./compensation.ts";
import {
  isConfirmedScheduleConflictReason,
  isUncertainSameDayScheduleReason,
} from "./scheduling.ts";
import type { JobAssignment } from "./types.ts";

/** Stored Dynamo rows before pending-availability was retired. */
export const LEGACY_PENDING_AVAILABILITY_STATUS = "PENDING_AVAILABILITY" as const;

const KNOWN_STATUSES = new Set<JobAssignment["status"]>([
  "INVITED",
  "CONFIRMED",
  "NEEDS_ATTENTION",
  "DECLINED",
  "CANCELED",
  "EXPIRED_JOB_FILLED",
]);

/** Assignment row as stored in Dynamo (may include retired status values). */
export type LegacyAssignmentRow = Omit<JobAssignment, "status"> & {
  status: string;
  pendingCrewSize?: number;
};

function assignmentStatusFromStore(status: string): JobAssignment["status"] {
  if (KNOWN_STATUSES.has(status as JobAssignment["status"])) {
    return status as JobAssignment["status"];
  }
  return "INVITED";
}

function promoteConflictNeedsAttention(assignment: JobAssignment): JobAssignment {
  const crewSize = assignment.confirmedCrewSize ?? assignment.proposedCrewSize;
  return {
    ...assignment,
    status: "CONFIRMED",
    confirmedCrewSize: crewSize,
    confirmedTotalPayCents:
      assignment.confirmedTotalPayCents ??
      confirmedCompensationCents({
        payType: assignment.payType,
        payPerPersonCents: assignment.payPerPersonCents,
        confirmedCrewSize: crewSize,
      }),
    availabilityConflictWeekStart: undefined,
    respondedAt: assignment.respondedAt ?? assignment.updatedAt,
  };
}

function needsConflictPromotion(assignment: Pick<JobAssignment, "status" | "attentionReason">): boolean {
  return (
    assignment.status === "NEEDS_ATTENTION" &&
    (isConfirmedScheduleConflictReason(assignment.attentionReason) ||
      isUncertainSameDayScheduleReason(assignment.attentionReason))
  );
}

/** Map legacy stored rows to current in-memory assignment shape. */
export function normalizeLegacyAssignment(assignment: LegacyAssignmentRow): JobAssignment {
  if (
    assignment.status !== LEGACY_PENDING_AVAILABILITY_STATUS &&
    assignment.pendingCrewSize === undefined &&
    assignmentStatusFromStore(assignment.status) === assignment.status &&
    !needsConflictPromotion(assignment as JobAssignment)
  ) {
    return assignment as JobAssignment;
  }

  let next: JobAssignment;
  if (assignment.status === LEGACY_PENDING_AVAILABILITY_STATUS) {
    const crewSize =
      assignment.pendingCrewSize ?? assignment.confirmedCrewSize ?? assignment.proposedCrewSize;
    const { pendingCrewSize: _pending, status: _status, ...rest } = assignment;
    next = {
      ...rest,
      status: "CONFIRMED",
      confirmedCrewSize: crewSize,
      confirmedTotalPayCents:
        assignment.confirmedTotalPayCents ??
        confirmedCompensationCents({
          payType: assignment.payType,
          payPerPersonCents: assignment.payPerPersonCents,
          confirmedCrewSize: crewSize,
        }),
    };
  } else {
    const { pendingCrewSize: _pending, ...rest } = assignment;
    next = { ...rest, status: assignmentStatusFromStore(assignment.status) };
  }

  if (
    next.status === "NEEDS_ATTENTION" &&
    (isConfirmedScheduleConflictReason(next.attentionReason) ||
      isUncertainSameDayScheduleReason(next.attentionReason))
  ) {
    return promoteConflictNeedsAttention(next);
  }
  return next;
}

export function normalizeLegacyAssignments(assignments: JobAssignment[]): JobAssignment[] {
  return assignments.map((assignment) => normalizeLegacyAssignment(assignment as LegacyAssignmentRow));
}
