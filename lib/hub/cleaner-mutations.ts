import { mergeAdjacentWindows } from "@/lib/domain/availability";
import {
  expireRemainingInvitationsWhenFilled,
  revalidatePendingAssignments,
  validateInvitationAcceptance,
  withAssignmentConfirmed,
  withAssignmentDeclined,
} from "@/lib/domain/invitations";
import { toAssignmentSchedule, validateAvailabilityEdit } from "@/lib/domain/scheduling";
import { addDays, mondayOf } from "@/lib/domain/time";
import type { AvailabilityWindow } from "@/lib/domain/types";
import type { HubData } from "@/lib/mock/seed";

type ActionResult = { ok: true; message?: string } | { ok: false; message: string };

export function acceptInvitationOnHub(
  hub: HubData,
  cleanerId: string,
  assignmentId: string,
  crewSize: number,
): { hub: HubData; result: ActionResult } {
  const assignment = hub.assignments.find((item) => item.assignmentId === assignmentId);
  const job = assignment ? hub.jobs.find((item) => item.jobId === assignment.jobId) : undefined;
  const cleaner = hub.cleaners.find((item) => item.cleanerId === cleanerId);
  if (!assignment || !job || !cleaner || assignment.cleanerId !== cleanerId) {
    return { hub, result: { ok: false, message: "This invitation is no longer available." } };
  }
  const jobAssignments = hub.assignments.filter((item) => item.jobId === job.jobId);
  const weekStart = mondayOf(assignment.serviceDate);
  const decision = validateInvitationAcceptance({
    assignment,
    job,
    cleaner,
    requestedCrewSize: crewSize,
    jobAssignments,
    cleanerConfirmedAssignments: hub.assignments.filter(
      (item) => item.cleanerId === cleaner.cleanerId && item.status === "CONFIRMED",
    ),
    availabilityWindows: hub.availability
      .filter((window) => window.cleanerId === cleaner.cleanerId)
      .map((window) => ({ date: window.date, start: window.start, end: window.end })),
  });
  if (!decision.ok) return { hub, result: decision };
  const now = new Date().toISOString();
  const updated = expireRemainingInvitationsWhenFilled(
    withAssignmentConfirmed(
      jobAssignments,
      assignmentId,
      decision.confirmedCrewSize,
      decision.confirmedTotalPayCents,
      now,
    ),
    job.headcountNeeded,
    now,
  );
  let assignments = [...hub.assignments.filter((item) => item.jobId !== job.jobId), ...updated];
  const submitted = hub.submissions.some(
    (submission) => submission.cleanerId === cleaner.cleanerId && submission.weekStart === weekStart,
  );
  if (submitted) {
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
  return { hub: { ...hub, assignments }, result: { ok: true } };
}

export function declineInvitationOnHub(hub: HubData, cleanerId: string, assignmentId: string): { hub: HubData; result: ActionResult } {
  const assignment = hub.assignments.find((item) => item.assignmentId === assignmentId);
  if (!assignment || assignment.cleanerId !== cleanerId || assignment.status !== "INVITED") {
    return { hub, result: { ok: false, message: "This invitation is no longer available." } };
  }
  return {
    hub: {
      ...hub,
      assignments: withAssignmentDeclined(hub.assignments, assignmentId, new Date().toISOString()),
    },
    result: { ok: true },
  };
}

export function submitAvailabilityOnHub(
  hub: HubData,
  cleanerId: string,
  weekStart: string,
  windows: AvailabilityWindow[],
): { hub: HubData; result: ActionResult } {
  const weekEnd = addDays(weekStart, 6);
  const combined = [
    ...hub.availability.filter(
      (window) => window.cleanerId !== cleanerId || window.date < weekStart || window.date > weekEnd,
    ),
    ...mergeAdjacentWindows(windows),
  ];
  const decision = validateAvailabilityEdit({
    newWindows: combined
      .filter((window) => window.cleanerId === cleanerId)
      .map((window) => ({ date: window.date, start: window.start, end: window.end })),
    confirmedAssignments: hub.assignments
      .filter((item) => item.cleanerId === cleanerId && item.status === "CONFIRMED")
      .map(toAssignmentSchedule),
  });
  if (!decision.ok) return { hub, result: decision };
  const now = new Date().toISOString();
  const existing = hub.submissions.find(
    (submission) => submission.cleanerId === cleanerId && submission.weekStart === weekStart,
  );
  const cleaner = hub.cleaners.find((item) => item.cleanerId === cleanerId);
  const assignments = cleaner
    ? revalidatePendingAssignments({
        assignments: hub.assignments,
        cleaner,
        weekStart,
        weekEnd,
        windows: combined
          .filter((window) => window.cleanerId === cleanerId)
          .map((window) => ({ date: window.date, start: window.start, end: window.end })),
        jobs: hub.jobs,
        nowIso: now,
      })
    : hub.assignments;
  return {
    hub: {
      ...hub,
      availability: combined,
      assignments,
      submissions: [
        ...hub.submissions.filter(
          (submission) => !(submission.cleanerId === cleanerId && submission.weekStart === weekStart),
        ),
        {
          submissionId: existing?.submissionId ?? `sub-${cleanerId}-${weekStart}`,
          cleanerId,
          weekStart,
          submittedAt: existing?.submittedAt ?? now,
          updatedAt: now,
        },
      ],
    },
    result: { ok: true, message: "Availability submitted." },
  };
}
