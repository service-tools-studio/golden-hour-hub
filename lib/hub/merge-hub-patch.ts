import type { HubData } from "../mock/seed.ts";

function mergeSubmissions(
  current: HubData["submissions"],
  patch: HubData["submissions"],
): HubData["submissions"] {
  const key = (submission: HubData["submissions"][number]) =>
    `${submission.cleanerId}|${submission.weekStart}`;
  const patchByKey = new Map(patch.map((item) => [key(item), item]));
  const merged = current.map((item) => patchByKey.get(key(item)) ?? item);
  for (const item of patch) {
    if (!merged.some((row) => key(row) === key(item))) merged.push(item);
  }
  return merged;
}

function mergeById<T extends { [key: string]: unknown }>(
  current: T[],
  patch: T[],
  idKey: keyof T,
): T[] {
  const patchById = new Map(patch.map((item) => [String(item[idKey]), item]));
  const merged = current.map((item) => patchById.get(String(item[idKey])) ?? item);
  for (const item of patch) {
    if (!merged.some((row) => String(row[idKey]) === String(item[idKey]))) {
      merged.push(item);
    }
  }
  return merged;
}

function mergeAssignmentsForJobs(current: HubData, patch: HubData): HubData["assignments"] {
  const jobIds = new Set(patch.jobs.map((job) => job.jobId));
  if (jobIds.size === 0) return mergeById(current.assignments, patch.assignments, "assignmentId");
  const patchForJobs = patch.assignments.filter((assignment) => jobIds.has(assignment.jobId));
  return [...current.assignments.filter((assignment) => !jobIds.has(assignment.jobId)), ...patchForJobs];
}

/** Merge a partial hub slice into the admin client hub (mutation or incremental sync). */
export function mergeHubPatchIntoHub(
  current: HubData,
  patch: HubData,
  options?: { replaceAssignmentsForPatchJobs?: boolean },
): HubData {
  const hasPatchData =
    patch.jobs.length > 0 ||
    patch.customers.length > 0 ||
    patch.properties.length > 0 ||
    patch.series.length > 0 ||
    patch.cleaners.length > 0 ||
    patch.assignments.length > 0 ||
    patch.availability.length > 0 ||
    patch.submissions.length > 0 ||
    patch.contractorQuestionnaireSubmissions.length > 0;
  if (!hasPatchData) return current;

  return {
    ...current,
    today: patch.today || current.today,
    jobs: mergeById(current.jobs, patch.jobs, "jobId"),
    customers: mergeById(current.customers, patch.customers, "customerId"),
    properties: mergeById(current.properties, patch.properties, "propertyId"),
    series: mergeById(current.series, patch.series, "seriesId"),
    cleaners: mergeById(current.cleaners, patch.cleaners, "cleanerId"),
    assignments:
      options?.replaceAssignmentsForPatchJobs && patch.jobs.length > 0
        ? mergeAssignmentsForJobs(current, patch)
        : mergeById(current.assignments, patch.assignments, "assignmentId"),
    availability: mergeById(current.availability, patch.availability, "availabilityId"),
    submissions: mergeSubmissions(current.submissions, patch.submissions),
    contractorQuestionnaireSubmissions: mergeById(
      current.contractorQuestionnaireSubmissions,
      patch.contractorQuestionnaireSubmissions,
      "submissionId",
    ),
  };
}
