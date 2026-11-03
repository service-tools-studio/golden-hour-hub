import type { ContractorQuestionnaireInput } from "../domain/contractor-questionnaire.ts";
import {
  applyAdminQuestionnaireReview,
  applyAdminCoiVerification,
  applyAdminRegistrationVerification,
  buildQuestionnaireFromInput,
  normalizeQuestionnaireInput,
  validateQuestionnaireInput,
} from "../domain/contractor-questionnaire.ts";
import type {
  BusinessRegistrationVerificationStatus,
  CoiVerificationStatus,
  QuestionnaireFieldErrors,
} from "../domain/contractor-questionnaire.ts";
import {
  applyAdminWorkersCompCompliance,
  type AdminWorkersCompComplianceUpdate,
} from "../domain/contractor-workers-comp-compliance.ts";
import type { HubData } from "../mock/seed.ts";
import type { Result } from "../domain/types.ts";
import {
  createQuestionnaireSubmissionRecord,
  questionnaireSubmissionsForCleaner,
  validateQuestionnaireSubmitAttestation,
  type ContractorQuestionnaireSubmitAttestation,
} from "../domain/contractor-questionnaire-submission.ts";

export type QuestionnaireSubmitContext = {
  attestation: ContractorQuestionnaireSubmitAttestation;
  cognitoSub: string;
  email: string;
};

export type SaveContractorQuestionnaireOutcome = {
  hub: HubData;
  result: Result;
  submitted: boolean;
  fieldErrors?: QuestionnaireFieldErrors;
  attestationFieldErrors?: Record<string, string>;
};

export type QuestionnaireSaveIntent = "draft" | "submit";

export function saveContractorQuestionnaireOnHub(
  hub: HubData,
  cleanerId: string,
  input: ContractorQuestionnaireInput,
  updatedBy: string,
  now: string,
  intent: QuestionnaireSaveIntent,
  submitContext?: QuestionnaireSubmitContext,
): SaveContractorQuestionnaireOutcome {
  const cleaner = hub.cleaners.find((item) => item.cleanerId === cleanerId);
  if (!cleaner) {
    return { hub, result: { ok: false, message: "Cleaner not found." }, submitted: false };
  }
  try {
    const normalized = normalizeQuestionnaireInput(input);

    if (intent === "draft") {
      const nextCleaner = {
        ...cleaner,
        businessQuestionnaire: cleaner.businessQuestionnaire,
        businessQuestionnaireDraft: normalized,
        updatedAt: now,
        updatedBy,
      };
      return {
        hub: {
          ...hub,
          cleaners: hub.cleaners.map((item) => (item.cleanerId === cleanerId ? nextCleaner : item)),
        },
        result: { ok: true },
        submitted: false,
      };
    }

    const fieldErrors = validateQuestionnaireInput(normalized);
    if (Object.keys(fieldErrors).length > 0) {
      return {
        hub,
        result: { ok: false, message: "Complete required fields before submitting." },
        submitted: false,
        fieldErrors,
      };
    }

    if (!submitContext) {
      return {
        hub,
        result: { ok: false, message: "Submission attestation is required." },
        submitted: false,
      };
    }
    const attestationOutcome = validateQuestionnaireSubmitAttestation(submitContext.attestation);
    if (!attestationOutcome.ok) {
      return {
        hub,
        result: { ok: false, message: attestationOutcome.message },
        submitted: false,
        attestationFieldErrors: attestationOutcome.field
          ? { [attestationOutcome.field]: attestationOutcome.message }
          : undefined,
      };
    }

    const businessQuestionnaire = buildQuestionnaireFromInput(
      normalized,
      cleaner.businessQuestionnaire,
      now,
      updatedBy,
    );
    const priorSubmissions = questionnaireSubmissionsForCleaner(hub.contractorQuestionnaireSubmissions, cleanerId);
    const submissionRecord = createQuestionnaireSubmissionRecord({
      cleanerId,
      submissionVersion: priorSubmissions.length + 1,
      submittedAt: now,
      submittedByCognitoSub: submitContext.cognitoSub,
      submittedByEmail: submitContext.email,
      electronicSignature: attestationOutcome.value.electronicSignature,
      questionnaireSnapshot: businessQuestionnaire,
    });
    const nextCleaner = {
      ...cleaner,
      businessQuestionnaire,
      businessQuestionnaireDraft: undefined,
      updatedAt: now,
      updatedBy,
    };
    return {
      hub: {
        ...hub,
        cleaners: hub.cleaners.map((item) => (item.cleanerId === cleanerId ? nextCleaner : item)),
        contractorQuestionnaireSubmissions: [...hub.contractorQuestionnaireSubmissions, submissionRecord],
      },
      result: { ok: true },
      submitted: true,
    };
  } catch {
    return { hub, result: { ok: false, message: "Could not save business information." }, submitted: false };
  }
}

export function updateContractorQuestionnaireReviewOnHub(
  hub: HubData,
  cleanerId: string,
  status: "NEEDS_REVIEW" | "REVIEWED",
  adminEmail: string,
  now: string,
): { hub: HubData; result: Result } {
  const cleaner = hub.cleaners.find((item) => item.cleanerId === cleanerId);
  if (!cleaner?.businessQuestionnaire?.submittedAt) {
    return { hub, result: { ok: false, message: "This cleaner has not submitted business information yet." } };
  }
  const nextQuestionnaire = applyAdminQuestionnaireReview(
    cleaner.businessQuestionnaire,
    status,
    adminEmail,
    now,
  );
  const nextCleaner = {
    ...cleaner,
    businessQuestionnaire: nextQuestionnaire,
    updatedAt: now,
    updatedBy: adminEmail,
  };
  return {
    hub: {
      ...hub,
      cleaners: hub.cleaners.map((item) => (item.cleanerId === cleanerId ? nextCleaner : item)),
    },
    result: { ok: true },
  };
}

export function updateContractorRegistrationVerificationOnHub(
  hub: HubData,
  cleanerId: string,
  status: BusinessRegistrationVerificationStatus,
  adminEmail: string,
  now: string,
): { hub: HubData; result: Result } {
  const cleaner = hub.cleaners.find((item) => item.cleanerId === cleanerId);
  if (!cleaner?.businessQuestionnaire?.submittedAt) {
    return { hub, result: { ok: false, message: "This cleaner has not submitted business information yet." } };
  }
  try {
    const nextQuestionnaire = applyAdminRegistrationVerification(cleaner.businessQuestionnaire, status);
    const nextCleaner = {
      ...cleaner,
      businessQuestionnaire: nextQuestionnaire,
      updatedAt: now,
      updatedBy: adminEmail,
    };
    return {
      hub: {
        ...hub,
        cleaners: hub.cleaners.map((item) => (item.cleanerId === cleanerId ? nextCleaner : item)),
      },
      result: { ok: true },
    };
  } catch {
    return { hub, result: { ok: false, message: "Could not update registration verification." } };
  }
}

export function updateContractorCoiVerificationOnHub(
  hub: HubData,
  cleanerId: string,
  status: CoiVerificationStatus,
  adminEmail: string,
  now: string,
): { hub: HubData; result: Result } {
  const cleaner = hub.cleaners.find((item) => item.cleanerId === cleanerId);
  if (!cleaner?.businessQuestionnaire?.submittedAt) {
    return { hub, result: { ok: false, message: "This cleaner has not submitted business information yet." } };
  }
  try {
    const nextQuestionnaire = applyAdminCoiVerification(cleaner.businessQuestionnaire, status, adminEmail, now);
    const nextCleaner = {
      ...cleaner,
      businessQuestionnaire: nextQuestionnaire,
      updatedAt: now,
      updatedBy: adminEmail,
    };
    return {
      hub: {
        ...hub,
        cleaners: hub.cleaners.map((item) => (item.cleanerId === cleanerId ? nextCleaner : item)),
      },
      result: { ok: true },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not update COI verification.";
    return { hub, result: { ok: false, message } };
  }
}

export function updateContractorWorkersCompComplianceOnHub(
  hub: HubData,
  cleanerId: string,
  update: AdminWorkersCompComplianceUpdate,
  adminEmail: string,
  now: string,
): { hub: HubData; result: Result } {
  const cleaner = hub.cleaners.find((item) => item.cleanerId === cleanerId);
  if (!cleaner?.businessQuestionnaire?.submittedAt) {
    return { hub, result: { ok: false, message: "This cleaner has not submitted business information yet." } };
  }
  try {
    const nextQuestionnaire = applyAdminWorkersCompCompliance(cleaner.businessQuestionnaire, update, adminEmail, now);
    const nextCleaner = {
      ...cleaner,
      businessQuestionnaire: nextQuestionnaire,
      updatedAt: now,
      updatedBy: adminEmail,
    };
    return {
      hub: {
        ...hub,
        cleaners: hub.cleaners.map((item) => (item.cleanerId === cleanerId ? nextCleaner : item)),
      },
      result: { ok: true },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not update workers' compensation compliance.";
    return { hub, result: { ok: false, message } };
  }
}
