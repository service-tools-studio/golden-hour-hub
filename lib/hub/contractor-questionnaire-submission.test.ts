import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { saveContractorQuestionnaireOnHub } from "./contractor-questionnaire-mutations.ts";
import { buildSeed } from "../mock/seed.ts";

function soloBase() {
  return {
    businessDisplayName: "Bright Cleaning",
    ownerLegalName: "Jamie Lee",
    registrationStatus: "SOLE_PROPRIETOR" as const,
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
    oregonServiceStatus: "YES" as const,
    hasAdditionalWorkers: false,
    teamMembers: [{ firstName: "", lastName: "", workingRelationship: "", workingRelationshipOther: "" }],
    workersCompStatus: "NO",
    workersCompNoReason: "WORK_ALONE",
    workersCompNoReasonOther: "",
    workersCompCarrierName: "",
    workersCompPolicyNumber: "",
    workersCompExpirationDate: "",
    helperPaymentArrangement: "",
    generalLiabilityStatus: "YES" as const,
    insuranceProviderName: "NEXT Insurance",
    insuranceExpirationDate: "2027-06-01",
    insuranceOregonCoverage: "YES" as const,
  };
}

const submitContext = {
  attestation: { acknowledgmentAccepted: true, electronicSignature: "Jamie Lee" },
  cognitoSub: "sub-test",
  email: "cleaner@test.com",
};

describe("contractor questionnaire submission history", () => {
  it("requires attestation context on submit", () => {
    const hub = buildSeed("2026-01-06");
    const cleanerId = hub.cleaners[0]!.cleanerId;
    const result = saveContractorQuestionnaireOnHub(
      hub,
      cleanerId,
      soloBase(),
      "cleaner@test.com",
      "2026-01-01T00:00:00.000Z",
      "submit",
    );
    assert.equal(result.submitted, false);
    assert.equal(result.result.ok, false);
  });

  it("appends immutable submission records on each submit", () => {
    const hub = buildSeed("2026-01-06");
    const cleanerId = hub.cleaners[0]!.cleanerId;
    const first = saveContractorQuestionnaireOnHub(
      hub,
      cleanerId,
      soloBase(),
      "cleaner@test.com",
      "2026-01-01T00:00:00.000Z",
      "submit",
      submitContext,
    );
    assert.equal(first.submitted, true);
    assert.equal(first.hub.contractorQuestionnaireSubmissions.length, 1);
    assert.equal(first.hub.contractorQuestionnaireSubmissions[0]?.submissionVersion, 1);

    const second = saveContractorQuestionnaireOnHub(
      first.hub,
      cleanerId,
      { ...soloBase(), businessDisplayName: "Updated Name" },
      "cleaner@test.com",
      "2026-01-02T00:00:00.000Z",
      "submit",
      { ...submitContext, attestation: { ...submitContext.attestation, electronicSignature: "Jamie Lee" } },
    );
    assert.equal(second.hub.contractorQuestionnaireSubmissions.length, 2);
    assert.equal(second.hub.contractorQuestionnaireSubmissions[0]?.submissionVersion, 1);
    assert.equal(second.hub.contractorQuestionnaireSubmissions[1]?.submissionVersion, 2);
    assert.equal(
      second.hub.contractorQuestionnaireSubmissions[0]?.questionnaireSnapshot.businessDisplayName,
      "Bright Cleaning",
    );
    assert.equal(
      second.hub.cleaners.find((item) => item.cleanerId === cleanerId)?.businessQuestionnaire?.businessDisplayName,
      "Updated Name",
    );
  });
});
