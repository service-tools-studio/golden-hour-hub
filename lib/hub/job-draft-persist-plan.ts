import { assignmentToItem, jobToItem, type DynamoItem } from "../data/items.ts";
import type { HubData } from "../mock/seed.ts";

export type JobRosterPersistPlan = {
  puts: DynamoItem[];
  deletes: Array<{ pk: string; sk: string }>;
};

/** @deprecated alias */
export type JobDraftPersistPlan = JobRosterPersistPlan;

/** True when removing this cleaner only edits draft roster (no live assignment row). */
export function jobCleanerRemoveIsDraftOnly(hub: HubData, jobId: string, cleanerId: string): boolean {
  return !hub.assignments.some(
    (assignment) =>
      assignment.jobId === jobId &&
      assignment.cleanerId === cleanerId &&
      assignment.status !== "CANCELED" &&
      assignment.status !== "EXPIRED_JOB_FILLED",
  );
}

function assignmentRecordEqual(before: HubData["assignments"][number], after: HubData["assignments"][number]): boolean {
  return JSON.stringify(before) === JSON.stringify(after);
}

/** Puts for job PROFILE and any assignment rows on this job that changed. */
export function buildJobRosterPersistPlan(before: HubData, after: HubData, jobId: string): JobRosterPersistPlan {
  const puts: DynamoItem[] = [];
  const beforeJob = before.jobs.find((item) => item.jobId === jobId);
  const afterJob = after.jobs.find((item) => item.jobId === jobId);
  if (!afterJob) throw new Error(`Job ${jobId} missing from hub after mutation.`);
  if (!beforeJob || JSON.stringify(beforeJob) !== JSON.stringify(afterJob)) {
    puts.push(jobToItem(afterJob));
  }

  const beforeById = new Map(
    before.assignments.filter((assignment) => assignment.jobId === jobId).map((assignment) => [assignment.assignmentId, assignment]),
  );
  for (const assignment of after.assignments.filter((item) => item.jobId === jobId)) {
    const previous = beforeById.get(assignment.assignmentId);
    if (!previous || !assignmentRecordEqual(previous, assignment)) {
      puts.push(assignmentToItem(assignment));
    }
  }

  return { puts, deletes: [] };
}

/** Put the updated job PROFILE row only (draft roster / job fields on one cleaning). */
export function buildJobDraftPersistPlan(after: HubData, jobId: string): JobRosterPersistPlan {
  const job = after.jobs.find((item) => item.jobId === jobId);
  if (!job) throw new Error(`Job ${jobId} missing from hub after mutation.`);
  return { puts: [jobToItem(job)], deletes: [] };
}
