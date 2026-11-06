import type { ContractorQuestionnaireSubmissionRecord } from "../domain/contractor-questionnaire-submission.ts";
import type {
  AvailabilitySubmission,
  AvailabilityWindow,
  CleanerProfile,
  Customer,
  Job,
  JobAssignment,
  Property,
  RecurringSeries,
} from "../domain/types.ts";
import type { HubData } from "../mock/seed.ts";

function isoTime(value: string | undefined): number {
  if (!value) return 0;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : 0;
}

function mergeByUpdatedAt<T>(
  serverRows: T[],
  localRows: T[],
  idOf: (row: T) => string,
  updatedAtOf: (row: T) => string | undefined,
): T[] {
  const merged = new Map(serverRows.map((row) => [idOf(row), row]));
  for (const localRow of localRows) {
    const id = idOf(localRow);
    const serverRow = merged.get(id);
    if (!serverRow) {
      merged.set(id, localRow);
      continue;
    }
    if (isoTime(updatedAtOf(localRow)) >= isoTime(updatedAtOf(serverRow))) {
      merged.set(id, localRow);
    }
  }
  return [...merged.values()];
}

/** Prefer the in-flight save when timestamps are missing (e.g. availability windows). */
function mergePreferLocalOnTie<T>(serverRows: T[], localRows: T[], idOf: (row: T) => string): T[] {
  const merged = new Map(serverRows.map((row) => [idOf(row), row]));
  for (const localRow of localRows) {
    merged.set(idOf(localRow), localRow);
  }
  return [...merged.values()];
}

function mergeQuestionnaireSubmissions(
  serverRows: ContractorQuestionnaireSubmissionRecord[],
  localRows: ContractorQuestionnaireSubmissionRecord[],
): ContractorQuestionnaireSubmissionRecord[] {
  return mergeByUpdatedAt(serverRows, localRows, (row) => row.submissionId, (row) => row.submittedAt);
}

/**
 * Combine a failed local persist attempt with the current server hub.
 * Server rows win on older local edits; brand-new local rows are kept.
 */
export function mergeHubPersistAttempt(server: HubData, localAttempt: HubData): HubData {
  return {
    today: server.today,
    cleaners: mergeByUpdatedAt(server.cleaners, localAttempt.cleaners, (c) => c.cleanerId, (c) => c.updatedAt),
    customers: mergeByUpdatedAt(server.customers, localAttempt.customers, (c) => c.customerId, (c) => c.updatedAt),
    properties: mergeByUpdatedAt(server.properties, localAttempt.properties, (p) => p.propertyId, (p) => p.updatedAt),
    series: mergeByUpdatedAt(server.series, localAttempt.series, (s) => s.seriesId, (s) => s.updatedAt),
    jobs: mergeByUpdatedAt(server.jobs, localAttempt.jobs, (j) => j.jobId, (j) => j.updatedAt),
    assignments: mergeByUpdatedAt(
      server.assignments,
      localAttempt.assignments,
      (a) => a.assignmentId,
      (a) => a.updatedAt,
    ),
    availability: mergePreferLocalOnTie(server.availability, localAttempt.availability, (w) => w.availabilityId),
    submissions: mergePreferLocalOnTie(server.submissions, localAttempt.submissions, (s) => s.submissionId),
    contractorQuestionnaireSubmissions: mergeQuestionnaireSubmissions(
      server.contractorQuestionnaireSubmissions,
      localAttempt.contractorQuestionnaireSubmissions,
    ),
  };
}
