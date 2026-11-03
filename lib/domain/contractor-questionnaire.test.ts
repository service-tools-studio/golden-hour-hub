import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyAdminCoiVerification,
  buildQuestionnaireFromInput,
  computeReviewFlags,
  effectiveCoiVerificationStatus,
  inputFromQuestionnaire,
  inputFromSavedState,
  insurancePolicyIsExpired,
  normalizeQuestionnaireInput,
  prepareQuestionnaireDraftInput,
  questionnaireUiVisibility,
  validateQuestionnaireInput,
} from "./contractor-questionnaire.ts";
import type { ContractorBusinessQuestionnaire, ContractorQuestionnaireInput } from "./contractor-questionnaire.ts";
import { saveContractorQuestionnaireOnHub } from "../hub/contractor-questionnaire-mutations.ts";
import { buildSeed } from "../mock/seed.ts";

const testSubmitContext = {
  attestation: { acknowledgmentAccepted: true as const, electronicSignature: "Jamie Lee" },
  cognitoSub: "sub-test",
  email: "cleaner@test.com",
};

function workersCompYesPolicyFields(): Pick<
  ContractorQuestionnaireInput,
  "workersCompCarrierName" | "workersCompPolicyNumber" | "workersCompExpirationDate"
> {
  return {
    workersCompCarrierName: "Oregon Mutual",
    workersCompPolicyNumber: "WC-10001",
    workersCompExpirationDate: "2027-12-01",
  };
}

function soloBase(): ContractorQuestionnaireInput {
  return {
    businessDisplayName: "Bright Cleaning",
    ownerLegalName: "Jamie Lee",
    registrationStatus: "SOLE_PROPRIETOR",
    businessStructure: "",
    registeredLegalName: "",
    registrationState: "",
    stateRegistrationNumber: "",
    businessStreetAddress: "123 Main St",
    businessCity: "Portland",
    businessState: "OR",
    businessZip: "97201",
    businessPhone: "5035550100",
    businessEmail: "bright@example.com",
    oregonServiceStatus: "YES",
    hasAdditionalWorkers: false,
    teamMembers: [{ firstName: "", lastName: "", workingRelationship: "", workingRelationshipOther: "" }],
    workersCompStatus: "NO",
    workersCompNoReason: "WORK_ALONE",
    workersCompNoReasonOther: "",
    workersCompCarrierName: "",
    workersCompPolicyNumber: "",
    workersCompExpirationDate: "",
    helperPaymentArrangement: "",
    generalLiabilityStatus: "YES",
    insuranceProviderName: "NEXT Insurance",
    insuranceExpirationDate: "2027-06-01",
    insuranceOregonCoverage: "YES",
  };
}

describe("contractor questionnaire domain", () => {
  it("shows registration follow-ups only for LLC or corporation", () => {
    const sole = questionnaireUiVisibility({ ...soloBase(), registrationStatus: "SOLE_PROPRIETOR" });
    assert.equal(sole.showRegistrationDetails, false);
    const llc = questionnaireUiVisibility({ ...soloBase(), registrationStatus: "LLC_OR_CORP" });
    assert.equal(llc.showRegistrationDetails, true);
  });

  it("hides team questions when working alone", () => {
    const alone = questionnaireUiVisibility({ ...soloBase(), hasAdditionalWorkers: false });
    assert.equal(alone.showTeamSection, false);
    const team = questionnaireUiVisibility({ ...soloBase(), hasAdditionalWorkers: true });
    assert.equal(team.showTeamSection, true);
  });

  it("requires LLC fields when registered as LLC or corporation", () => {
    const input = { ...soloBase(), registrationStatus: "LLC_OR_CORP" as const };
    const errors = validateQuestionnaireInput(normalizeQuestionnaireInput(input));
    assert.ok(errors.businessStructure);
    assert.ok(errors.registeredLegalName);
    assert.ok(errors.registrationState);
  });

  it("clears LLC and team fields when answers change on normalize", () => {
    const input: ContractorQuestionnaireInput = {
      ...soloBase(),
      registrationStatus: "LLC_OR_CORP",
      businessStructure: "LLC_SINGLE",
      registeredLegalName: "Bright LLC",
      registrationState: "OR",
      stateRegistrationNumber: "UBI-123456",
      hasAdditionalWorkers: true,
      teamMembers: [{ firstName: "Alex", lastName: "Kim", workingRelationship: "EMPLOYEE", workingRelationshipOther: "" }],
      workersCompStatus: "NO",
      workersCompNoReason: "OBTAINING_COVERAGE",
      helperPaymentArrangement: "BUSINESS_PAYS",
    };
    const sole = normalizeQuestionnaireInput({
      ...input,
      registrationStatus: "SOLE_PROPRIETOR",
      hasAdditionalWorkers: false,
    });
    assert.equal(sole.businessStructure, "");
    assert.equal(sole.teamMembers.length, 0);
    assert.equal(sole.workersCompStatus, "NO");
  });

  it("flags W-2 employees without workers comp for review", () => {
    const input = {
      ...soloBase(),
      hasAdditionalWorkers: true,
      teamMembers: [
        {
          firstName: "Alex",
          lastName: "Kim",
          workingRelationship: "EMPLOYEE" as const,
          workingRelationshipOther: "",
        },
      ],
      workersCompStatus: "NO" as const,
      workersCompNoReason: "OBTAINING_COVERAGE" as const,
      helperPaymentArrangement: "BUSINESS_PAYS" as const,
    };
    const saved = buildQuestionnaireFromInput(input, undefined, "2026-01-01T00:00:00.000Z", "cleaner@test.com");
    assert.ok(saved.reviewFlags.includes("EMPLOYEES_NO_WORKERS_COMP"));
    assert.equal(saved.reviewStatus, "NEEDS_REVIEW");
  });

  it("resets reviewed status when cleaner updates responses", () => {
    const previous: ContractorBusinessQuestionnaire = {
      ...buildQuestionnaireFromInput(soloBase(), undefined, "2026-01-01T00:00:00.000Z", "admin"),
      reviewStatus: "REVIEWED",
      reviewedAt: "2026-01-02T00:00:00.000Z",
      reviewedBy: "admin@test.com",
    };
    const next = buildQuestionnaireFromInput(
      { ...soloBase(), businessDisplayName: "Updated Name" },
      previous,
      "2026-01-03T00:00:00.000Z",
      "cleaner@test.com",
    );
    assert.equal(next.reviewStatus, "SUBMITTED");
    assert.equal(next.reviewedAt, undefined);
  });

  it("round-trips saved questionnaire into form defaults without preselecting empty answers", () => {
    const draft = inputFromQuestionnaire(undefined);
    assert.equal(draft.registrationStatus, "");
    assert.equal(draft.hasAdditionalWorkers, null);
    const saved = buildQuestionnaireFromInput(soloBase(), undefined, "2026-01-01T00:00:00.000Z", "c");
    const loaded = inputFromQuestionnaire(saved);
    assert.equal(loaded.businessDisplayName, "Bright Cleaning");
    assert.equal(loaded.hasAdditionalWorkers, false);
  });

  it("keeps team member working relationship on draft prepare before names are entered", () => {
    const prepared = prepareQuestionnaireDraftInput({
      ...soloBase(),
      hasAdditionalWorkers: true,
      teamMembers: [{ firstName: "", lastName: "", workingRelationship: "EMPLOYEE", workingRelationshipOther: "" }],
      workersCompStatus: "",
      helperPaymentArrangement: "",
    });
    assert.equal(prepared.teamMembers.length, 1);
    assert.equal(prepared.teamMembers[0]?.workingRelationship, "EMPLOYEE");
  });

  it("keeps empty team member rows on draft prepare when adding another person", () => {
    const prepared = prepareQuestionnaireDraftInput({
      ...soloBase(),
      hasAdditionalWorkers: true,
      teamMembers: [
        { firstName: "Sam", lastName: "Lee", workingRelationship: "EMPLOYEE", workingRelationshipOther: "" },
        { firstName: "", lastName: "", workingRelationship: "", workingRelationshipOther: "" },
      ],
      workersCompStatus: "",
      helperPaymentArrangement: "",
    });
    assert.equal(prepared.teamMembers.length, 2);
  });

  it("trims questionnaire fields on submit normalize only", () => {
    const draft = prepareQuestionnaireDraftInput({
      ...soloBase(),
      businessDisplayName: "  Bright Co  ",
      businessCity: " Portland ",
    });
    assert.equal(draft.businessDisplayName, "  Bright Co  ");
    assert.equal(draft.businessCity, " Portland ");
    const submitted = normalizeQuestionnaireInput(draft);
    assert.equal(submitted.businessDisplayName, "Bright Co");
    assert.equal(submitted.businessCity, "Portland");
  });

  it("requires workers comp policy details when coverage is yes", () => {
    const input: ContractorQuestionnaireInput = {
      ...soloBase(),
      workersCompStatus: "YES",
      workersCompCarrierName: "",
      workersCompPolicyNumber: "",
      workersCompExpirationDate: "",
    };
    const errors = validateQuestionnaireInput(normalizeQuestionnaireInput(input));
    assert.ok(errors.workersCompCarrierName);
    assert.ok(errors.workersCompPolicyNumber);
    assert.ok(errors.workersCompExpirationDate);
  });

  it("prefills business phone and email from cleaner profile when questionnaire fields are empty", () => {
    const loaded = inputFromSavedState(undefined, undefined, {
      mobilePhone: "5035550101",
      email: "claudia@example.com",
    });
    assert.equal(loaded.businessPhone, "5035550101");
    assert.equal(loaded.businessEmail, "claudia@example.com");
    const withSavedPhone = inputFromSavedState(
      { ...soloBase(), businessPhone: "", businessEmail: "" },
      undefined,
      { mobilePhone: "5035550101", email: "claudia@example.com" },
    );
    assert.equal(withSavedPhone.businessPhone, "5035550101");
    assert.equal(withSavedPhone.businessEmail, "claudia@example.com");
    const keepsQuestionnaire = inputFromSavedState(undefined, buildQuestionnaireFromInput(soloBase(), undefined, "2026-01-01T00:00:00.000Z", "c"), {
      mobilePhone: "9999999999",
      email: "other@example.com",
    });
    assert.equal(keepsQuestionnaire.businessPhone, "5035550100");
    assert.equal(keepsQuestionnaire.businessEmail, "bright@example.com");
  });

  it("persists on cleaner profile without duplicating records", () => {
    const hub = buildSeed("2026-01-06");
    const cleanerId = hub.cleaners[0]!.cleanerId;
    const beforeCount = hub.cleaners.length;
    const { hub: next, result, submitted } = saveContractorQuestionnaireOnHub(
      hub,
      cleanerId,
      soloBase(),
      "cleaner@test.com",
      "2026-01-01T00:00:00.000Z",
      "submit",
      testSubmitContext,
    );
    assert.equal(result.ok, true);
    assert.equal(submitted, true);
    assert.equal(next.cleaners.length, beforeCount);
    assert.equal(next.cleaners[0]?.businessQuestionnaire?.businessDisplayName, "Bright Cleaning");
    assert.equal(next.cleaners[0]?.businessQuestionnaireDraft, undefined);
  });

  it("saves partial progress as draft without submitting", () => {
    const hub = buildSeed("2026-01-06");
    const cleanerId = hub.cleaners[0]!.cleanerId;
    const partial = { ...soloBase(), businessDisplayName: "Partial Co", ownerLegalName: "" };
    const { hub: next, submitted } = saveContractorQuestionnaireOnHub(
      hub,
      cleanerId,
      partial,
      "cleaner@test.com",
      "2026-01-01T00:00:00.000Z",
      "draft",
    );
    assert.equal(submitted, false);
    assert.equal(next.cleaners[0]?.businessQuestionnaire?.submittedAt, undefined);
    assert.equal(next.cleaners[0]?.businessQuestionnaireDraft?.businessDisplayName, "Partial Co");
  });

  it("does not submit on draft save even when answers are complete", () => {
    const hub = buildSeed("2026-01-06");
    const cleanerId = hub.cleaners[0]!.cleanerId;
    const { hub: next, submitted } = saveContractorQuestionnaireOnHub(
      hub,
      cleanerId,
      soloBase(),
      "cleaner@test.com",
      "2026-01-01T00:00:00.000Z",
      "draft",
    );
    assert.equal(submitted, false);
    assert.equal(next.cleaners[0]?.businessQuestionnaire?.submittedAt, undefined);
    assert.equal(next.cleaners[0]?.businessQuestionnaireDraft?.businessDisplayName, "Bright Cleaning");
  });

  it("computeReviewFlags includes payment and classification flags", () => {
    const questionnaire = buildQuestionnaireFromInput(
      {
        ...soloBase(),
        hasAdditionalWorkers: true,
        teamMembers: [{ firstName: "A", lastName: "B", workingRelationship: "UNSURE", workingRelationshipOther: "" }],
        workersCompStatus: "YES",
        helperPaymentArrangement: "GOLDEN_HOUR_PAYS",
        ...workersCompYesPolicyFields(),
      },
      undefined,
      "2026-01-01T00:00:00.000Z",
      "c",
    );
    const flags = computeReviewFlags(questionnaire);
    assert.ok(flags.includes("UNSURE_TEAM_CLASSIFICATION"));
    assert.ok(flags.includes("GOLDEN_HOUR_PAYS_HELPERS"));
  });

  it("defaults LLC registration verification to not verified", () => {
    const input = {
      ...soloBase(),
      registrationStatus: "LLC_OR_CORP" as const,
      businessStructure: "LLC_SINGLE" as const,
      registeredLegalName: "Bright LLC",
      registrationState: "OR",
      stateRegistrationNumber: "1234567",
    };
    const saved = buildQuestionnaireFromInput(input, undefined, "2026-01-01T00:00:00.000Z", "c");
    assert.equal(saved.registrationVerificationStatus, "NOT_VERIFIED");
  });

  it("resets registration verification when identity fields change", () => {
    const llc = {
      ...soloBase(),
      registrationStatus: "LLC_OR_CORP" as const,
      businessStructure: "LLC_SINGLE" as const,
      registeredLegalName: "Bright LLC",
      registrationState: "OR",
      stateRegistrationNumber: "1234567",
    };
    const previous = {
      ...buildQuestionnaireFromInput(llc, undefined, "2026-01-01T00:00:00.000Z", "c"),
      registrationVerificationStatus: "VERIFIED" as const,
    };
    const next = buildQuestionnaireFromInput(
      { ...llc, stateRegistrationNumber: "7654321" },
      previous,
      "2026-01-02T00:00:00.000Z",
      "c",
    );
    assert.equal(next.registrationVerificationStatus, "NOT_VERIFIED");
  });

  it("preserves registration verification when identity fields are unchanged", () => {
    const llc = {
      ...soloBase(),
      registrationStatus: "LLC_OR_CORP" as const,
      businessStructure: "LLC_SINGLE" as const,
      registeredLegalName: "Bright LLC",
      registrationState: "OR",
      stateRegistrationNumber: "1234567",
    };
    const previous = {
      ...buildQuestionnaireFromInput(llc, undefined, "2026-01-01T00:00:00.000Z", "c"),
      registrationVerificationStatus: "VERIFIED" as const,
    };
    const next = buildQuestionnaireFromInput(
      { ...llc, businessDisplayName: "New display name only" },
      previous,
      "2026-01-02T00:00:00.000Z",
      "c",
    );
    assert.equal(next.registrationVerificationStatus, "VERIFIED");
  });

  it("requires insurance follow-ups when general liability is yes", () => {
    const input: ContractorQuestionnaireInput = {
      ...soloBase(),
      generalLiabilityStatus: "YES",
      insuranceProviderName: "",
      insuranceExpirationDate: "",
      insuranceOregonCoverage: "",
    };
    const errors = validateQuestionnaireInput(normalizeQuestionnaireInput(input));
    assert.ok(errors.insuranceProviderName);
    assert.ok(errors.insuranceExpirationDate);
    assert.ok(errors.insuranceOregonCoverage);
  });

  it("clears insurance detail fields when liability is not yes", () => {
    const normalized = normalizeQuestionnaireInput({
      ...soloBase(),
      generalLiabilityStatus: "YES",
      insuranceProviderName: "NEXT",
      insuranceExpirationDate: "2027-01-01",
      insuranceOregonCoverage: "YES",
    });
    const cleared = normalizeQuestionnaireInput({ ...normalized, generalLiabilityStatus: "NO" });
    assert.equal(cleared.insuranceProviderName, "");
    assert.equal(cleared.insuranceExpirationDate, "");
    assert.equal(cleared.insuranceOregonCoverage, "");
  });

  it("flags missing, in-progress, and oregon insurance issues", () => {
    const noInsurance = buildQuestionnaireFromInput(
      { ...soloBase(), generalLiabilityStatus: "NO", insuranceProviderName: "", insuranceExpirationDate: "", insuranceOregonCoverage: "" },
      undefined,
      "2026-01-01T00:00:00.000Z",
      "c",
    );
    assert.ok(noInsurance.reviewFlags.includes("NO_GENERAL_LIABILITY_INSURANCE"));

    const inProgress = buildQuestionnaireFromInput(
      {
        ...soloBase(),
        generalLiabilityStatus: "IN_PROGRESS",
        insuranceProviderName: "",
        insuranceExpirationDate: "",
        insuranceOregonCoverage: "",
      },
      undefined,
      "2026-01-01T00:00:00.000Z",
      "c",
    );
    assert.ok(inProgress.reviewFlags.includes("OBTAINING_GENERAL_LIABILITY_INSURANCE"));

    const insured = buildQuestionnaireFromInput(
      {
        ...soloBase(),
        generalLiabilityStatus: "YES",
        insuranceProviderName: "NEXT",
        insuranceExpirationDate: "2027-06-01",
        insuranceOregonCoverage: "UNSURE",
      },
      undefined,
      "2026-01-01T00:00:00.000Z",
      "c",
    );
    assert.ok(insured.reviewFlags.includes("UNSURE_INSURANCE_OREGON_COVERAGE"));
  });

  it("detects expired policies and effective verification status", () => {
    const questionnaire = buildQuestionnaireFromInput(
      {
        ...soloBase(),
        generalLiabilityStatus: "YES",
        insuranceProviderName: "NEXT",
        insuranceExpirationDate: "2020-01-01",
        insuranceOregonCoverage: "YES",
      },
      undefined,
      "2026-01-01T00:00:00.000Z",
      "c",
    );
    assert.equal(insurancePolicyIsExpired(questionnaire.insuranceExpirationDate, new Date("2026-01-01T00:00:00.000Z")), true);
    assert.ok(questionnaire.reviewFlags.includes("INSURANCE_EXPIRED"));

    const verifiedExpired = {
      ...questionnaire,
      coiVerificationStatus: "VERIFIED" as const,
      coiVerifiedAt: "2025-01-01T00:00:00.000Z",
      coiVerifiedBy: "admin@test.com",
    };
    assert.equal(
      effectiveCoiVerificationStatus(verifiedExpired, new Date("2026-01-01T00:00:00.000Z")),
      "EXPIRED",
    );
  });

  it("resets COI verification to needs review when insured fields change after verified", () => {
    const insuredInput = {
      ...soloBase(),
      generalLiabilityStatus: "YES" as const,
      insuranceProviderName: "NEXT",
      insuranceExpirationDate: "2027-06-01",
      insuranceOregonCoverage: "YES" as const,
    };
    const previous = {
      ...buildQuestionnaireFromInput(insuredInput, undefined, "2026-01-01T00:00:00.000Z", "c"),
      coiVerificationStatus: "VERIFIED" as const,
      coiVerifiedAt: "2026-01-02T00:00:00.000Z",
      coiVerifiedBy: "admin@test.com",
    };
    const next = buildQuestionnaireFromInput(
      { ...insuredInput, insuranceProviderName: "Hiscox" },
      previous,
      "2026-01-03T00:00:00.000Z",
      "c",
    );
    assert.equal(next.coiVerificationStatus, "NEEDS_REVIEW");
    assert.equal(next.coiVerifiedAt, undefined);
    assert.ok(next.reviewFlags.includes("COI_NEEDS_REVIEW"));
  });

  it("applyAdminCoiVerification is admin-only and blocks expired policies", () => {
    const insured = buildQuestionnaireFromInput(
      {
        ...soloBase(),
        generalLiabilityStatus: "YES",
        insuranceProviderName: "NEXT",
        insuranceExpirationDate: "2020-01-01",
        insuranceOregonCoverage: "YES",
      },
      undefined,
      "2026-01-01T00:00:00.000Z",
      "c",
    );
    assert.throws(() =>
      applyAdminCoiVerification(insured, "VERIFIED", "admin@test.com", "2026-01-01T00:00:00.000Z"),
    );
    const verified = applyAdminCoiVerification(
      { ...insured, insuranceExpirationDate: "2027-01-01" },
      "VERIFIED",
      "admin@test.com",
      "2026-01-01T00:00:00.000Z",
    );
    assert.equal(verified.coiVerificationStatus, "VERIFIED");
    assert.equal(verified.coiVerifiedBy, "admin@test.com");
  });

  it("legacy questionnaires without insurance fields still load into the form", () => {
    const legacy = buildQuestionnaireFromInput(soloBase(), undefined, "2026-01-01T00:00:00.000Z", "c");
    const withoutInsurance = { ...legacy, generalLiabilityStatus: undefined };
    const loaded = inputFromQuestionnaire(withoutInsurance);
    assert.equal(loaded.generalLiabilityStatus, "");
  });

  it("flags other team member relationships for review", () => {
    const saved = buildQuestionnaireFromInput(
      {
        ...soloBase(),
        hasAdditionalWorkers: true,
        teamMembers: [
          { firstName: "Sam", lastName: "Lee", workingRelationship: "OTHER", workingRelationshipOther: "My spouse helps informally" },
        ],
        workersCompStatus: "YES",
        helperPaymentArrangement: "BUSINESS_PAYS",
        ...workersCompYesPolicyFields(),
      },
      undefined,
      "2026-01-01T00:00:00.000Z",
      "c",
    );
    assert.ok(saved.reviewFlags.includes("TEAM_MEMBER_RELATIONSHIP_OTHER"));
  });

  it("flags Golden Hour team roster updates after a prior submission", () => {
    const first = buildQuestionnaireFromInput(
      {
        ...soloBase(),
        hasAdditionalWorkers: true,
        teamMembers: [
          { firstName: "Sam", lastName: "Lee", workingRelationship: "EMPLOYEE", workingRelationshipOther: "" },
        ],
        workersCompStatus: "YES",
        helperPaymentArrangement: "BUSINESS_PAYS",
        ...workersCompYesPolicyFields(),
      },
      undefined,
      "2026-01-01T00:00:00.000Z",
      "c",
    );
    const reviewed = { ...first, reviewStatus: "REVIEWED" as const, reviewedAt: "2026-01-02T00:00:00.000Z", reviewedBy: "admin" };
    const updated = buildQuestionnaireFromInput(
      {
        ...soloBase(),
        hasAdditionalWorkers: true,
        teamMembers: [
          { firstName: "Sam", lastName: "Lee", workingRelationship: "EMPLOYEE", workingRelationshipOther: "" },
          { firstName: "Jo", lastName: "Park", workingRelationship: "CONTRACTOR_1099", workingRelationshipOther: "" },
        ],
        workersCompStatus: "YES",
        helperPaymentArrangement: "BUSINESS_PAYS",
        ...workersCompYesPolicyFields(),
      },
      reviewed,
      "2026-01-03T00:00:00.000Z",
      "c",
    );
    assert.ok(updated.reviewFlags.includes("TEAM_ROSTER_UPDATED"));
    assert.equal(updated.reviewStatus, "NEEDS_REVIEW");
    assert.equal(updated.reviewedAt, undefined);
  });

  it("migrates legacy team relationship onto members when loading the form", () => {
    const legacy = buildQuestionnaireFromInput(
      {
        ...soloBase(),
        hasAdditionalWorkers: true,
        teamMembers: [{ firstName: "Alex", lastName: "Kim", workingRelationship: "EMPLOYEE", workingRelationshipOther: "" }],
        workersCompStatus: "YES",
        helperPaymentArrangement: "BUSINESS_PAYS",
        ...workersCompYesPolicyFields(),
      },
      undefined,
      "2026-01-01T00:00:00.000Z",
      "c",
    );
    const withLegacyOnly = {
      ...legacy,
      teamMembers: [{ firstName: "Alex", lastName: "Kim" }],
      teamRelationship: "W2" as const,
    };
    const loaded = inputFromQuestionnaire(withLegacyOnly);
    assert.equal(loaded.teamMembers[0]?.workingRelationship, "EMPLOYEE");
  });

  it("shows insurance detail fields only when liability is yes", () => {
    assert.equal(questionnaireUiVisibility({ ...soloBase(), generalLiabilityStatus: "YES" }).showInsuranceDetails, true);
    assert.equal(questionnaireUiVisibility({ ...soloBase(), generalLiabilityStatus: "NO" }).showInsuranceDetails, false);
  });
});
