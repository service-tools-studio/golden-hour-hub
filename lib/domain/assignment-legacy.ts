import { confirmedCompensationCents } from "./compensation.ts";
import {
  isConfirmedScheduleConflictReason,
  isUncertainSameDayScheduleReason,
} from "./scheduling.ts";
import type { JobAssignment } from "./types.ts";

/** Stored Dynamo rows before pending-availability was retired. */
export const LEGACY_PENDING_AVAILABILITY_STATUS = "PENDING_AVAILABILITY" as const;

type LegacyAssignmentRow = JobAssignment & {
  status: JobAssignment["status"] | typeof LEGACY_PENDING_AVAILABILITY_STATUS;
  pendingCrewSize?: number;
};

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

/** Map legacy stored rows to current in-memory assignment shape. */
export function normalizeLegacyAssignment(assignment: LegacyAssignmentRow): JobAssignment {
  let next: JobAssignment =
    assignment.status === LEGACY_PENDING_AVAILABILITY_STATUS
      ? (() => {
          const crewSize =
            assignment.pendingCrewSize ?? assignment.confirmedCrewSize ?? assignment.proposedCrewSize;
          const { pendingCrewSize: _pending, ...rest } = assignment;
          return {
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
        })()
      : assignment;

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
