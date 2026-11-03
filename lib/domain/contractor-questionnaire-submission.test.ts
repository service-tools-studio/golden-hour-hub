import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildQuestionnaireFromInput } from "./contractor-questionnaire.ts";
import {
  QUESTIONNAIRE_ACKNOWLEDGMENT_TEXT,
  createQuestionnaireSubmissionRecord,
  validateQuestionnaireSubmitAttestation,
} from "./contractor-questionnaire-submission.ts";

describe("contractor questionnaire submission attestation", () => {
  it("requires acknowledgment and signature", () => {
    assert.equal(
      validateQuestionnaireSubmitAttestation({ acknowledgmentAccepted: false, electronicSignature: "" }).ok,
      false,
    );
    assert.equal(
      validateQuestionnaireSubmitAttestation({ acknowledgmentAccepted: true, electronicSignature: "Jamie Lee" }).ok,
      true,
    );
  });

  it("stores acknowledgment text version on each record", () => {
    const questionnaire = buildQuestionnaireFromInput(
      {
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
      },
      undefined,
      "2026-01-01T00:00:00.000Z",
      "c",
    );
    const record = createQuestionnaireSubmissionRecord({
      cleanerId: "claudia",
      submissionVersion: 1,
      submittedAt: "2026-01-01T00:00:00.000Z",
      submittedByCognitoSub: "sub-123",
      submittedByEmail: "claudia@example.com",
      electronicSignature: "Jamie Lee",
      questionnaireSnapshot: questionnaire,
      submissionId: "sub-fixed",
    });
    assert.equal(record.acknowledgmentText, QUESTIONNAIRE_ACKNOWLEDGMENT_TEXT);
    assert.equal(record.electronicSignature, "Jamie Lee");
    assert.equal(record.submissionVersion, 1);
  });
});
