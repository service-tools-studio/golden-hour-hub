import { emptyHub, type HubData } from "../mock/seed.ts";

export type HubPatchRemove = {
  customerIds?: string[];
  propertyIds?: string[];
  jobIds?: string[];
  seriesIds?: string[];
  cleanerIds?: string[];
  assignmentIds?: string[];
  availabilityIds?: string[];
  submissionKeys?: string[];
  questionnaireSubmissionIds?: string[];
};

export type MergeHubPatchOptions = {
  replaceAssignmentsForPatchJobs?: boolean;
  remove?: HubPatchRemove;
};

function submissionKey(submission: HubData["submissions"][number]): string {
  return `${submission.cleanerId}|${submission.weekStart}`;
}

function mergeSubmissions(
  current: HubData["submissions"],
  patch: HubData["submissions"],
): HubData["submissions"] {
  const patchByKey = new Map(patch.map((item) => [submissionKey(item), item]));
  const merged = current.map((item) => patchByKey.get(submissionKey(item)) ?? item);
  for (const item of patch) {
    if (!merged.some((row) => submissionKey(row) === submissionKey(item))) merged.push(item);
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

function hasRemove(remove?: HubPatchRemove): boolean {
  if (!remove) return false;
  return Object.values(remove).some((ids) => Array.isArray(ids) && ids.length > 0);
}

function compactRemove(remove: HubPatchRemove): HubPatchRemove | undefined {
  const next: HubPatchRemove = {};
  for (const [key, value] of Object.entries(remove) as [keyof HubPatchRemove, string[] | undefined][]) {
    if (value && value.length > 0) next[key] = value;
  }
  return hasRemove(next) ? next : undefined;
}

function applyRemoves(current: HubData, remove?: HubPatchRemove): HubData {
  if (!hasRemove(remove) || !remove) return current;
  const customerIds = new Set(remove.customerIds ?? []);
  const propertyIds = new Set(remove.propertyIds ?? []);
  const jobIds = new Set(remove.jobIds ?? []);
  const seriesIds = new Set(remove.seriesIds ?? []);
  const cleanerIds = new Set(remove.cleanerIds ?? []);
  const assignmentIds = new Set(remove.assignmentIds ?? []);
  const availabilityIds = new Set(remove.availabilityIds ?? []);
  const submissionKeys = new Set(remove.submissionKeys ?? []);
  const questionnaireSubmissionIds = new Set(remove.questionnaireSubmissionIds ?? []);
  return {
    ...current,
    customers: customerIds.size ? current.customers.filter((item) => !customerIds.has(item.customerId)) : current.customers,
    properties: propertyIds.size ? current.properties.filter((item) => !propertyIds.has(item.propertyId)) : current.properties,
    jobs: jobIds.size ? current.jobs.filter((item) => !jobIds.has(item.jobId)) : current.jobs,
    series: seriesIds.size ? current.series.filter((item) => !seriesIds.has(item.seriesId)) : current.series,
    cleaners: cleanerIds.size ? current.cleaners.filter((item) => !cleanerIds.has(item.cleanerId)) : current.cleaners,
    assignments: assignmentIds.size
      ? current.assignments.filter((item) => !assignmentIds.has(item.assignmentId))
      : current.assignments,
    availability: availabilityIds.size
      ? current.availability.filter((item) => !availabilityIds.has(item.availabilityId))
      : current.availability,
    submissions: submissionKeys.size
      ? current.submissions.filter((item) => !submissionKeys.has(submissionKey(item)))
      : current.submissions,
    contractorQuestionnaireSubmissions: questionnaireSubmissionIds.size
      ? current.contractorQuestionnaireSubmissions.filter((item) => !questionnaireSubmissionIds.has(item.submissionId))
      : current.contractorQuestionnaireSubmissions,
  };
}

function changedRows<T>(before: T[], after: T[], idOf: (item: T) => string): T[] {
  const previous = new Map(before.map((item) => [idOf(item), JSON.stringify(item)]));
  return after.filter((item) => previous.get(idOf(item)) !== JSON.stringify(item));
}

function removedIds<T>(before: T[], after: T[], idOf: (item: T) => string): string[] {
  const remaining = new Set(after.map(idOf));
  return before.map(idOf).filter((id) => !remaining.has(id));
}

function hasPatchData(patch: HubData): boolean {
  return (
    patch.jobs.length > 0 ||
    patch.customers.length > 0 ||
    patch.properties.length > 0 ||
    patch.series.length > 0 ||
    patch.cleaners.length > 0 ||
    patch.assignments.length > 0 ||
    patch.availability.length > 0 ||
    patch.submissions.length > 0 ||
    patch.contractorQuestionnaireSubmissions.length > 0
  );
}

/** Changed/added rows and removed ids between two hub snapshots (for admin save responses). */
export function hubMutationPatch(
  before: HubData,
  after: HubData,
): { patch: HubData; remove?: HubPatchRemove } {
  const patch: HubData = {
    ...emptyHub(after.today || before.today),
    today: after.today || before.today,
    jobs: changedRows(before.jobs, after.jobs, (item) => item.jobId),
    customers: changedRows(before.customers, after.customers, (item) => item.customerId),
    properties: changedRows(before.properties, after.properties, (item) => item.propertyId),
    series: changedRows(before.series, after.series, (item) => item.seriesId),
    cleaners: changedRows(before.cleaners, after.cleaners, (item) => item.cleanerId),
    assignments: changedRows(before.assignments, after.assignments, (item) => item.assignmentId),
    availability: changedRows(before.availability, after.availability, (item) => item.availabilityId),
    submissions: changedRows(before.submissions, after.submissions, submissionKey),
    contractorQuestionnaireSubmissions: changedRows(
      before.contractorQuestionnaireSubmissions,
      after.contractorQuestionnaireSubmissions,
      (item) => item.submissionId,
    ),
  };
  const remove = compactRemove({
    jobIds: removedIds(before.jobs, after.jobs, (item) => item.jobId),
    customerIds: removedIds(before.customers, after.customers, (item) => item.customerId),
    propertyIds: removedIds(before.properties, after.properties, (item) => item.propertyId),
    seriesIds: removedIds(before.series, after.series, (item) => item.seriesId),
    cleanerIds: removedIds(before.cleaners, after.cleaners, (item) => item.cleanerId),
    assignmentIds: removedIds(before.assignments, after.assignments, (item) => item.assignmentId),
    availabilityIds: removedIds(before.availability, after.availability, (item) => item.availabilityId),
    submissionKeys: removedIds(before.submissions, after.submissions, submissionKey),
    questionnaireSubmissionIds: removedIds(
      before.contractorQuestionnaireSubmissions,
      after.contractorQuestionnaireSubmissions,
      (item) => item.submissionId,
    ),
  });
  return { patch, remove };
}

/** Merge a partial hub slice into the admin client hub (mutation or incremental sync). */
export function mergeHubPatchIntoHub(
  current: HubData,
  patch: HubData,
  options?: MergeHubPatchOptions,
): HubData {
  const base = applyRemoves(current, options?.remove);
  if (!hasPatchData(patch)) {
    return patch.today ? { ...base, today: patch.today } : base;
  }

  return {
    ...base,
    today: patch.today || base.today,
    jobs: mergeById(base.jobs, patch.jobs, "jobId"),
    customers: mergeById(base.customers, patch.customers, "customerId"),
    properties: mergeById(base.properties, patch.properties, "propertyId"),
    series: mergeById(base.series, patch.series, "seriesId"),
    cleaners: mergeById(base.cleaners, patch.cleaners, "cleanerId"),
    assignments:
      options?.replaceAssignmentsForPatchJobs && patch.jobs.length > 0
        ? mergeAssignmentsForJobs(base, patch)
        : mergeById(base.assignments, patch.assignments, "assignmentId"),
    availability: mergeById(base.availability, patch.availability, "availabilityId"),
    submissions: mergeSubmissions(base.submissions, patch.submissions),
    contractorQuestionnaireSubmissions: mergeById(
      base.contractorQuestionnaireSubmissions,
      patch.contractorQuestionnaireSubmissions,
      "submissionId",
    ),
  };
}

/** Merge one cleaner's saved week without dropping other cleaners' availability. */
export function mergeAvailabilityWeekIntoHub(
  current: HubData,
  patch: HubData,
  cleanerId: string,
  weekStart: string,
  weekEnd: string,
): HubData {
  return mergeHubPatchIntoHub(
    {
      ...current,
      availability: current.availability.filter(
        (window) => !(window.cleanerId === cleanerId && window.date >= weekStart && window.date <= weekEnd),
      ),
      submissions: current.submissions.filter(
        (row) => !(row.cleanerId === cleanerId && row.weekStart === weekStart),
      ),
    },
    patch,
  );
}
