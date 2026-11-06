import "server-only";

import type { HubData } from "../mock/seed.ts";

export type FinalizeHubOptions = {
  persistReconciliation?: boolean;
};

/** Apply in-memory horizon merge + assignment reconciliation (optional Dynamo persist). */
export async function finalizeLoadedHub(
  data: HubData,
  options: FinalizeHubOptions = {},
): Promise<HubData> {
  const { mergeRecurringHorizon } = await import("../domain/recurrence.ts");
  const { clearStaleNotScheduledAttention } = await import("../domain/invitations.ts");
  const { reconcileScheduleConflictWarnings } = await import("../domain/scheduling.ts");

  const today = data.today;
  const generated = mergeRecurringHorizon({ ...data, today, nowIso: new Date().toISOString() });
  const nowIso = new Date().toISOString();
  const reconciled = reconcileScheduleConflictWarnings(generated.assignments, data.cleaners);
  const assignments = clearStaleNotScheduledAttention(generated.jobs, reconciled, nowIso);
  const next = { ...data, today, series: generated.series, jobs: generated.jobs, assignments };
  const beforeById = new Map(generated.assignments.map((assignment) => [assignment.assignmentId, assignment]));
  const assignmentsReconciled = assignments.some((assignment) => {
    const before = beforeById.get(assignment.assignmentId);
    if (!before) return true;
    return before.status !== assignment.status || before.attentionReason !== assignment.attentionReason;
  });
  const shouldPersist =
    options.persistReconciliation !== false &&
    (next.jobs.length !== data.jobs.length ||
      next.assignments.length !== data.assignments.length ||
      assignmentsReconciled);
  if (shouldPersist) {
    const { persistReconcileDiff } = await import("./persist-reconcile-diff.ts");
    await persistReconcileDiff(data, next);
  }
  return next;
}
