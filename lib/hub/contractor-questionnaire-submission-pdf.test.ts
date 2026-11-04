import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildQuestionnaireFromInput } from "../domain/contractor-questionnaire.ts";
import { createQuestionnaireSubmissionRecord } from "../domain/contractor-questionnaire-submission.ts";
import { buildSeed } from "../mock/seed.ts";
import { buildQuestionnaireSubmissionPdf } from "./contractor-questionnaire-submission-pdf.ts";

describe("contractor questionnaire submission PDF", () => {
  it("generates a non-empty PDF from a historical submission", async () => {
    const hub = buildSeed("2026-01-06");
    const cleaner = hub.cleaners[0]!;
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
      "bright@example.com",
    );
    const submission = createQuestionnaireSubmissionRecord({
      cleanerId: cleaner.cleanerId,
      submissionVersion: 1,
      submittedAt: "2026-01-01T00:00:00.000Z",
      submittedByCognitoSub: "sub-1",
      submittedByEmail: "bright@example.com",
      electronicSignature: "Jamie Lee",
      questionnaireSnapshot: questionnaire,
      submissionId: "pdf-test-1",
    });
    const bytes = await buildQuestionnaireSubmissionPdf({ cleaner, submission });
    assert.ok(bytes.byteLength > 500);
    const header = String.fromCharCode(...bytes.slice(0, 5));
    assert.equal(header, "%PDF-");
  });
});
