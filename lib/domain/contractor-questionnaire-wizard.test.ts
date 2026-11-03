import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  QUESTIONNAIRE_WIZARD_STEP_TITLES,
  validateQuestionnaireWizardStep,
  questionnaireInputMatchesSubmitted,
} from "./contractor-questionnaire-wizard.ts";
import { buildQuestionnaireFromInput } from "./contractor-questionnaire.ts";
import type { ContractorQuestionnaireInput } from "./contractor-questionnaire.ts";

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

describe("contractor questionnaire wizard", () => {
  it("defines four step titles", () => {
    assert.equal(QUESTIONNAIRE_WIZARD_STEP_TITLES.length, 4);
    assert.equal(QUESTIONNAIRE_WIZARD_STEP_TITLES[0], "Your Business");
    assert.equal(QUESTIONNAIRE_WIZARD_STEP_TITLES[3], "Review & Sign");
  });

  it("validates step 1 business fields only", () => {
    const input = { ...soloBase(), businessDisplayName: "", ownerLegalName: "Jamie Lee" };
    const step1 = validateQuestionnaireWizardStep(1, input);
    assert.ok(step1.businessDisplayName);
    assert.equal(step1.ownerLegalName, undefined);
    assert.equal(step1.generalLiabilityStatus, undefined);
  });

  it("validates step 2 team fields only", () => {
    const input = {
      ...soloBase(),
      hasAdditionalWorkers: null,
      generalLiabilityStatus: "" as const,
    };
    const step2 = validateQuestionnaireWizardStep(2, input);
    assert.ok(step2.hasAdditionalWorkers);
    assert.equal(step2.generalLiabilityStatus, undefined);
  });

  it("validates step 3 insurance and workers comp only", () => {
    const input = { ...soloBase(), generalLiabilityStatus: "" as const, workersCompStatus: "" as const };
    const step3 = validateQuestionnaireWizardStep(3, input);
    assert.ok(step3.generalLiabilityStatus);
    assert.ok(step3.workersCompStatus);
    assert.equal(step3.businessDisplayName, undefined);
  });

  it("detects unchanged answers vs last submission", () => {
    const input = soloBase();
    const submitted = buildQuestionnaireFromInput(input, undefined, "2026-01-01T00:00:00.000Z", "test@example.com");
    assert.equal(questionnaireInputMatchesSubmitted(input, submitted), true);
    assert.equal(
      questionnaireInputMatchesSubmitted({ ...input, businessDisplayName: "New Name" }, submitted),
      false,
    );
  });
});
