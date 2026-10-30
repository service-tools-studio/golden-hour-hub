import {
  deleteAssignmentSmsLogsForAssignment,
  deleteAssignmentSmsLogsForJob,
} from "../data/assignment-sms-log-store.ts";
import { dynamoConfigured } from "../data/repository.ts";
import type { Job } from "../domain/types.ts";
import { addDays, todayInBusinessZone } from "../domain/time.ts";
import type { HubData } from "../mock/seed.ts";

/** Drop assignment SMS logs once the job service date is this many days in the past. */
export const ASSIGNMENT_SMS_LOG_RETENTION_DAYS = 15;

export function jobIdsPastAssignmentSmsLogRetention(jobs: Job[], today: string): string[] {
  const cutoff = addDays(today, -ASSIGNMENT_SMS_LOG_RETENTION_DAYS);
  const ids = jobs.filter((job) => job.date <= cutoff).map((job) => job.jobId);
  return [...new Set(ids)];
}

export async function purgeAssignmentSmsLogsForRemovedAssignment(assignmentId: string): Promise<number> {
  return deleteAssignmentSmsLogsForAssignment(assignmentId);
}

export async function purgeStaleAssignmentSmsLogs(hub: Pick<HubData, "jobs">): Promise<number> {
  if (!dynamoConfigured()) return 0;
  const today = todayInBusinessZone();
  const jobIds = jobIdsPastAssignmentSmsLogRetention(hub.jobs, today);
  let deleted = 0;
  for (const jobId of jobIds) {
    deleted += await deleteAssignmentSmsLogsForJob(jobId);
  }
  return deleted;
}
