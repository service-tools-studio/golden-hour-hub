import type { ContractorBusinessQuestionnaire } from "./contractor-questionnaire.ts";

/** Increment when questionnaire schema or required attestation copy changes. */
export const QUESTIONNAIRE_SCHEMA_VERSION = 1;

export const QUESTIONNAIRE_ACKNOWLEDGMENT_VERSION = "2026-03-24-v1";

export const QUESTIONNAIRE_ACKNOWLEDGMENT_TEXT =
  "I confirm that I am the owner of the business identified in this form, or an authorized representative, and that the information I have provided is accurate and complete to the best of my knowledge. I understand that Golden Hour Cleaning Co. may rely on this information when evaluating and maintaining our business relationship.";

export const ELECTRONIC_SIGNATURE_CONSENT_TEXT =
  "By typing your name and submitting this form, you agree to sign electronically and confirm the information provided is accurate to the best of your knowledge.";

export type ContractorQuestionnaireSubmitAttestation = {
  acknowledgmentAccepted: boolean;
  electronicSignature: string;
};

export type ContractorQuestionnaireSubmissionRecord = {
  submissionId: string;
  cleanerId: string;
  submissionVersion: number;
  questionnaireVersion: number;
  submittedAt: string;
  submittedByCognitoSub: string;
  submittedByEmail: string;
  acknowledgmentVersion: string;
  acknowledgmentText: string;
  electronicSignature: string;
  electronicSignatureConsentText: string;
  questionnaireSnapshot: ContractorBusinessQuestionnaire;
};

function trim(value: string): string {
  return value.trim();
}

export function validateQuestionnaireSubmitAttestation(
  attestation: ContractorQuestionnaireSubmitAttestation,
): { ok: true; value: { electronicSignature: string } } | { ok: false; message: string; field?: string } {
  if (attestation.acknowledgmentAccepted !== true) {
    return { ok: false, message: "Confirm the acknowledgment before submitting.", field: "acknowledgmentAccepted" };
  }
  const electronicSignature = trim(attestation.electronicSignature);
  if (!electronicSignature) {
    return { ok: false, message: "Type your full legal name to sign.", field: "electronicSignature" };
  }
  if (electronicSignature.length < 3) {
    return { ok: false, message: "Enter your full legal name.", field: "electronicSignature" };
  }
  return { ok: true, value: { electronicSignature } };
}

export function createQuestionnaireSubmissionRecord(input: {
  cleanerId: string;
  submissionVersion: number;
  submittedAt: string;
  submittedByCognitoSub: string;
  submittedByEmail: string;
  electronicSignature: string;
  questionnaireSnapshot: ContractorBusinessQuestionnaire;
  submissionId?: string;
}): ContractorQuestionnaireSubmissionRecord {
  return {
    submissionId: input.submissionId ?? crypto.randomUUID(),
    cleanerId: input.cleanerId,
    submissionVersion: input.submissionVersion,
    questionnaireVersion: QUESTIONNAIRE_SCHEMA_VERSION,
    submittedAt: input.submittedAt,
    submittedByCognitoSub: input.submittedByCognitoSub,
    submittedByEmail: input.submittedByEmail,
    acknowledgmentVersion: QUESTIONNAIRE_ACKNOWLEDGMENT_VERSION,
    acknowledgmentText: QUESTIONNAIRE_ACKNOWLEDGMENT_TEXT,
    electronicSignature: input.electronicSignature,
    electronicSignatureConsentText: ELECTRONIC_SIGNATURE_CONSENT_TEXT,
    questionnaireSnapshot: structuredClone(input.questionnaireSnapshot),
  };
}

export function readQuestionnaireSubmissionFromRecord(value: unknown): ContractorQuestionnaireSubmissionRecord | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  if (typeof record.submissionId !== "string") return undefined;
  if (typeof record.cleanerId !== "string") return undefined;
  if (typeof record.submittedAt !== "string") return undefined;
  if (typeof record.submittedByCognitoSub !== "string") return undefined;
  if (typeof record.submittedByEmail !== "string") return undefined;
  if (typeof record.acknowledgmentText !== "string") return undefined;
  if (typeof record.electronicSignature !== "string") return undefined;
  const snapshot = record.questionnaireSnapshot;
  if (!snapshot || typeof snapshot !== "object") return undefined;
  const submissionVersion = record.submissionVersion;
  const questionnaireVersion = record.questionnaireVersion;
  if (typeof submissionVersion !== "number" || submissionVersion < 1) return undefined;
  if (typeof questionnaireVersion !== "number" || questionnaireVersion < 1) return undefined;
  return {
    submissionId: record.submissionId,
    cleanerId: record.cleanerId,
    submissionVersion,
    questionnaireVersion,
    submittedAt: record.submittedAt,
    submittedByCognitoSub: record.submittedByCognitoSub,
    submittedByEmail: record.submittedByEmail,
    acknowledgmentVersion:
      typeof record.acknowledgmentVersion === "string" ? record.acknowledgmentVersion : QUESTIONNAIRE_ACKNOWLEDGMENT_VERSION,
    acknowledgmentText: record.acknowledgmentText,
    electronicSignature: record.electronicSignature,
    electronicSignatureConsentText:
      typeof record.electronicSignatureConsentText === "string"
        ? record.electronicSignatureConsentText
        : ELECTRONIC_SIGNATURE_CONSENT_TEXT,
    questionnaireSnapshot: snapshot as ContractorBusinessQuestionnaire,
  };
}

export function questionnaireSubmissionsForCleaner(
  submissions: ContractorQuestionnaireSubmissionRecord[],
  cleanerId: string,
): ContractorQuestionnaireSubmissionRecord[] {
  return submissions
    .filter((item) => item.cleanerId === cleanerId)
    .sort((a, b) => b.submissionVersion - a.submissionVersion);
}
