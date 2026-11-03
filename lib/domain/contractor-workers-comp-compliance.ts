import type {
  ContractorBusinessQuestionnaire,
  WorkersCompComplianceHistoryEntry,
  WorkersCompComplianceStatus,
} from "./contractor-questionnaire.ts";
import { computeReviewFlags } from "./contractor-questionnaire.ts";

export type AdminWorkersCompComplianceUpdate = {
  status: WorkersCompComplianceStatus;
  insuranceCarrier?: string;
  policyNumber?: string;
  policyExpirationDate?: string;
  certificateReceived?: boolean;
  exemptionReason?: string;
  internalNotes?: string;
};

export function workersCompComplianceStatusLabel(status: WorkersCompComplianceStatus | undefined): string {
  switch (status) {
    case "COVERAGE_REQUIRED":
      return "Coverage required";
    case "EXEMPTION_VERIFIED":
      return "Exemption verified";
    case "NEEDS_REVIEW":
      return "Needs review";
    default:
      return "Needs review";
  }
}

export function effectiveWorkersCompComplianceStatus(
  questionnaire: ContractorBusinessQuestionnaire,
): WorkersCompComplianceStatus {
  return questionnaire.workersCompComplianceStatus ?? "NEEDS_REVIEW";
}

export function applyAdminWorkersCompCompliance(
  questionnaire: ContractorBusinessQuestionnaire,
  update: AdminWorkersCompComplianceUpdate,
  adminEmail: string,
  now: string,
): ContractorBusinessQuestionnaire {
  if (!questionnaire.submittedAt) {
    throw new Error("Workers' compensation compliance applies after business information is submitted.");
  }
  const previousStatus = questionnaire.workersCompComplianceStatus ?? "NEEDS_REVIEW";
  const historyEntry: WorkersCompComplianceHistoryEntry = {
    recordedAt: now,
    recordedBy: adminEmail,
    previousStatus,
    status: update.status,
    summary:
      update.status === "EXEMPTION_VERIFIED"
        ? `Exemption verified${update.exemptionReason?.trim() ? `: ${update.exemptionReason.trim()}` : ""}`
        : update.status === "COVERAGE_REQUIRED"
          ? "Coverage required recorded"
          : "Marked needs review",
  };

  const next: ContractorBusinessQuestionnaire = {
    ...questionnaire,
    workersCompComplianceStatus: update.status,
    workersCompComplianceVerifiedAt: now,
    workersCompComplianceVerifiedBy: adminEmail,
    workersCompComplianceInternalNotes: update.internalNotes?.trim() || undefined,
    workersCompComplianceHistory: [...(questionnaire.workersCompComplianceHistory ?? []), historyEntry],
  };

  if (update.status === "COVERAGE_REQUIRED") {
    next.workersCompComplianceCarrier = update.insuranceCarrier?.trim() || undefined;
    next.workersCompCompliancePolicyNumber = update.policyNumber?.trim() || undefined;
    next.workersCompCompliancePolicyExpirationDate = update.policyExpirationDate?.trim() || undefined;
    next.workersCompComplianceCertificateReceived = update.certificateReceived === true;
    next.workersCompComplianceExemptionReason = undefined;
  } else if (update.status === "EXEMPTION_VERIFIED") {
    next.workersCompComplianceExemptionReason = update.exemptionReason?.trim() || undefined;
    next.workersCompComplianceCarrier = undefined;
    next.workersCompCompliancePolicyNumber = undefined;
    next.workersCompCompliancePolicyExpirationDate = undefined;
    next.workersCompComplianceCertificateReceived = undefined;
  } else {
    next.workersCompComplianceExemptionReason = undefined;
  }

  const reviewFlags = computeReviewFlags(next);
  return {
    ...next,
    reviewFlags,
    reviewStatus: reviewFlags.length > 0 ? "NEEDS_REVIEW" : questionnaire.reviewStatus,
  };
}

export function readWorkersCompComplianceHistoryFromRecord(value: unknown): WorkersCompComplianceHistoryEntry[] {
  if (!Array.isArray(value)) return [];
  const rows: WorkersCompComplianceHistoryEntry[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    if (typeof record.recordedAt !== "string" || typeof record.recordedBy !== "string") continue;
    if (
      record.status !== "NEEDS_REVIEW" &&
      record.status !== "COVERAGE_REQUIRED" &&
      record.status !== "EXEMPTION_VERIFIED"
    ) {
      continue;
    }
    rows.push({
      recordedAt: record.recordedAt,
      recordedBy: record.recordedBy,
      previousStatus:
        record.previousStatus === "NEEDS_REVIEW" ||
        record.previousStatus === "COVERAGE_REQUIRED" ||
        record.previousStatus === "EXEMPTION_VERIFIED"
          ? record.previousStatus
          : undefined,
      status: record.status,
      summary: typeof record.summary === "string" ? record.summary : "",
    });
  }
  return rows;
}
