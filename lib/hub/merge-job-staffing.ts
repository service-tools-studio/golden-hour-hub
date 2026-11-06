import type { HubData } from "../mock/seed.ts";

/** Merge a job-partition hub slice (from loadHubForJobStaffing) into the full admin client hub. */
export function mergeJobStaffingIntoHub(current: HubData, patch: HubData): HubData {
  if (patch.jobs.length === 0) return current;

  const jobIds = new Set(patch.jobs.map((job) => job.jobId));
  const patchJobsById = new Map(patch.jobs.map((job) => [job.jobId, job]));
  const patchAssignmentsForJobs = patch.assignments.filter((assignment) => jobIds.has(assignment.jobId));
  const patchCleanersById = new Map(patch.cleaners.map((cleaner) => [cleaner.cleanerId, cleaner]));
  const mergedCleaners = current.cleaners.map((cleaner) => patchCleanersById.get(cleaner.cleanerId) ?? cleaner);
  for (const cleaner of patch.cleaners) {
    if (!mergedCleaners.some((item) => item.cleanerId === cleaner.cleanerId)) {
      mergedCleaners.push(cleaner);
    }
  }

  return {
    ...current,
    jobs: current.jobs.map((job) => patchJobsById.get(job.jobId) ?? job),
    assignments: [
      ...current.assignments.filter((assignment) => !jobIds.has(assignment.jobId)),
      ...patchAssignmentsForJobs,
    ],
    cleaners: mergedCleaners,
  };
}
