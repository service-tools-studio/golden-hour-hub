import type { ContractorBusinessQuestionnaire, ContractorQuestionnaireInput, QuestionnaireFieldErrors } from "./contractor-questionnaire.ts";
import {
  inputFromQuestionnaire,
  normalizeQuestionnaireInput,
  validateQuestionnaireInput,
} from "./contractor-questionnaire.ts";

export const QUESTIONNAIRE_WIZARD_STEP_COUNT = 4 as const;

export const QUESTIONNAIRE_WIZARD_STEP_TITLES = [
  "Your Business",
  "Your Cleaning Team",
  "Insurance",
  "Review & Sign",
] as const;

export type QuestionnaireWizardStep = 1 | 2 | 3 | 4;

const STEP1_FIELDS: (keyof QuestionnaireFieldErrors)[] = [
  "businessDisplayName",
  "ownerLegalName",
  "registrationStatus",
  "businessStructure",
  "registeredLegalName",
  "registrationState",
  "stateRegistrationNumber",
  "businessStreetAddress",
  "businessCity",
  "businessState",
  "businessZip",
  "businessPhone",
  "businessEmail",
  "oregonServiceStatus",
];

const STEP2_FIELDS: (keyof QuestionnaireFieldErrors)[] = [
  "hasAdditionalWorkers",
  "teamMembers",
  "helperPaymentArrangement",
];

const STEP3_FIELDS: (keyof QuestionnaireFieldErrors)[] = [
  "workersCompStatus",
  "workersCompNoReason",
  "workersCompNoReasonOther",
  "workersCompCarrierName",
  "workersCompPolicyNumber",
  "workersCompExpirationDate",
  "generalLiabilityStatus",
  "insuranceProviderName",
  "insuranceExpirationDate",
  "insuranceOregonCoverage",
];

const STEP_FIELD_ORDER: Record<QuestionnaireWizardStep, (keyof QuestionnaireFieldErrors)[]> = {
  1: STEP1_FIELDS,
  2: STEP2_FIELDS,
  3: STEP3_FIELDS,
  4: [],
};

function pickStepErrors(
  step: QuestionnaireWizardStep,
  allErrors: QuestionnaireFieldErrors,
): QuestionnaireFieldErrors {
  const allowed = new Set<keyof QuestionnaireFieldErrors>(STEP_FIELD_ORDER[step]);
  const picked: QuestionnaireFieldErrors = {};
  for (const key of allowed) {
    const message = allErrors[key];
    if (message) picked[key] = message;
  }
  return picked;
}

export function wizardStepFieldKeys(step: QuestionnaireWizardStep): (keyof QuestionnaireFieldErrors)[] {
  return STEP_FIELD_ORDER[step];
}

export function clearErrorsForWizardStep(
  step: QuestionnaireWizardStep,
  errors: QuestionnaireFieldErrors,
): QuestionnaireFieldErrors {
  const next = { ...errors };
  for (const key of STEP_FIELD_ORDER[step]) {
    delete next[key];
  }
  return next;
}

/** Validate only the fields that belong to the given wizard step (uses trim/normalize for checks). */
export function validateQuestionnaireWizardStep(
  step: QuestionnaireWizardStep,
  input: ContractorQuestionnaireInput,
): QuestionnaireFieldErrors {
  if (step === 4) return {};
  const normalized = normalizeQuestionnaireInput(input);
  const allErrors = validateQuestionnaireInput(normalized);
  return pickStepErrors(step, allErrors);
}

export function firstWizardStepFieldWithError(
  step: QuestionnaireWizardStep,
  errors: QuestionnaireFieldErrors,
): keyof QuestionnaireFieldErrors | undefined {
  for (const key of STEP_FIELD_ORDER[step]) {
    if (errors[key]) return key;
  }
  return undefined;
}

export function wizardStepStorageKey(cleanerId: string): string {
  return `ghh-bq-wizard-step-${cleanerId}`;
}

export function readStoredWizardStep(cleanerId: string | undefined): QuestionnaireWizardStep | null {
  if (!cleanerId || typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(wizardStepStorageKey(cleanerId));
    if (raw === "1" || raw === "2" || raw === "3" || raw === "4") return Number(raw) as QuestionnaireWizardStep;
  } catch {
    // ignore
  }
  return null;
}

export function writeStoredWizardStep(cleanerId: string | undefined, step: QuestionnaireWizardStep): void {
  if (!cleanerId || typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(wizardStepStorageKey(cleanerId), String(step));
  } catch {
    // ignore
  }
}

function snapshotForCompare(input: ContractorQuestionnaireInput): string {
  return JSON.stringify(normalizeQuestionnaireInput(input));
}

/** True when answers match the last submitted questionnaire (after normalization). */
export function questionnaireInputMatchesSubmitted(
  input: ContractorQuestionnaireInput,
  questionnaire: ContractorBusinessQuestionnaire | undefined,
): boolean {
  if (!questionnaire?.submittedAt) return false;
  const fromSubmitted = inputFromQuestionnaire(questionnaire);
  return snapshotForCompare(input) === snapshotForCompare(fromSubmitted);
}
