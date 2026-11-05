import {
  assignmentScheduleNoticeInSync,
  validateOptionalVisitArrival,
} from "../domain/arrival.ts";
import { confirmedCompensationCents } from "../domain/compensation.ts";
import { validateProposedCrewSize } from "../domain/cleaners.ts";
import {
  clearStaleNotScheduledAttention,
  expireJobInvitesIfHeadcountMet,
  revalidatePendingAssignments,
} from "../domain/invitations.ts";
import {
  applyScheduleConflictWarning,
  isConfirmedScheduleConflictReason,
} from "../domain/scheduling.ts";
import { planOccurrenceStaffing } from "../domain/recurrence.ts";
import { addDays, mondayOf } from "../domain/time.ts";
import type {
  AssignmentNotice,
  CleanerProfile,
  Job,
  JobAssignment,
  PayType,
} from "../domain/types.ts";
import type { HubData } from "../mock/seed.ts";

export type SaveCleanerDetailsInput = {
  jobId: string;
  cleanerId: string;
  propertyId: string;
  arrivalWindowStart?: string;
  arrivalWindowEnd?: string;
  expectedDurationMinutes: number;
  proposedCrewSize: number;
  payType: PayType;
  payPerPersonCents: number;
  specialInstructions: string;
};

export type CompleteAssignmentInput = SaveCleanerDetailsInput & {
  assignmentId?: string;
  mode: "DRAFT" | "INVITE" | "DIRECT";
};

export type CompleteAssignmentResult =
  | { ok: true; hub: HubData; jobId: string; message: string; assignmentId?: string }
  | { ok: false; message: string };

function assignmentNotice(input: {
  arrivalWindowStart?: string;
  arrivalWindowEnd?: string;
  expectedDurationMinutes: number;
  proposedCrewSize: number;
  payType: PayType;
  payPerPersonCents: number;
}): AssignmentNotice {
  return {
    arrivalWindowStart: input.arrivalWindowStart,
    arrivalWindowEnd: input.arrivalWindowEnd,
    expectedDurationMinutes: input.expectedDurationMinutes,
    proposedCrewSize: input.proposedCrewSize,
    payType: input.payType,
    payPerPersonCents: input.payPerPersonCents,
  };
}

function withEarliestArrival(job: Job, _assignments: JobAssignment[]): Job {
  return job;
}

function jobWithCleaningArrival(job: Job, arrivalWindowStart: string, arrivalWindowEnd: string, now: string): Job {
  return {
    ...job,
    arrivalWindowStart,
    arrivalWindowEnd,
    updatedAt: now,
    updatedBy: "kelsey",
  };
}

function syncJobAssignmentsToCleaningArrival(
  assignments: JobAssignment[],
  jobId: string,
  arrivalWindowStart: string,
  arrivalWindowEnd: string,
  now: string,
): JobAssignment[] {
  return assignments.map((item) => {
    if (item.jobId !== jobId) return item;
    if (item.status === "CANCELED" || item.status === "EXPIRED_JOB_FILLED") return item;
    if (item.arrivalWindowStart === arrivalWindowStart && item.arrivalWindowEnd === arrivalWindowEnd) return item;
    return { ...item, arrivalWindowStart, arrivalWindowEnd, updatedAt: now };
  });
}

function assignmentSavedMessage(
  cleaner: CleanerProfile,
  assignment: Pick<JobAssignment, "status" | "attentionReason">,
  mode: "INVITE" | "DIRECT",
): string {
  void mode;
  if (assignment.status === "NEEDS_ATTENTION" && isConfirmedScheduleConflictReason(assignment.attentionReason)) {
    return `Assigned to ${cleaner.firstName}. Resolve the schedule conflict on this cleaning.`;
  }
  if (assignment.status === "CONFIRMED") return "Cleaning assigned.";
  if (assignment.status === "INVITED") return "Invitation sent.";
  return `Saved. Waiting for ${cleaner.firstName} to confirm.`;
}

function saveCleanerDetailsOnHub(hub: HubData, input: SaveCleanerDetailsInput): CompleteAssignmentResult {
  const job = hub.jobs.find((item) => item.jobId === input.jobId);
  if (!job || job.status === "CANCELED") return { ok: false, message: "That cleaning could not be edited." };
  if (!(job.draftCleanerIds ?? []).includes(input.cleanerId)) {
    return { ok: false, message: "Add that cleaner to the cleaning before saving their details." };
  }
  const already = hub.assignments.some(
    (assignment) =>
      assignment.jobId === job.jobId &&
      assignment.cleanerId === input.cleanerId &&
      assignment.status !== "CANCELED" &&
      assignment.status !== "EXPIRED_JOB_FILLED",
  );
  if (already) return { ok: false, message: "That cleaner is already assigned on this cleaning." };
  const cleaner = hub.cleaners.find((item) => item.cleanerId === input.cleanerId);
  if (!cleaner || cleaner.status !== "ACTIVE") return { ok: false, message: "That cleaner is not active." };
  const customer = hub.customers.find((item) => item.customerId === job.customerId && item.status === "ACTIVE");
  if (!customer) return { ok: false, message: "Choose a customer." };
  const property = hub.properties.find(
    (item) => item.propertyId === input.propertyId && item.customerId === customer.customerId && item.status === "ACTIVE",
  );
  if (!property) return { ok: false, message: "Choose one of this customer's properties." };
  const arrivalTimes = validateOptionalVisitArrival(input.arrivalWindowStart, input.arrivalWindowEnd);
  if (!arrivalTimes.ok) return arrivalTimes;
  if (
    !Number.isInteger(input.expectedDurationMinutes) ||
    input.expectedDurationMinutes < 30 ||
    input.expectedDurationMinutes > 12 * 60
  ) {
    return { ok: false, message: "Enter a duration between 30 minutes and 12 hours." };
  }
  if (job.headcountNeeded < 1) {
    return { ok: false, message: "Set the headcount on this cleaning first." };
  }
  const crew = validateProposedCrewSize(cleaner.maxHelperCount, input.proposedCrewSize);
  if (!crew.ok) return crew;
  if (!Number.isInteger(input.payPerPersonCents) || input.payPerPersonCents < 0) {
    return { ok: false, message: "Enter the pay per person." };
  }
  const now = new Date().toISOString();
  const detail = {
    cleanerId: cleaner.cleanerId,
    arrivalWindowStart: arrivalTimes.arrivalWindowStart,
    arrivalWindowEnd: arrivalTimes.arrivalWindowEnd,
    expectedDurationMinutes: input.expectedDurationMinutes,
    proposedCrewSize: input.proposedCrewSize,
    payType: input.payType,
    payPerPersonCents: input.payPerPersonCents,
  };
  const details = job.draftCleanerDetails ?? [];
  const nextJob = withEarliestArrival(
    {
      ...job,
      draftCleanerDetails: [...details.filter((item) => item.cleanerId !== cleaner.cleanerId), detail],
      updatedAt: now,
      updatedBy: "kelsey",
    },
    hub.assignments,
  );
  return {
    ok: true,
    hub: {
      ...hub,
      jobs: hub.jobs.map((item) => (item.jobId === job.jobId ? nextJob : item)),
    },
    jobId: job.jobId,
    message: "Draft saved.",
  };
}

export function completeAssignmentOnHub(hub: HubData, input: CompleteAssignmentInput): CompleteAssignmentResult {
  if (input.mode === "DRAFT" && !input.assignmentId) {
    return saveCleanerDetailsOnHub(hub, input);
  }
  const job = hub.jobs.find((item) => item.jobId === input.jobId);
  if (!job || job.status === "CANCELED") return { ok: false, message: "That cleaning could not be edited." };
  const existing = input.assignmentId
    ? hub.assignments.find((item) => item.assignmentId === input.assignmentId && item.jobId === job.jobId)
    : undefined;
  if (input.assignmentId && !existing) return { ok: false, message: "That cleaner assignment could not be found." };
  const cleanerId = existing?.cleanerId ?? input.cleanerId;
  const cleaner = hub.cleaners.find((item) => item.cleanerId === cleanerId);
  if (!cleaner || cleaner.status !== "ACTIVE") return { ok: false, message: "That cleaner is not active." };
  if (!existing && !(job.draftCleanerIds ?? []).includes(cleaner.cleanerId)) {
    return { ok: false, message: "Add that cleaner to the cleaning before saving their details." };
  }
  const arrivalTimes = validateOptionalVisitArrival(input.arrivalWindowStart, input.arrivalWindowEnd);
  if (!arrivalTimes.ok) return arrivalTimes;
  if (
    !Number.isInteger(input.expectedDurationMinutes) ||
    input.expectedDurationMinutes < 30 ||
    input.expectedDurationMinutes > 12 * 60
  ) {
    return { ok: false, message: "Enter a duration between 30 minutes and 12 hours." };
  }
  if (job.headcountNeeded < 1) {
    return { ok: false, message: "Set the headcount on this cleaning first." };
  }
  const crew = validateProposedCrewSize(cleaner.maxHelperCount, input.proposedCrewSize);
  if (!crew.ok) return crew;
  if (!Number.isInteger(input.payPerPersonCents) || input.payPerPersonCents < 0) {
    return { ok: false, message: "Enter the pay per person." };
  }
  const now = new Date().toISOString();
  const notice = assignmentNotice(input);

  if (input.mode === "DRAFT" && existing) {
    const pay = confirmedCompensationCents({
      payType: input.payType,
      payPerPersonCents: input.payPerPersonCents,
      confirmedCrewSize: input.proposedCrewSize,
    });
    let nextAssignments = hub.assignments.map((item) => {
      if (item.assignmentId !== existing.assignmentId) return item;
      let nextItem: JobAssignment = {
        ...item,
        proposedCrewSize: input.proposedCrewSize,
        confirmedCrewSize: item.status === "CONFIRMED" ? input.proposedCrewSize : item.confirmedCrewSize,
        arrivalWindowStart: arrivalTimes.arrivalWindowStart,
        arrivalWindowEnd: arrivalTimes.arrivalWindowEnd,
        expectedDurationMinutes: input.expectedDurationMinutes,
        payType: input.payType,
        payPerPersonCents: input.payPerPersonCents,
        proposedTotalPayCents: pay,
        confirmedTotalPayCents: item.status === "CONFIRMED" ? pay : item.confirmedTotalPayCents,
        lastNotified: (() => {
          const nextNotice = assignmentNotice({
            arrivalWindowStart: arrivalTimes.arrivalWindowStart,
            arrivalWindowEnd: arrivalTimes.arrivalWindowEnd,
            expectedDurationMinutes: input.expectedDurationMinutes,
            proposedCrewSize: input.proposedCrewSize,
            payType: input.payType,
            payPerPersonCents: input.payPerPersonCents,
          });
          if (!item.lastNotified) return nextNotice;
          if (assignmentScheduleNoticeInSync(item.lastNotified, nextNotice)) {
            return {
              ...item.lastNotified,
              payType: input.payType,
              payPerPersonCents: input.payPerPersonCents,
              proposedCrewSize: input.proposedCrewSize,
            };
          }
          return item.lastNotified;
        })(),
        updatedAt: now,
      };
      if (item.status === "CONFIRMED" || item.status === "NEEDS_ATTENTION") {
        const merged = hub.assignments.map((row) => (row.assignmentId === existing.assignmentId ? nextItem : row));
        nextItem = applyScheduleConflictWarning(nextItem, cleaner, merged);
      }
      return nextItem;
    });
    if (arrivalTimes.arrivalWindowStart !== undefined && arrivalTimes.arrivalWindowEnd !== undefined) {
      nextAssignments = syncJobAssignmentsToCleaningArrival(
        nextAssignments,
        job.jobId,
        arrivalTimes.arrivalWindowStart,
        arrivalTimes.arrivalWindowEnd,
        now,
      );
    }
    const nextJob =
      arrivalTimes.arrivalWindowStart !== undefined && arrivalTimes.arrivalWindowEnd !== undefined
        ? jobWithCleaningArrival(job, arrivalTimes.arrivalWindowStart, arrivalTimes.arrivalWindowEnd, now)
        : { ...job, updatedAt: now, updatedBy: "kelsey" };
    const next = withEarliestArrival(nextJob, nextAssignments);
    const savedMessage =
      existing.status === "INVITED" ||
      existing.status === "CONFIRMED" ||
      existing.status === "PENDING_AVAILABILITY" ||
      existing.status === "NEEDS_ATTENTION"
        ? "Changes saved."
        : "Draft saved.";
    return {
      ok: true,
      hub: {
        ...hub,
        jobs: hub.jobs.map((item) => (item.jobId === job.jobId ? next : item)),
        assignments: nextAssignments,
      },
      jobId: job.jobId,
      message: savedMessage,
    };
  }

  const weekStart = mondayOf(job.date);
  const availabilityByCleaner: Record<string, { submitted: boolean; windows: { date: string; start: string; end: string }[] }> =
    {};
  for (const candidate of hub.cleaners) {
    availabilityByCleaner[candidate.cleanerId] = {
      submitted: hub.submissions.some(
        (submission) => submission.cleanerId === candidate.cleanerId && submission.weekStart === weekStart,
      ),
      windows: hub.availability
        .filter((window) => window.cleanerId === candidate.cleanerId)
        .map((window) => ({ date: window.date, start: window.start, end: window.end })),
    };
  }
  const plan = planOccurrenceStaffing({
    jobId: job.jobId,
    serviceDate: job.date,
    headcountNeeded: job.headcountNeeded,
    mode: input.mode === "INVITE" ? "INVITE" : "DIRECT",
    template: [
      {
        cleanerId: cleaner.cleanerId,
        proposedCrewSize: input.proposedCrewSize,
        arrivalWindowStart: arrivalTimes.arrivalWindowStart,
        arrivalWindowEnd: arrivalTimes.arrivalWindowEnd,
        expectedDurationMinutes: input.expectedDurationMinutes,
        payType: input.payType,
        payPerPersonCents: input.payPerPersonCents,
      },
    ],
    cleaners: hub.cleaners,
    availabilityByCleaner,
    confirmedAssignments: hub.assignments.filter(
      (item) => item.status === "CONFIRMED" && item.assignmentId !== existing?.assignmentId,
    ),
    nowIso: now,
    newId: () => existing?.assignmentId ?? `as-${Date.now()}`,
  });
  if (plan.attention.length > 0) return { ok: false, message: plan.attention[0].reason };
  const planned = plan.assignments[0];
  if (!planned) return { ok: false, message: "The cleaning could not be assigned." };
  const savedAssignment: JobAssignment = {
    ...planned,
    assignmentId: existing?.assignmentId ?? planned.assignmentId,
    createdAt: existing?.createdAt ?? planned.createdAt,
    lastNotified: notice,
    notifiedServiceDate: job.date,
    needsDateReinvite: undefined,
  };
  let nextAssignments = existing
    ? hub.assignments.map((item) => (item.assignmentId === existing.assignmentId ? savedAssignment : item))
    : [...hub.assignments, savedAssignment];
  if (arrivalTimes.arrivalWindowStart !== undefined && arrivalTimes.arrivalWindowEnd !== undefined) {
    nextAssignments = syncJobAssignmentsToCleaningArrival(
      nextAssignments,
      job.jobId,
      arrivalTimes.arrivalWindowStart,
      arrivalTimes.arrivalWindowEnd,
      now,
    );
  }
  const scheduledJob = {
    ...job,
    draftCleanerIds: (job.draftCleanerIds ?? []).filter((id) => id !== cleaner.cleanerId),
    draftCleanerDetails: (job.draftCleanerDetails ?? []).filter((item) => item.cleanerId !== cleaner.cleanerId),
    status: "SCHEDULED" as const,
  };
  const nextJob =
    arrivalTimes.arrivalWindowStart !== undefined && arrivalTimes.arrivalWindowEnd !== undefined
      ? jobWithCleaningArrival(scheduledJob, arrivalTimes.arrivalWindowStart, arrivalTimes.arrivalWindowEnd, now)
      : { ...scheduledJob, updatedAt: now, updatedBy: "kelsey" };
  const next = withEarliestArrival(nextJob, nextAssignments);
  let assignments = nextAssignments;
  if (savedAssignment.status === "CONFIRMED") {
    assignments = expireJobInvitesIfHeadcountMet(assignments, job.jobId, job.headcountNeeded, now);
  }
  if (
    savedAssignment.status === "CONFIRMED" &&
    hub.submissions.some((submission) => submission.cleanerId === cleaner.cleanerId && submission.weekStart === weekStart)
  ) {
    assignments = revalidatePendingAssignments({
      assignments,
      cleaner,
      weekStart,
      weekEnd: addDays(weekStart, 6),
      windows: hub.availability
        .filter((window) => window.cleanerId === cleaner.cleanerId)
        .map((window) => ({ date: window.date, start: window.start, end: window.end })),
      jobs: hub.jobs,
      nowIso: now,
    });
  }
  const nextJobs = hub.jobs.map((item) => (item.jobId === job.jobId ? next : item));
  const assignMode = input.mode === "INVITE" ? "INVITE" : "DIRECT";
  const message = assignmentSavedMessage(cleaner, savedAssignment, assignMode);
  return {
    ok: true,
    hub: {
      ...hub,
      jobs: nextJobs,
      assignments: clearStaleNotScheduledAttention(nextJobs, assignments, now),
    },
    jobId: job.jobId,
    assignmentId: savedAssignment.assignmentId,
    message,
  };
}
