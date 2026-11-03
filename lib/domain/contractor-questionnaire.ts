import { normalizePhone } from "./customers.ts";
import { readWorkersCompComplianceHistoryFromRecord } from "./contractor-workers-comp-compliance.ts";
import { isValidDate, todayInBusinessZone } from "./time.ts";
import { US_STATE_OPTIONS } from "./us-states.ts";

export type QuestionnaireReviewStatus = "NOT_SUBMITTED" | "SUBMITTED" | "NEEDS_REVIEW" | "REVIEWED";

export type BusinessRegistrationStatus = "LLC_OR_CORP" | "SOLE_PROPRIETOR";
export type BusinessStructure = "LLC_SINGLE" | "LLC_MULTI" | "CORPORATION";
export type OregonServiceStatus = "YES" | "NO" | "PLANNED";
export type TeamRelationship = "W2" | "CONTRACTOR_1099" | "CO_OWNER" | "MIX" | "UNSURE";
/** Per-person working relationship collected on the business owner questionnaire. */
export type TeamMemberWorkingRelationship = "EMPLOYEE" | "CONTRACTOR_1099" | "CO_OWNER" | "UNSURE" | "OTHER";
export type WorkersCompStatus = "YES" | "NO" | "UNSURE";
export type WorkersCompNoReason =
  | "WORK_ALONE"
  | "OWNERS_ONLY"
  | "CONTRACTORS_1099"
  | "HELPERS_NOT_W2"
  | "OBTAINING_COVERAGE"
  | "UNSURE_NEED"
  | "OTHER"
  /** @deprecated Legacy value; reads as {@link OBTAINING_COVERAGE}. */
  | "NOT_PURCHASED";

export type WorkersCompComplianceStatus = "NEEDS_REVIEW" | "COVERAGE_REQUIRED" | "EXEMPTION_VERIFIED";

export type WorkersCompComplianceHistoryEntry = {
  recordedAt: string;
  recordedBy: string;
  previousStatus?: WorkersCompComplianceStatus;
  status: WorkersCompComplianceStatus;
  summary: string;
};
export type HelperPaymentArrangement = "BUSINESS_PAYS" | "GOLDEN_HOUR_PAYS" | "VARIES" | "UNSURE";

export type BusinessRegistrationVerificationStatus = "NOT_VERIFIED" | "VERIFIED" | "UNABLE_TO_VERIFY";

export type GeneralLiabilityInsuranceStatus = "YES" | "NO" | "IN_PROGRESS";
export type InsuranceOregonCoverageStatus = "YES" | "NO" | "UNSURE";
export type CoiVerificationStatus = "NOT_RECEIVED" | "NEEDS_REVIEW" | "VERIFIED";
export type EffectiveCoiVerificationStatus = CoiVerificationStatus | "EXPIRED";

export type QuestionnaireTeamMember = {
  firstName: string;
  lastName: string;
  workingRelationship?: TeamMemberWorkingRelationship | "";
  workingRelationshipOther?: string;
};

export type ContractorBusinessQuestionnaire = {
  businessDisplayName: string;
  ownerLegalName: string;
  registrationStatus: BusinessRegistrationStatus;
  businessStructure?: BusinessStructure;
  registeredLegalName?: string;
  registrationState?: string;
  /** State-assigned LLC/corporation registry number (not EIN). */
  stateRegistrationNumber?: string;
  /** Admin verification of state registration number; LLC/corp only. */
  registrationVerificationStatus?: BusinessRegistrationVerificationStatus;
  businessStreetAddress: string;
  businessCity: string;
  businessState: string;
  businessZip: string;
  businessPhone: string;
  businessEmail: string;
  oregonServiceStatus: OregonServiceStatus;
  hasAdditionalWorkers: boolean;
  teamMembers?: QuestionnaireTeamMember[];
  /** Legacy single answer for all helpers; superseded by per-member {@link QuestionnaireTeamMember.workingRelationship}. */
  teamRelationship?: TeamRelationship;
  workersCompStatus?: WorkersCompStatus;
  workersCompNoReason?: WorkersCompNoReason;
  workersCompNoReasonOther?: string;
  /** Contractor self-reported when workersCompStatus is YES. */
  workersCompCarrierName?: string;
  workersCompPolicyNumber?: string;
  workersCompExpirationDate?: string;
  workersCompComplianceStatus?: WorkersCompComplianceStatus;
  workersCompComplianceCarrier?: string;
  workersCompCompliancePolicyNumber?: string;
  workersCompCompliancePolicyExpirationDate?: string;
  workersCompComplianceCertificateReceived?: boolean;
  workersCompComplianceExemptionReason?: string;
  workersCompComplianceInternalNotes?: string;
  workersCompComplianceVerifiedAt?: string;
  workersCompComplianceVerifiedBy?: string;
  workersCompComplianceHistory?: WorkersCompComplianceHistoryEntry[];
  helperPaymentArrangement?: HelperPaymentArrangement;
  /** Present on questionnaires submitted after the insurance section shipped. */
  generalLiabilityStatus?: GeneralLiabilityInsuranceStatus;
  insuranceProviderName?: string;
  /** Calendar date YYYY-MM-DD in business timezone semantics. */
  insuranceExpirationDate?: string;
  insuranceOregonCoverage?: InsuranceOregonCoverageStatus;
  /** When contractor last changed self-reported insurance answers. */
  insuranceUpdatedAt?: string;
  coiVerificationStatus?: CoiVerificationStatus;
  coiVerifiedAt?: string;
  coiVerifiedBy?: string;
  submittedAt?: string;
  updatedAt: string;
  reviewStatus: QuestionnaireReviewStatus;
  reviewFlags: QuestionnaireReviewFlag[];
  reviewedAt?: string;
  reviewedBy?: string;
};

export type QuestionnaireReviewFlag =
  | "UNSURE_BUSINESS_STRUCTURE"
  | "EMPLOYEES_NO_WORKERS_COMP"
  | "UNSURE_WORKERS_COMP"
  | "UNSURE_TEAM_CLASSIFICATION"
  | "TEAM_MEMBER_RELATIONSHIP_OTHER"
  | "TEAM_ROSTER_UPDATED"
  | "GOLDEN_HOUR_PAYS_HELPERS"
  | "VARIABLE_OR_UNKNOWN_PAYMENT"
  | "NO_GENERAL_LIABILITY_INSURANCE"
  | "OBTAINING_GENERAL_LIABILITY_INSURANCE"
  | "UNSURE_INSURANCE_OREGON_COVERAGE"
  | "INSURANCE_OREGON_NOT_COVERED"
  | "INSURANCE_EXPIRED"
  | "COI_NEEDS_REVIEW"
  | "HELPERS_NO_WORKERS_COMP"
  | "SUBCONTRACTOR_1099_UNVERIFIED"
  | "OWNERS_ONLY_OWNERSHIP_MISMATCH"
  | "WORKERS_COMP_EXPIRED";

/** Payload from the cleaner form (before normalization). */
export type ContractorQuestionnaireInput = {
  businessDisplayName: string;
  ownerLegalName: string;
  registrationStatus: BusinessRegistrationStatus | "";
  businessStructure: BusinessStructure | "";
  registeredLegalName: string;
  registrationState: string;
  stateRegistrationNumber: string;
  businessStreetAddress: string;
  businessCity: string;
  businessState: string;
  businessZip: string;
  businessPhone: string;
  businessEmail: string;
  oregonServiceStatus: OregonServiceStatus | "";
  hasAdditionalWorkers: boolean | null;
  teamMembers: QuestionnaireTeamMember[];
  workersCompStatus: WorkersCompStatus | "";
  workersCompNoReason: WorkersCompNoReason | "";
  workersCompNoReasonOther: string;
  workersCompCarrierName: string;
  workersCompPolicyNumber: string;
  workersCompExpirationDate: string;
  helperPaymentArrangement: HelperPaymentArrangement | "";
  generalLiabilityStatus: GeneralLiabilityInsuranceStatus | "";
  insuranceProviderName: string;
  insuranceExpirationDate: string;
  insuranceOregonCoverage: InsuranceOregonCoverageStatus | "";
};

export type QuestionnaireFieldErrors = Partial<Record<keyof ContractorQuestionnaireInput | "teamMembers", string>>;

const US_STATE_CODES = new Set(US_STATE_OPTIONS.map((item) => item.value));

function trim(value: string): string {
  return value.trim();
}

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isValidStateRegistrationNumber(value: string): boolean {
  const trimmed = trim(value);
  if (!trimmed) return false;
  return /^[A-Za-z0-9-]+$/.test(trimmed);
}

export function registrationVerificationStatusLabel(status: BusinessRegistrationVerificationStatus): string {
  switch (status) {
    case "NOT_VERIFIED":
      return "Not verified";
    case "VERIFIED":
      return "Verified";
    case "UNABLE_TO_VERIFY":
      return "Unable to verify";
  }
}

export function generalLiabilityInsuranceStatusLabel(status: GeneralLiabilityInsuranceStatus): string {
  switch (status) {
    case "YES":
      return "Yes";
    case "NO":
      return "No";
    case "IN_PROGRESS":
      return "In the process of getting insured";
  }
}

export function insuranceOregonCoverageStatusLabel(status: InsuranceOregonCoverageStatus): string {
  switch (status) {
    case "YES":
      return "Yes";
    case "NO":
      return "No";
    case "UNSURE":
      return "Not sure";
  }
}

export function coiVerificationStatusLabel(status: CoiVerificationStatus): string {
  switch (status) {
    case "NOT_RECEIVED":
      return "Not received";
    case "NEEDS_REVIEW":
      return "Needs review";
    case "VERIFIED":
      return "Verified";
  }
}

export function effectiveCoiVerificationStatusLabel(status: EffectiveCoiVerificationStatus): string {
  if (status === "EXPIRED") return "Expired";
  return coiVerificationStatusLabel(status);
}

export function insurancePolicyIsExpired(expirationDate: string | undefined, now = new Date()): boolean {
  if (!expirationDate || !isValidDate(expirationDate)) return false;
  const today = todayInBusinessZone(now);
  return expirationDate < today;
}

export function effectiveCoiVerificationStatus(
  questionnaire: ContractorBusinessQuestionnaire,
  now = new Date(),
): EffectiveCoiVerificationStatus {
  if (
    questionnaire.generalLiabilityStatus === "YES" &&
    insurancePolicyIsExpired(questionnaire.insuranceExpirationDate, now)
  ) {
    return "EXPIRED";
  }
  if (questionnaire.coiVerificationStatus === "VERIFIED") {
    return "VERIFIED";
  }
  return questionnaire.coiVerificationStatus ?? "NOT_RECEIVED";
}

function registrationIdentityChanged(
  previous: ContractorBusinessQuestionnaire | undefined,
  next: {
    registeredLegalName?: string;
    registrationState?: string;
    stateRegistrationNumber?: string;
  },
): boolean {
  if (!previous) return true;
  return (
    (previous.registeredLegalName ?? "") !== (next.registeredLegalName ?? "") ||
    (previous.registrationState ?? "") !== (next.registrationState ?? "") ||
    (previous.stateRegistrationNumber ?? "") !== (next.stateRegistrationNumber ?? "")
  );
}

function insuranceCoiResetFieldsChanged(
  previous: ContractorBusinessQuestionnaire | undefined,
  next: {
    insuranceProviderName?: string;
    insuranceExpirationDate?: string;
    insuranceOregonCoverage?: InsuranceOregonCoverageStatus;
  },
): boolean {
  if (!previous) return false;
  return (
    (previous.insuranceProviderName ?? "") !== (next.insuranceProviderName ?? "") ||
    (previous.insuranceExpirationDate ?? "") !== (next.insuranceExpirationDate ?? "") ||
    (previous.insuranceOregonCoverage ?? "") !== (next.insuranceOregonCoverage ?? "")
  );
}

function insuranceSelfReportChanged(
  previous: ContractorBusinessQuestionnaire | undefined,
  next: {
    generalLiabilityStatus: GeneralLiabilityInsuranceStatus;
    insuranceProviderName?: string;
    insuranceExpirationDate?: string;
    insuranceOregonCoverage?: InsuranceOregonCoverageStatus;
  },
): boolean {
  if (!previous) return true;
  return (
    previous.generalLiabilityStatus !== next.generalLiabilityStatus ||
    (previous.insuranceProviderName ?? "") !== (next.insuranceProviderName ?? "") ||
    (previous.insuranceExpirationDate ?? "") !== (next.insuranceExpirationDate ?? "") ||
    (previous.insuranceOregonCoverage ?? "") !== (next.insuranceOregonCoverage ?? "")
  );
}

export function questionnaireReviewStatusLabel(status: QuestionnaireReviewStatus): string {
  switch (status) {
    case "NOT_SUBMITTED":
      return "Not submitted";
    case "SUBMITTED":
      return "Submitted";
    case "NEEDS_REVIEW":
      return "Needs review";
    case "REVIEWED":
      return "Reviewed";
  }
}

/** Tailwind classes for cleaner-facing status emphasis. */
export function questionnaireReviewStatusClassName(status: QuestionnaireReviewStatus): string {
  if (status === "NOT_SUBMITTED") return "font-semibold text-red-700";
  return "font-semibold text-ink";
}

export function registrationStatusLabel(value: BusinessRegistrationStatus): string {
  return value === "LLC_OR_CORP" ? "LLC or corporation" : "Sole proprietor";
}

export function businessStructureLabel(value: BusinessStructure): string {
  switch (value) {
    case "LLC_SINGLE":
      return "LLC with one owner";
    case "LLC_MULTI":
      return "LLC with two or more owners";
    case "CORPORATION":
      return "Corporation";
  }
}

export function oregonServiceStatusLabel(value: OregonServiceStatus): string {
  switch (value) {
    case "YES":
      return "Yes";
    case "NO":
      return "No";
    case "PLANNED":
      return "Not yet, but I plan to";
  }
}

export function teamRelationshipLabel(value: TeamRelationship): string {
  switch (value) {
    case "W2":
      return "W-2 employees";
    case "CONTRACTOR_1099":
      return "1099 independent contractors";
    case "CO_OWNER":
      return "Co-owners";
    case "MIX":
      return "A mix of the above";
    case "UNSURE":
      return "Unsure how to classify them";
  }
}

export function teamMemberWorkingRelationshipLabel(value: TeamMemberWorkingRelationship): string {
  switch (value) {
    case "EMPLOYEE":
      return "Employee";
    case "CONTRACTOR_1099":
      return "Self-employed cleaner hired to help";
    case "CO_OWNER":
      return "Co-owner";
    case "UNSURE":
      return "Unsure how they're classified";
    case "OTHER":
      return "Other";
  }
}

export function emptyTeamMember(): QuestionnaireTeamMember {
  return { firstName: "", lastName: "", workingRelationship: "", workingRelationshipOther: "" };
}

function legacyTeamRelationshipToMemberRelationship(
  value: TeamRelationship | undefined,
): TeamMemberWorkingRelationship | "" {
  switch (value) {
    case "W2":
      return "EMPLOYEE";
    case "CONTRACTOR_1099":
      return "CONTRACTOR_1099";
    case "CO_OWNER":
      return "CO_OWNER";
    case "UNSURE":
      return "UNSURE";
    case "MIX":
      return "UNSURE";
    default:
      return "";
  }
}

export function migrateTeamMembersFromLegacy(
  members: QuestionnaireTeamMember[],
  legacyTeamRelationship?: TeamRelationship,
): QuestionnaireTeamMember[] {
  const legacyMapped = legacyTeamRelationshipToMemberRelationship(legacyTeamRelationship);
  return members.map((member) => ({
    ...member,
    workingRelationship: member.workingRelationship || legacyMapped || "",
    workingRelationshipOther: member.workingRelationshipOther ?? "",
  }));
}

function parseTeamMemberWorkingRelationship(value: unknown): TeamMemberWorkingRelationship | "" {
  if (
    value === "EMPLOYEE" ||
    value === "CONTRACTOR_1099" ||
    value === "CO_OWNER" ||
    value === "UNSURE" ||
    value === "OTHER"
  ) {
    return value;
  }
  return "";
}

function parseTeamMembersFromRecord(
  value: unknown,
  legacyTeamRelationship?: TeamRelationship,
): QuestionnaireTeamMember[] {
  if (!Array.isArray(value)) return [emptyTeamMember()];
  const members = value
    .filter((item) => item && typeof item === "object")
    .map((item) => {
      const row = item as Record<string, unknown>;
      return {
        firstName: typeof row.firstName === "string" ? row.firstName : "",
        lastName: typeof row.lastName === "string" ? row.lastName : "",
        workingRelationship: parseTeamMemberWorkingRelationship(row.workingRelationship),
        workingRelationshipOther:
          typeof row.workingRelationshipOther === "string" ? row.workingRelationshipOther : "",
      };
    });
  if (members.length === 0) return [emptyTeamMember()];
  return migrateTeamMembersFromLegacy(members, legacyTeamRelationship);
}

export function formatTeamMemberForAdmin(member: QuestionnaireTeamMember): string {
  const name = [member.firstName, member.lastName].filter((part) => trim(part).length > 0).join(" ");
  if (!name) return "—";
  if (member.workingRelationship === "OTHER" && trim(member.workingRelationshipOther ?? "")) {
    return `${name} — Other: ${trim(member.workingRelationshipOther!)}`;
  }
  if (member.workingRelationship) {
    return `${name} — ${teamMemberWorkingRelationshipLabel(member.workingRelationship)}`;
  }
  return name;
}

export function workersCompStatusLabel(value: WorkersCompStatus): string {
  switch (value) {
    case "YES":
      return "Yes";
    case "NO":
      return "No";
    case "UNSURE":
      return "Not sure";
  }
}

export function workersCompNoReasonLabel(value: WorkersCompNoReason): string {
  switch (normalizeWorkersCompNoReason(value)) {
    case "WORK_ALONE":
      return "Works alone with no employees or helpers";
    case "OWNERS_ONLY":
      return "Only business owners perform cleaning services";
    case "CONTRACTORS_1099":
      return "Uses independent subcontractors with their own businesses";
    case "HELPERS_NOT_W2":
      return "Has helpers who are not W-2 employees";
    case "OBTAINING_COVERAGE":
      return "In the process of obtaining coverage";
    case "UNSURE_NEED":
      return "Not sure whether coverage is needed";
    case "OTHER":
      return "Other";
    default:
      return "Other";
  }
}

export function normalizeWorkersCompNoReason(value: WorkersCompNoReason | ""): WorkersCompNoReason | "" {
  if (value === "NOT_PURCHASED") return "OBTAINING_COVERAGE";
  return value;
}

function parseWorkersCompNoReason(value: unknown): WorkersCompNoReason | "" {
  if (value === "WORK_ALONE") return "WORK_ALONE";
  if (value === "OWNERS_ONLY") return "OWNERS_ONLY";
  if (value === "CONTRACTORS_1099") return "CONTRACTORS_1099";
  if (value === "HELPERS_NOT_W2") return "HELPERS_NOT_W2";
  if (value === "OBTAINING_COVERAGE" || value === "NOT_PURCHASED") return "OBTAINING_COVERAGE";
  if (value === "UNSURE_NEED") return "UNSURE_NEED";
  if (value === "OTHER") return "OTHER";
  return "";
}

function parseWorkersCompNoReasonOptional(value: unknown): WorkersCompNoReason | undefined {
  const parsed = parseWorkersCompNoReason(value);
  return parsed === "" ? undefined : parsed;
}

export function helperPaymentArrangementLabel(value: HelperPaymentArrangement): string {
  switch (value) {
    case "BUSINESS_PAYS":
      return "Paid through the business";
    case "GOLDEN_HOUR_PAYS":
      return "Golden Hour Cleaning Co pays directly";
    case "VARIES":
      return "Varies";
    case "UNSURE":
      return "Not sure";
  }
}

export function reviewFlagLabel(flag: QuestionnaireReviewFlag): string {
  switch (flag) {
    case "UNSURE_BUSINESS_STRUCTURE":
      return "Unsure about business registration structure";
    case "EMPLOYEES_NO_WORKERS_COMP":
      return "Has W-2 employees but no workers' compensation";
    case "UNSURE_WORKERS_COMP":
      return "Unsure about workers' compensation";
    case "UNSURE_TEAM_CLASSIFICATION":
      return "Unsure how a helper is classified";
    case "TEAM_MEMBER_RELATIONSHIP_OTHER":
      return "Helper working relationship explained as other";
    case "TEAM_ROSTER_UPDATED":
      return "Golden Hour team roster updated — review required";
    case "GOLDEN_HOUR_PAYS_HELPERS":
      return "Golden Hour Cleaning Co pays helpers directly";
    case "VARIABLE_OR_UNKNOWN_PAYMENT":
      return "Payment arrangement varies or is unknown";
    case "NO_GENERAL_LIABILITY_INSURANCE":
      return "No general liability insurance reported";
    case "OBTAINING_GENERAL_LIABILITY_INSURANCE":
      return "Still obtaining general liability insurance";
    case "UNSURE_INSURANCE_OREGON_COVERAGE":
      return "Unsure whether policy covers Oregon cleaning jobs";
    case "INSURANCE_OREGON_NOT_COVERED":
      return "Policy does not cover Oregon cleaning jobs";
    case "INSURANCE_EXPIRED":
      return "General liability insurance has expired";
    case "COI_NEEDS_REVIEW":
      return "Certificate of insurance needs review";
    case "HELPERS_NO_WORKERS_COMP":
      return "Helpers reported but no workers' compensation coverage";
    case "SUBCONTRACTOR_1099_UNVERIFIED":
      return "1099 subcontractors reported; independent status not verified";
    case "OWNERS_ONLY_OWNERSHIP_MISMATCH":
      return "Owners-only workers' comp explanation conflicts with team or structure";
    case "WORKERS_COMP_EXPIRED":
      return "Workers' compensation policy has expired";
  }
}

export function validateQuestionnaireInput(input: ContractorQuestionnaireInput): QuestionnaireFieldErrors {
  const errors: QuestionnaireFieldErrors = {};
  if (!trim(input.businessDisplayName)) errors.businessDisplayName = "Enter your business name.";
  if (!trim(input.ownerLegalName)) errors.ownerLegalName = "Enter the owner's legal name.";
  if (input.registrationStatus !== "LLC_OR_CORP" && input.registrationStatus !== "SOLE_PROPRIETOR") {
    errors.registrationStatus = "Select an option.";
  }
  if (input.registrationStatus === "LLC_OR_CORP") {
    if (!input.businessStructure) errors.businessStructure = "Select a business type.";
    if (!trim(input.registeredLegalName)) errors.registeredLegalName = "Enter the registered legal business name.";
    if (!input.registrationState || !US_STATE_CODES.has(input.registrationState)) {
      errors.registrationState = "Select a state.";
    }
    if (!isValidStateRegistrationNumber(input.stateRegistrationNumber)) {
      errors.stateRegistrationNumber =
        "Enter your state registration number using letters, numbers, or hyphens only.";
    }
  }
  if (!trim(input.businessStreetAddress)) errors.businessStreetAddress = "Enter a street address.";
  if (!trim(input.businessCity)) errors.businessCity = "Enter a city.";
  if (!input.businessState || !US_STATE_CODES.has(input.businessState)) errors.businessState = "Select a state.";
  const zipDigits = input.businessZip.replace(/\D/g, "");
  if (zipDigits.length < 5) errors.businessZip = "Enter a valid ZIP code.";
  const phone = normalizePhone(input.businessPhone);
  if (!phone) errors.businessPhone = "Enter a 10-digit phone number.";
  if (!trim(input.businessEmail) || !isEmail(trim(input.businessEmail))) {
    errors.businessEmail = "Enter a valid email address.";
  }
  if (input.oregonServiceStatus !== "YES" && input.oregonServiceStatus !== "NO" && input.oregonServiceStatus !== "PLANNED") {
    errors.oregonServiceStatus = "Select an option.";
  }
  if (input.hasAdditionalWorkers !== true && input.hasAdditionalWorkers !== false) {
    errors.hasAdditionalWorkers = "Select an option.";
  }
  if (input.hasAdditionalWorkers === true) {
    const members = input.teamMembers.filter(
      (member) => trim(member.firstName).length > 0 || trim(member.lastName).length > 0,
    );
    if (members.length === 0) {
      errors.teamMembers = "Add at least one person.";
    } else {
      for (const member of members) {
        if (!trim(member.firstName) || !trim(member.lastName)) {
          errors.teamMembers = "Enter each person's first and last name.";
          break;
        }
        if (!member.workingRelationship) {
          errors.teamMembers = "Select a working relationship for each person.";
          break;
        }
        if (member.workingRelationship === "OTHER" && !trim(member.workingRelationshipOther ?? "")) {
          errors.teamMembers = "Briefly explain each person's working relationship marked as other.";
          break;
        }
      }
    }
    if (!input.helperPaymentArrangement) errors.helperPaymentArrangement = "Select an option.";
  }
  if (input.hasAdditionalWorkers === true || input.hasAdditionalWorkers === false) {
    if (!input.workersCompStatus) errors.workersCompStatus = "Select an option.";
    if (input.workersCompStatus === "NO") {
      if (!normalizeWorkersCompNoReason(input.workersCompNoReason)) errors.workersCompNoReason = "Select an option.";
      if (input.workersCompNoReason === "OTHER" && !trim(input.workersCompNoReasonOther)) {
        errors.workersCompNoReasonOther = "Briefly explain.";
      }
    }
    if (input.workersCompStatus === "YES") {
      const exp = trim(input.workersCompExpirationDate);
      if (exp && !isValidDate(exp)) {
        errors.workersCompExpirationDate = "Select a valid expiration date.";
      }
    }
  }
  if (
    input.generalLiabilityStatus !== "YES" &&
    input.generalLiabilityStatus !== "NO" &&
    input.generalLiabilityStatus !== "IN_PROGRESS"
  ) {
    errors.generalLiabilityStatus = "Select an option.";
  }
  if (input.generalLiabilityStatus === "YES") {
    if (!trim(input.insuranceProviderName)) {
      errors.insuranceProviderName = "Enter your insurance company.";
    }
    if (!trim(input.insuranceExpirationDate) || !isValidDate(trim(input.insuranceExpirationDate))) {
      errors.insuranceExpirationDate = "Select a valid expiration date.";
    }
    if (
      input.insuranceOregonCoverage !== "YES" &&
      input.insuranceOregonCoverage !== "NO" &&
      input.insuranceOregonCoverage !== "UNSURE"
    ) {
      errors.insuranceOregonCoverage = "Select an option.";
    }
  }
  return errors;
}

/** True when all required answers pass validation (does not imply submitted). */
export function questionnaireInputIsComplete(input: ContractorQuestionnaireInput): boolean {
  const normalized = normalizeQuestionnaireInput(input);
  return Object.keys(validateQuestionnaireInput(normalized)).length === 0;
}

/** Drop conditional fields that no longer apply (no string trimming). */
export function prepareQuestionnaireDraftInput(input: ContractorQuestionnaireInput): ContractorQuestionnaireInput {
  const next: ContractorQuestionnaireInput = {
    ...input,
    teamMembers: input.teamMembers.map((member) => ({ ...member })),
  };
  next.teamMembers = next.teamMembers.map((member) => ({
    ...member,
    workingRelationshipOther: member.workingRelationship === "OTHER" ? member.workingRelationshipOther ?? "" : "",
  }));
  if (next.registrationStatus !== "LLC_OR_CORP") {
    next.businessStructure = "";
    next.registeredLegalName = "";
    next.registrationState = "";
    next.stateRegistrationNumber = "";
  }
  if (next.hasAdditionalWorkers !== true) {
    next.teamMembers = [];
    next.helperPaymentArrangement = "";
  }
  next.workersCompNoReason = normalizeWorkersCompNoReason(next.workersCompNoReason);
  if (next.workersCompStatus !== "NO") {
    next.workersCompNoReason = "";
    next.workersCompNoReasonOther = "";
  }
  if (next.workersCompStatus !== "YES") {
    next.workersCompCarrierName = "";
    next.workersCompPolicyNumber = "";
    next.workersCompExpirationDate = "";
  }
  if (next.generalLiabilityStatus !== "YES") {
    next.insuranceProviderName = "";
    next.insuranceExpirationDate = "";
    next.insuranceOregonCoverage = "";
  }
  if (
    next.oregonServiceStatus !== "YES" &&
    next.oregonServiceStatus !== "NO" &&
    next.oregonServiceStatus !== "PLANNED"
  ) {
    next.oregonServiceStatus = "YES";
  }
  return next;
}

/** Trim and normalize values for validation and submit (not used for draft autosave). */
export function normalizeQuestionnaireInput(input: ContractorQuestionnaireInput): ContractorQuestionnaireInput {
  const trimmed: ContractorQuestionnaireInput = {
    ...input,
    businessDisplayName: trim(input.businessDisplayName),
    ownerLegalName: trim(input.ownerLegalName),
    registeredLegalName: trim(input.registeredLegalName),
    stateRegistrationNumber: trim(input.stateRegistrationNumber),
    businessStreetAddress: trim(input.businessStreetAddress),
    businessCity: trim(input.businessCity),
    businessZip: input.businessZip.replace(/\D/g, "").slice(0, 10),
    businessEmail: trim(input.businessEmail),
    workersCompNoReasonOther: trim(input.workersCompNoReasonOther),
    workersCompCarrierName: trim(input.workersCompCarrierName ?? ""),
    workersCompPolicyNumber: trim(input.workersCompPolicyNumber ?? ""),
    workersCompExpirationDate: trim(input.workersCompExpirationDate ?? ""),
    insuranceProviderName: trim(input.insuranceProviderName),
    insuranceExpirationDate: trim(input.insuranceExpirationDate),
    teamMembers: input.teamMembers.map((member) => ({
      firstName: trim(member.firstName),
      lastName: trim(member.lastName),
      workingRelationship: member.workingRelationship,
      workingRelationshipOther: trim(member.workingRelationshipOther ?? ""),
    })),
  };
  const phone = normalizePhone(trimmed.businessPhone);
  if (phone) trimmed.businessPhone = phone;
  return prepareQuestionnaireDraftInput(trimmed);
}

function questionnaireHasEmployeeHelper(questionnaire: ContractorBusinessQuestionnaire): boolean {
  const members = questionnaire.teamMembers ?? [];
  if (members.some((member) => member.workingRelationship === "EMPLOYEE")) return true;
  if (members.some((member) => member.workingRelationship)) return false;
  return questionnaire.teamRelationship === "W2";
}

function questionnaireTeamClassificationFlags(questionnaire: ContractorBusinessQuestionnaire): QuestionnaireReviewFlag[] {
  const flags: QuestionnaireReviewFlag[] = [];
  const members = questionnaire.teamMembers ?? [];
  const hasPerMember = members.some((member) => member.workingRelationship);
  if (hasPerMember) {
    if (members.some((member) => member.workingRelationship === "UNSURE")) {
      flags.push("UNSURE_TEAM_CLASSIFICATION");
    }
    if (members.some((member) => member.workingRelationship === "OTHER")) {
      flags.push("TEAM_MEMBER_RELATIONSHIP_OTHER");
    }
    return flags;
  }
  const legacy = questionnaire.teamRelationship;
  if (legacy === "UNSURE" || legacy === "MIX") flags.push("UNSURE_TEAM_CLASSIFICATION");
  return flags;
}

function teamMemberCompareKey(member: QuestionnaireTeamMember): string {
  return [
    trim(member.firstName).toLowerCase(),
    trim(member.lastName).toLowerCase(),
    member.workingRelationship ?? "",
    trim(member.workingRelationshipOther ?? "").toLowerCase(),
  ].join("|");
}

/** Drop blank rows from submitted questionnaire records; drafts keep in-progress slots. */
function teamMembersForStoredQuestionnaire(members: QuestionnaireTeamMember[]): QuestionnaireTeamMember[] {
  return members.filter(
    (member) =>
      member.firstName.length > 0 ||
      member.lastName.length > 0 ||
      Boolean(member.workingRelationship),
  );
}

export function teamRosterSignature(questionnaire: {
  hasAdditionalWorkers: boolean;
  teamMembers?: QuestionnaireTeamMember[];
}): string {
  if (!questionnaire.hasAdditionalWorkers) return "solo";
  const members = (questionnaire.teamMembers ?? [])
    .map(teamMemberCompareKey)
    .filter((row) => row.replace(/\|/g, "").length > 0)
    .sort();
  return `team:${members.join(";")}`;
}

function teamRosterChanged(
  previous: ContractorBusinessQuestionnaire | undefined,
  next: ContractorBusinessQuestionnaire,
): boolean {
  if (!previous?.submittedAt) return false;
  return teamRosterSignature(previous) !== teamRosterSignature(next);
}

function workersCompSelfReportChanged(
  previous: ContractorBusinessQuestionnaire | undefined,
  next: ContractorBusinessQuestionnaire,
): boolean {
  if (!previous) return true;
  return (
    previous.workersCompStatus !== next.workersCompStatus ||
    (previous.workersCompNoReason ?? "") !== (next.workersCompNoReason ?? "") ||
    (previous.workersCompNoReasonOther ?? "") !== (next.workersCompNoReasonOther ?? "") ||
    (previous.workersCompCarrierName ?? "") !== (next.workersCompCarrierName ?? "") ||
    (previous.workersCompPolicyNumber ?? "") !== (next.workersCompPolicyNumber ?? "") ||
    (previous.workersCompExpirationDate ?? "") !== (next.workersCompExpirationDate ?? "") ||
    previous.hasAdditionalWorkers !== next.hasAdditionalWorkers
  );
}

function workersCompMaterialChange(
  previous: ContractorBusinessQuestionnaire | undefined,
  next: ContractorBusinessQuestionnaire,
): boolean {
  if (!previous?.submittedAt) return false;
  return (
    workersCompSelfReportChanged(previous, next) ||
    teamRosterChanged(previous, next) ||
    previous.registrationStatus !== next.registrationStatus ||
    registrationIdentityChanged(previous, {
      registeredLegalName: next.registeredLegalName,
      registrationState: next.registrationState,
      stateRegistrationNumber: next.stateRegistrationNumber,
    })
  );
}

function copyWorkersCompComplianceAdminFields(
  target: ContractorBusinessQuestionnaire,
  source: ContractorBusinessQuestionnaire,
): void {
  target.workersCompComplianceStatus = source.workersCompComplianceStatus;
  target.workersCompComplianceCarrier = source.workersCompComplianceCarrier;
  target.workersCompCompliancePolicyNumber = source.workersCompCompliancePolicyNumber;
  target.workersCompCompliancePolicyExpirationDate = source.workersCompCompliancePolicyExpirationDate;
  target.workersCompComplianceCertificateReceived = source.workersCompComplianceCertificateReceived;
  target.workersCompComplianceExemptionReason = source.workersCompComplianceExemptionReason;
  target.workersCompComplianceInternalNotes = source.workersCompComplianceInternalNotes;
  target.workersCompComplianceVerifiedAt = source.workersCompComplianceVerifiedAt;
  target.workersCompComplianceVerifiedBy = source.workersCompComplianceVerifiedBy;
  target.workersCompComplianceHistory = source.workersCompComplianceHistory;
}

export function computeReviewFlags(questionnaire: ContractorBusinessQuestionnaire): QuestionnaireReviewFlag[] {
  const flags: QuestionnaireReviewFlag[] = [];
  const members = questionnaire.teamMembers ?? [];

  if (questionnaire.hasAdditionalWorkers) {
    flags.push(...questionnaireTeamClassificationFlags(questionnaire));
    if (questionnaire.helperPaymentArrangement === "GOLDEN_HOUR_PAYS") {
      flags.push("GOLDEN_HOUR_PAYS_HELPERS");
    }
    if (
      questionnaire.helperPaymentArrangement === "VARIES" ||
      questionnaire.helperPaymentArrangement === "UNSURE"
    ) {
      flags.push("VARIABLE_OR_UNKNOWN_PAYMENT");
    }
  }

  if (questionnaire.workersCompStatus === "UNSURE" || questionnaire.workersCompNoReason === "UNSURE_NEED") {
    flags.push("UNSURE_WORKERS_COMP");
  }
  if (questionnaireHasEmployeeHelper(questionnaire) && questionnaire.workersCompStatus === "NO") {
    flags.push("EMPLOYEES_NO_WORKERS_COMP");
  }
  if (
    questionnaire.hasAdditionalWorkers &&
    (questionnaire.workersCompStatus === "NO" || questionnaire.workersCompStatus === "UNSURE")
  ) {
    flags.push("HELPERS_NO_WORKERS_COMP");
  }
  if (
    members.some((member) => member.workingRelationship === "CONTRACTOR_1099") &&
    questionnaire.workersCompStatus !== "YES"
  ) {
    flags.push("SUBCONTRACTOR_1099_UNVERIFIED");
  }
  if (questionnaire.workersCompNoReason === "OWNERS_ONLY") {
    const hasNonOwnerHelper = members.some(
      (member) => member.workingRelationship && member.workingRelationship !== "CO_OWNER",
    );
    const structureIncomplete =
      questionnaire.registrationStatus === "LLC_OR_CORP" &&
      (!questionnaire.businessStructure || !trim(questionnaire.registeredLegalName ?? ""));
    if (hasNonOwnerHelper || structureIncomplete) {
      flags.push("OWNERS_ONLY_OWNERSHIP_MISMATCH");
    }
  }
  const workersCompExpiration =
    questionnaire.workersCompExpirationDate ?? questionnaire.workersCompCompliancePolicyExpirationDate;
  if (questionnaire.workersCompStatus === "YES" && insurancePolicyIsExpired(workersCompExpiration)) {
    flags.push("WORKERS_COMP_EXPIRED");
  }
  if (
    questionnaire.workersCompComplianceStatus === "EXEMPTION_VERIFIED" &&
    insurancePolicyIsExpired(questionnaire.workersCompCompliancePolicyExpirationDate)
  ) {
    flags.push("WORKERS_COMP_EXPIRED");
  }

  if (!questionnaire.generalLiabilityStatus) {
    // legacy questionnaire without insurance answers
  } else if (questionnaire.generalLiabilityStatus === "NO") {
    flags.push("NO_GENERAL_LIABILITY_INSURANCE");
  } else if (questionnaire.generalLiabilityStatus === "IN_PROGRESS") {
    flags.push("OBTAINING_GENERAL_LIABILITY_INSURANCE");
  } else if (questionnaire.generalLiabilityStatus === "YES") {
    if (insurancePolicyIsExpired(questionnaire.insuranceExpirationDate)) {
      flags.push("INSURANCE_EXPIRED");
    }
    if (questionnaire.insuranceOregonCoverage === "UNSURE") {
      flags.push("UNSURE_INSURANCE_OREGON_COVERAGE");
    }
    if (questionnaire.insuranceOregonCoverage === "NO") {
      flags.push("INSURANCE_OREGON_NOT_COVERED");
    }
  }

  if (questionnaire.coiVerificationStatus === "NEEDS_REVIEW") {
    flags.push("COI_NEEDS_REVIEW");
  }

  return [...new Set(flags)];
}

export function buildQuestionnaireFromInput(
  input: ContractorQuestionnaireInput,
  previous: ContractorBusinessQuestionnaire | undefined,
  now: string,
  updatedBy: string,
): ContractorBusinessQuestionnaire {
  const normalized = normalizeQuestionnaireInput(input);
  const errors = validateQuestionnaireInput(normalized);
  if (Object.keys(errors).length > 0) {
    throw new Error("Invalid questionnaire input.");
  }

  const base: ContractorBusinessQuestionnaire = {
    businessDisplayName: normalized.businessDisplayName,
    ownerLegalName: normalized.ownerLegalName,
    registrationStatus: normalized.registrationStatus as BusinessRegistrationStatus,
    businessStreetAddress: normalized.businessStreetAddress,
    businessCity: normalized.businessCity,
    businessState: normalized.businessState,
    businessZip: normalized.businessZip,
    businessPhone: normalized.businessPhone,
    businessEmail: normalized.businessEmail,
    oregonServiceStatus: normalized.oregonServiceStatus as OregonServiceStatus,
    hasAdditionalWorkers: normalized.hasAdditionalWorkers === true,
    generalLiabilityStatus: normalized.generalLiabilityStatus as GeneralLiabilityInsuranceStatus,
    updatedAt: now,
    reviewStatus: "SUBMITTED",
    reviewFlags: [],
  };

  if (base.generalLiabilityStatus === "YES") {
    base.insuranceProviderName = normalized.insuranceProviderName;
    base.insuranceExpirationDate = normalized.insuranceExpirationDate;
    base.insuranceOregonCoverage = normalized.insuranceOregonCoverage as InsuranceOregonCoverageStatus;
  }

  if (
    insuranceSelfReportChanged(previous, {
      generalLiabilityStatus: base.generalLiabilityStatus ?? "NO",
      insuranceProviderName: base.insuranceProviderName,
      insuranceExpirationDate: base.insuranceExpirationDate,
      insuranceOregonCoverage: base.insuranceOregonCoverage,
    })
  ) {
    base.insuranceUpdatedAt = now;
  } else if (previous?.insuranceUpdatedAt) {
    base.insuranceUpdatedAt = previous.insuranceUpdatedAt;
  }

  const coiReset =
    insuranceCoiResetFieldsChanged(previous, base) ||
    (previous?.generalLiabilityStatus === "YES" && base.generalLiabilityStatus !== "YES");
  if (!previous?.coiVerificationStatus) {
    base.coiVerificationStatus = "NOT_RECEIVED";
  } else if (coiReset && previous.coiVerificationStatus === "VERIFIED") {
    base.coiVerificationStatus = "NEEDS_REVIEW";
    base.coiVerifiedAt = undefined;
    base.coiVerifiedBy = undefined;
  } else if (base.generalLiabilityStatus !== "YES") {
    base.coiVerificationStatus = "NOT_RECEIVED";
    base.coiVerifiedAt = undefined;
    base.coiVerifiedBy = undefined;
  } else {
    base.coiVerificationStatus = previous.coiVerificationStatus;
    base.coiVerifiedAt = previous.coiVerifiedAt;
    base.coiVerifiedBy = previous.coiVerifiedBy;
  }

  if (base.registrationStatus === "LLC_OR_CORP") {
    base.businessStructure = normalized.businessStructure as BusinessStructure;
    base.registeredLegalName = normalized.registeredLegalName;
    base.registrationState = normalized.registrationState;
    base.stateRegistrationNumber = normalized.stateRegistrationNumber;
    const identityChanged = registrationIdentityChanged(previous, {
      registeredLegalName: base.registeredLegalName,
      registrationState: base.registrationState,
      stateRegistrationNumber: base.stateRegistrationNumber,
    });
    if (identityChanged || !previous?.registrationVerificationStatus) {
      base.registrationVerificationStatus = "NOT_VERIFIED";
    } else {
      base.registrationVerificationStatus = previous.registrationVerificationStatus;
    }
  }

  if (base.hasAdditionalWorkers) {
    base.teamMembers = teamMembersForStoredQuestionnaire(normalized.teamMembers);
    base.helperPaymentArrangement = normalized.helperPaymentArrangement as HelperPaymentArrangement;
  }

  base.workersCompStatus = normalized.workersCompStatus as WorkersCompStatus;
  if (base.workersCompStatus === "NO") {
    base.workersCompNoReason = normalized.workersCompNoReason as WorkersCompNoReason;
    if (base.workersCompNoReason === "OTHER") {
      base.workersCompNoReasonOther = normalized.workersCompNoReasonOther;
    }
  }
  if (base.workersCompStatus === "YES") {
    base.workersCompCarrierName = normalized.workersCompCarrierName || undefined;
    base.workersCompPolicyNumber = normalized.workersCompPolicyNumber || undefined;
    base.workersCompExpirationDate = normalized.workersCompExpirationDate || undefined;
  }

  if (!previous?.submittedAt) {
    base.workersCompComplianceStatus = "NEEDS_REVIEW";
  } else if (workersCompMaterialChange(previous, base)) {
    if (previous.workersCompComplianceStatus === "EXEMPTION_VERIFIED") {
      base.workersCompComplianceHistory = [
        ...(previous.workersCompComplianceHistory ?? []),
        {
          recordedAt: now,
          recordedBy: updatedBy,
          previousStatus: "EXEMPTION_VERIFIED",
          status: "NEEDS_REVIEW",
          summary:
            "Contractor updated workers' compensation, team, or business structure information; prior exemption requires re-review.",
        },
      ];
    } else {
      base.workersCompComplianceHistory = previous.workersCompComplianceHistory;
    }
    base.workersCompComplianceStatus = "NEEDS_REVIEW";
  } else if (previous) {
    copyWorkersCompComplianceAdminFields(base, previous);
    if (!base.workersCompComplianceStatus) {
      base.workersCompComplianceStatus = "NEEDS_REVIEW";
    }
  } else {
    base.workersCompComplianceStatus = "NEEDS_REVIEW";
  }

  base.reviewFlags = computeReviewFlags(base);
  if (teamRosterChanged(previous, base)) {
    base.reviewFlags = [...new Set<QuestionnaireReviewFlag>([...base.reviewFlags, "TEAM_ROSTER_UPDATED"])];
  }
  base.reviewStatus = base.reviewFlags.length > 0 ? "NEEDS_REVIEW" : "SUBMITTED";

  const hadSubmission = Boolean(previous?.submittedAt);
  base.submittedAt = previous?.submittedAt ?? now;

  if (previous?.reviewStatus === "REVIEWED" && hadSubmission) {
    base.reviewStatus = base.reviewFlags.length > 0 ? "NEEDS_REVIEW" : "SUBMITTED";
    base.reviewedAt = undefined;
    base.reviewedBy = undefined;
  } else if (previous?.reviewStatus === "NEEDS_REVIEW" && base.reviewFlags.length === 0) {
    base.reviewStatus = "SUBMITTED";
  }

  void updatedBy;
  return base;
}

export function inputFromQuestionnaire(
  questionnaire: ContractorBusinessQuestionnaire | undefined,
): ContractorQuestionnaireInput {
  if (!questionnaire) {
    return emptyQuestionnaireInput();
  }
  return {
    businessDisplayName: questionnaire.businessDisplayName,
    ownerLegalName: questionnaire.ownerLegalName,
    registrationStatus: questionnaire.registrationStatus,
    businessStructure: questionnaire.businessStructure ?? "",
    registeredLegalName: questionnaire.registeredLegalName ?? "",
    registrationState: questionnaire.registrationState ?? "",
    stateRegistrationNumber: questionnaire.stateRegistrationNumber ?? "",
    businessStreetAddress: questionnaire.businessStreetAddress,
    businessCity: questionnaire.businessCity,
    businessState: questionnaire.businessState,
    businessZip: questionnaire.businessZip,
    businessPhone: questionnaire.businessPhone,
    businessEmail: questionnaire.businessEmail,
    oregonServiceStatus: questionnaire.oregonServiceStatus,
    hasAdditionalWorkers: questionnaire.hasAdditionalWorkers,
    teamMembers:
      questionnaire.teamMembers && questionnaire.teamMembers.length > 0
        ? migrateTeamMembersFromLegacy(questionnaire.teamMembers, questionnaire.teamRelationship)
        : [emptyTeamMember()],
    workersCompStatus: questionnaire.workersCompStatus ?? "",
    workersCompNoReason: questionnaire.workersCompNoReason ?? "",
    workersCompNoReasonOther: questionnaire.workersCompNoReasonOther ?? "",
    workersCompCarrierName: questionnaire.workersCompCarrierName ?? "",
    workersCompPolicyNumber: questionnaire.workersCompPolicyNumber ?? "",
    workersCompExpirationDate: questionnaire.workersCompExpirationDate ?? "",
    helperPaymentArrangement: questionnaire.helperPaymentArrangement ?? "",
    generalLiabilityStatus: questionnaire.generalLiabilityStatus ?? "",
    insuranceProviderName: questionnaire.insuranceProviderName ?? "",
    insuranceExpirationDate: questionnaire.insuranceExpirationDate ?? "",
    insuranceOregonCoverage: questionnaire.insuranceOregonCoverage ?? "",
  };
}

export function emptyQuestionnaireInput(): ContractorQuestionnaireInput {
  return {
    businessDisplayName: "",
    ownerLegalName: "",
    registrationStatus: "",
    businessStructure: "",
    registeredLegalName: "",
    registrationState: "",
    stateRegistrationNumber: "",
    businessStreetAddress: "",
    businessCity: "",
    businessState: "",
    businessZip: "",
    businessPhone: "",
    businessEmail: "",
    oregonServiceStatus: "",
    hasAdditionalWorkers: null,
    teamMembers: [emptyTeamMember()],
    workersCompStatus: "",
    workersCompNoReason: "",
    workersCompNoReasonOther: "",
    workersCompCarrierName: "",
    workersCompPolicyNumber: "",
    workersCompExpirationDate: "",
    helperPaymentArrangement: "",
    generalLiabilityStatus: "",
    insuranceProviderName: "",
    insuranceExpirationDate: "",
    insuranceOregonCoverage: "",
  };
}

/** Prefer in-progress draft over last submitted questionnaire when loading the form. */
export function prefillQuestionnaireContactFromProfile(
  input: ContractorQuestionnaireInput,
  profile: { mobilePhone?: string; email?: string } | undefined,
): ContractorQuestionnaireInput {
  if (!profile) return input;
  let businessPhone = input.businessPhone;
  let businessEmail = input.businessEmail;
  if (!trim(input.businessPhone) && trim(profile.mobilePhone ?? "")) {
    businessPhone = trim(profile.mobilePhone!);
  }
  if (!trim(input.businessEmail) && trim(profile.email ?? "")) {
    businessEmail = trim(profile.email!);
  }
  if (businessPhone === input.businessPhone && businessEmail === input.businessEmail) {
    return input;
  }
  return { ...input, businessPhone, businessEmail };
}

export function inputFromSavedState(
  draft: ContractorQuestionnaireInput | undefined,
  questionnaire: ContractorBusinessQuestionnaire | undefined,
  profileContact?: { mobilePhone?: string; email?: string },
): ContractorQuestionnaireInput {
  if (draft) {
    return prefillQuestionnaireContactFromProfile(
      {
        ...emptyQuestionnaireInput(),
        ...draft,
        teamMembers:
          draft.teamMembers && draft.teamMembers.length > 0
            ? migrateTeamMembersFromLegacy(draft.teamMembers, undefined)
            : [emptyTeamMember()],
      },
      profileContact,
    );
  }
  return prefillQuestionnaireContactFromProfile(inputFromQuestionnaire(questionnaire), profileContact);
}

export function readQuestionnaireDraftFromRecord(value: unknown): ContractorQuestionnaireInput | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  const legacyTeamRelationship =
    record.teamRelationship === "W2" ||
    record.teamRelationship === "CONTRACTOR_1099" ||
    record.teamRelationship === "CO_OWNER" ||
    record.teamRelationship === "MIX" ||
    record.teamRelationship === "UNSURE"
      ? record.teamRelationship
      : undefined;
  const teamMembers = parseTeamMembersFromRecord(record.teamMembers, legacyTeamRelationship);
  return {
    ...emptyQuestionnaireInput(),
    businessDisplayName: typeof record.businessDisplayName === "string" ? record.businessDisplayName : "",
    ownerLegalName: typeof record.ownerLegalName === "string" ? record.ownerLegalName : "",
    registrationStatus:
      record.registrationStatus === "LLC_OR_CORP" || record.registrationStatus === "SOLE_PROPRIETOR"
        ? record.registrationStatus
        : "",
    businessStructure:
      record.businessStructure === "LLC_SINGLE" ||
      record.businessStructure === "LLC_MULTI" ||
      record.businessStructure === "CORPORATION"
        ? record.businessStructure
        : "",
    registeredLegalName: typeof record.registeredLegalName === "string" ? record.registeredLegalName : "",
    registrationState: typeof record.registrationState === "string" ? record.registrationState : "",
    stateRegistrationNumber: typeof record.stateRegistrationNumber === "string" ? record.stateRegistrationNumber : "",
    businessStreetAddress: typeof record.businessStreetAddress === "string" ? record.businessStreetAddress : "",
    businessCity: typeof record.businessCity === "string" ? record.businessCity : "",
    businessState: typeof record.businessState === "string" ? record.businessState : "",
    businessZip: typeof record.businessZip === "string" ? record.businessZip : "",
    businessPhone: typeof record.businessPhone === "string" ? record.businessPhone : "",
    businessEmail: typeof record.businessEmail === "string" ? record.businessEmail : "",
    oregonServiceStatus:
      record.oregonServiceStatus === "YES" ||
      record.oregonServiceStatus === "NO" ||
      record.oregonServiceStatus === "PLANNED"
        ? record.oregonServiceStatus
        : "",
    hasAdditionalWorkers:
      record.hasAdditionalWorkers === true ? true : record.hasAdditionalWorkers === false ? false : null,
    teamMembers,
    workersCompStatus:
      record.workersCompStatus === "YES" ||
      record.workersCompStatus === "NO" ||
      record.workersCompStatus === "UNSURE"
        ? record.workersCompStatus
        : "",
    workersCompNoReason: parseWorkersCompNoReason(record.workersCompNoReason),
    workersCompNoReasonOther:
      typeof record.workersCompNoReasonOther === "string" ? record.workersCompNoReasonOther : "",
    workersCompCarrierName: typeof record.workersCompCarrierName === "string" ? record.workersCompCarrierName : "",
    workersCompPolicyNumber: typeof record.workersCompPolicyNumber === "string" ? record.workersCompPolicyNumber : "",
    workersCompExpirationDate:
      typeof record.workersCompExpirationDate === "string" ? record.workersCompExpirationDate : "",
    helperPaymentArrangement:
      record.helperPaymentArrangement === "BUSINESS_PAYS" ||
      record.helperPaymentArrangement === "GOLDEN_HOUR_PAYS" ||
      record.helperPaymentArrangement === "VARIES" ||
      record.helperPaymentArrangement === "UNSURE"
        ? record.helperPaymentArrangement
        : "",
    generalLiabilityStatus:
      record.generalLiabilityStatus === "YES" ||
      record.generalLiabilityStatus === "NO" ||
      record.generalLiabilityStatus === "IN_PROGRESS"
        ? record.generalLiabilityStatus
        : "",
    insuranceProviderName: typeof record.insuranceProviderName === "string" ? record.insuranceProviderName : "",
    insuranceExpirationDate:
      typeof record.insuranceExpirationDate === "string" ? record.insuranceExpirationDate : "",
    insuranceOregonCoverage:
      record.insuranceOregonCoverage === "YES" ||
      record.insuranceOregonCoverage === "NO" ||
      record.insuranceOregonCoverage === "UNSURE"
        ? record.insuranceOregonCoverage
        : "",
  };
}

export function applyAdminQuestionnaireReview(
  questionnaire: ContractorBusinessQuestionnaire,
  status: "NEEDS_REVIEW" | "REVIEWED",
  adminEmail: string,
  now: string,
): ContractorBusinessQuestionnaire {
  if (status === "REVIEWED") {
    return {
      ...questionnaire,
      reviewStatus: "REVIEWED",
      reviewedAt: now,
      reviewedBy: adminEmail,
    };
  }
  return {
    ...questionnaire,
    reviewStatus: "NEEDS_REVIEW",
    reviewedAt: undefined,
    reviewedBy: undefined,
  };
}

export function applyAdminRegistrationVerification(
  questionnaire: ContractorBusinessQuestionnaire,
  status: BusinessRegistrationVerificationStatus,
): ContractorBusinessQuestionnaire {
  if (questionnaire.registrationStatus !== "LLC_OR_CORP") {
    throw new Error("Registration verification applies only to LLCs and corporations.");
  }
  if (!questionnaire.stateRegistrationNumber) {
    throw new Error("No state registration number on file.");
  }
  return {
    ...questionnaire,
    registrationVerificationStatus: status,
  };
}

export function applyAdminCoiVerification(
  questionnaire: ContractorBusinessQuestionnaire,
  status: CoiVerificationStatus,
  adminEmail: string,
  now: string,
): ContractorBusinessQuestionnaire {
  if (questionnaire.generalLiabilityStatus !== "YES") {
    throw new Error("COI verification applies when general liability insurance is reported.");
  }
  if (insurancePolicyIsExpired(questionnaire.insuranceExpirationDate, new Date(now))) {
    throw new Error("Cannot verify an expired policy.");
  }
  if (status === "VERIFIED") {
    const next = {
      ...questionnaire,
      coiVerificationStatus: status,
      coiVerifiedAt: now,
      coiVerifiedBy: adminEmail,
    };
    const reviewFlags = computeReviewFlags(next);
    return {
      ...next,
      reviewFlags,
      reviewStatus: reviewFlags.length > 0 ? "NEEDS_REVIEW" : questionnaire.reviewStatus,
    };
  }
  const next = {
    ...questionnaire,
    coiVerificationStatus: status,
    coiVerifiedAt: undefined,
    coiVerifiedBy: undefined,
  };
  const reviewFlags = computeReviewFlags(next);
  return {
    ...next,
    reviewFlags,
    reviewStatus: reviewFlags.length > 0 ? "NEEDS_REVIEW" : questionnaire.reviewStatus,
  };
}

export function readQuestionnaireFromRecord(
  value: unknown,
): ContractorBusinessQuestionnaire | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  if (typeof record.businessDisplayName !== "string") return undefined;
  if (typeof record.ownerLegalName !== "string") return undefined;
  if (record.registrationStatus !== "LLC_OR_CORP" && record.registrationStatus !== "SOLE_PROPRIETOR") {
    return undefined;
  }
  const reviewStatus = record.reviewStatus;
  if (
    reviewStatus !== "NOT_SUBMITTED" &&
    reviewStatus !== "SUBMITTED" &&
    reviewStatus !== "NEEDS_REVIEW" &&
    reviewStatus !== "REVIEWED"
  ) {
    return undefined;
  }
  const legacyTeamRelationship =
    record.teamRelationship === "W2" ||
    record.teamRelationship === "CONTRACTOR_1099" ||
    record.teamRelationship === "CO_OWNER" ||
    record.teamRelationship === "MIX" ||
    record.teamRelationship === "UNSURE"
      ? record.teamRelationship
      : undefined;
  const teamMembersRaw = parseTeamMembersFromRecord(record.teamMembers, legacyTeamRelationship);
  const teamMembers = teamMembersRaw.some((member) => member.firstName || member.lastName)
    ? teamMembersRaw
    : undefined;
  const reviewFlags = Array.isArray(record.reviewFlags)
    ? (record.reviewFlags.filter((item) => typeof item === "string") as QuestionnaireReviewFlag[])
    : [];

  return {
    businessDisplayName: record.businessDisplayName,
    ownerLegalName: record.ownerLegalName,
    registrationStatus: record.registrationStatus,
    businessStructure:
      record.businessStructure === "LLC_SINGLE" ||
      record.businessStructure === "LLC_MULTI" ||
      record.businessStructure === "CORPORATION"
        ? record.businessStructure
        : undefined,
    registeredLegalName: typeof record.registeredLegalName === "string" ? record.registeredLegalName : undefined,
    registrationState: typeof record.registrationState === "string" ? record.registrationState : undefined,
    stateRegistrationNumber:
      typeof record.stateRegistrationNumber === "string" ? record.stateRegistrationNumber : undefined,
    registrationVerificationStatus:
      record.registrationVerificationStatus === "NOT_VERIFIED" ||
      record.registrationVerificationStatus === "VERIFIED" ||
      record.registrationVerificationStatus === "UNABLE_TO_VERIFY"
        ? record.registrationVerificationStatus
        : record.registrationStatus === "LLC_OR_CORP"
          ? "NOT_VERIFIED"
          : undefined,
    businessStreetAddress: typeof record.businessStreetAddress === "string" ? record.businessStreetAddress : "",
    businessCity: typeof record.businessCity === "string" ? record.businessCity : "",
    businessState: typeof record.businessState === "string" ? record.businessState : "",
    businessZip: typeof record.businessZip === "string" ? record.businessZip : "",
    businessPhone: typeof record.businessPhone === "string" ? record.businessPhone : "",
    businessEmail: typeof record.businessEmail === "string" ? record.businessEmail : "",
    oregonServiceStatus:
      record.oregonServiceStatus === "YES" ||
      record.oregonServiceStatus === "NO" ||
      record.oregonServiceStatus === "PLANNED"
        ? record.oregonServiceStatus
        : "NO",
    hasAdditionalWorkers: record.hasAdditionalWorkers === true,
    teamMembers,
    teamRelationship:
      record.teamRelationship === "W2" ||
      record.teamRelationship === "CONTRACTOR_1099" ||
      record.teamRelationship === "CO_OWNER" ||
      record.teamRelationship === "MIX" ||
      record.teamRelationship === "UNSURE"
        ? record.teamRelationship
        : undefined,
    workersCompStatus:
      record.workersCompStatus === "YES" ||
      record.workersCompStatus === "NO" ||
      record.workersCompStatus === "UNSURE"
        ? record.workersCompStatus
        : undefined,
    workersCompNoReason: parseWorkersCompNoReasonOptional(record.workersCompNoReason),
    workersCompNoReasonOther:
      typeof record.workersCompNoReasonOther === "string" ? record.workersCompNoReasonOther : undefined,
    workersCompCarrierName:
      typeof record.workersCompCarrierName === "string" ? record.workersCompCarrierName : undefined,
    workersCompPolicyNumber:
      typeof record.workersCompPolicyNumber === "string" ? record.workersCompPolicyNumber : undefined,
    workersCompExpirationDate:
      typeof record.workersCompExpirationDate === "string" ? record.workersCompExpirationDate : undefined,
    workersCompComplianceStatus:
      record.workersCompComplianceStatus === "NEEDS_REVIEW" ||
      record.workersCompComplianceStatus === "COVERAGE_REQUIRED" ||
      record.workersCompComplianceStatus === "EXEMPTION_VERIFIED"
        ? record.workersCompComplianceStatus
        : undefined,
    workersCompComplianceCarrier:
      typeof record.workersCompComplianceCarrier === "string" ? record.workersCompComplianceCarrier : undefined,
    workersCompCompliancePolicyNumber:
      typeof record.workersCompCompliancePolicyNumber === "string"
        ? record.workersCompCompliancePolicyNumber
        : undefined,
    workersCompCompliancePolicyExpirationDate:
      typeof record.workersCompCompliancePolicyExpirationDate === "string"
        ? record.workersCompCompliancePolicyExpirationDate
        : undefined,
    workersCompComplianceCertificateReceived:
      record.workersCompComplianceCertificateReceived === true ? true : undefined,
    workersCompComplianceExemptionReason:
      typeof record.workersCompComplianceExemptionReason === "string"
        ? record.workersCompComplianceExemptionReason
        : undefined,
    workersCompComplianceInternalNotes:
      typeof record.workersCompComplianceInternalNotes === "string"
        ? record.workersCompComplianceInternalNotes
        : undefined,
    workersCompComplianceVerifiedAt:
      typeof record.workersCompComplianceVerifiedAt === "string" ? record.workersCompComplianceVerifiedAt : undefined,
    workersCompComplianceVerifiedBy:
      typeof record.workersCompComplianceVerifiedBy === "string" ? record.workersCompComplianceVerifiedBy : undefined,
    workersCompComplianceHistory: readWorkersCompComplianceHistoryFromRecord(record.workersCompComplianceHistory),
    helperPaymentArrangement:
      record.helperPaymentArrangement === "BUSINESS_PAYS" ||
      record.helperPaymentArrangement === "GOLDEN_HOUR_PAYS" ||
      record.helperPaymentArrangement === "VARIES" ||
      record.helperPaymentArrangement === "UNSURE"
        ? record.helperPaymentArrangement
        : undefined,
    generalLiabilityStatus:
      record.generalLiabilityStatus === "YES" ||
      record.generalLiabilityStatus === "NO" ||
      record.generalLiabilityStatus === "IN_PROGRESS"
        ? record.generalLiabilityStatus
        : undefined,
    insuranceProviderName:
      typeof record.insuranceProviderName === "string" ? record.insuranceProviderName : undefined,
    insuranceExpirationDate:
      typeof record.insuranceExpirationDate === "string" ? record.insuranceExpirationDate : undefined,
    insuranceOregonCoverage:
      record.insuranceOregonCoverage === "YES" ||
      record.insuranceOregonCoverage === "NO" ||
      record.insuranceOregonCoverage === "UNSURE"
        ? record.insuranceOregonCoverage
        : undefined,
    insuranceUpdatedAt: typeof record.insuranceUpdatedAt === "string" ? record.insuranceUpdatedAt : undefined,
    coiVerificationStatus:
      record.coiVerificationStatus === "NOT_RECEIVED" ||
      record.coiVerificationStatus === "NEEDS_REVIEW" ||
      record.coiVerificationStatus === "VERIFIED"
        ? record.coiVerificationStatus
        : undefined,
    coiVerifiedAt: typeof record.coiVerifiedAt === "string" ? record.coiVerifiedAt : undefined,
    coiVerifiedBy: typeof record.coiVerifiedBy === "string" ? record.coiVerifiedBy : undefined,
    submittedAt: typeof record.submittedAt === "string" ? record.submittedAt : undefined,
    updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : new Date(0).toISOString(),
    reviewStatus,
    reviewFlags,
    reviewedAt: typeof record.reviewedAt === "string" ? record.reviewedAt : undefined,
    reviewedBy: typeof record.reviewedBy === "string" ? record.reviewedBy : undefined,
  };
}

export function questionnaireEffectiveReviewStatus(
  questionnaire: ContractorBusinessQuestionnaire | undefined,
): QuestionnaireReviewStatus {
  if (!questionnaire?.submittedAt) return "NOT_SUBMITTED";
  return questionnaire.reviewStatus;
}

/** Whether conditional team / workers-comp fields should show in the UI for the given draft input. */
export function questionnaireUiVisibility(input: ContractorQuestionnaireInput): {
  showRegistrationDetails: boolean;
  showTeamSection: boolean;
  showWorkersCompSection: boolean;
  showWorkersCompReason: boolean;
  showWorkersCompPolicyDetails: boolean;
  showWorkersCompOther: boolean;
  showInsuranceDetails: boolean;
} {
  return {
    showRegistrationDetails: input.registrationStatus === "LLC_OR_CORP",
    showTeamSection: input.hasAdditionalWorkers === true,
    showWorkersCompSection: input.hasAdditionalWorkers === true || input.hasAdditionalWorkers === false,
    showWorkersCompReason: input.workersCompStatus === "NO",
    showWorkersCompPolicyDetails: input.workersCompStatus === "YES",
    showWorkersCompOther: input.workersCompNoReason === "OTHER",
    showInsuranceDetails: input.generalLiabilityStatus === "YES",
  };
}
