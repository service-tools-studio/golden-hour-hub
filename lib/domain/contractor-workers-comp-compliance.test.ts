import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildQuestionnaireFromInput } from "./contractor-questionnaire.ts";
import { applyAdminWorkersCompCompliance } from "./contractor-workers-comp-compliance.ts";

describe("workers' compensation compliance", () => {
  it("defaults new submissions to needs review", () => {
    const saved = buildQuestionnaireFromInput(
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
    assert.equal(saved.workersCompComplianceStatus, "NEEDS_REVIEW");
  });

  it("resets exemption verified to needs review when workers comp answers change", () => {
    const first = buildQuestionnaireFromInput(
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
    const exempt = applyAdminWorkersCompCompliance(
      first,
      { status: "EXEMPTION_VERIFIED", exemptionReason: "Sole proprietor working alone", internalNotes: "" },
      "admin@test.com",
      "2026-01-02T00:00:00.000Z",
    );
    assert.equal(exempt.workersCompComplianceStatus, "EXEMPTION_VERIFIED");
    const updated = buildQuestionnaireFromInput(
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
        hasAdditionalWorkers: true,
        teamMembers: [{ firstName: "Sam", lastName: "Lee", workingRelationship: "EMPLOYEE", workingRelationshipOther: "" }],
        workersCompStatus: "NO",
        workersCompNoReason: "OBTAINING_COVERAGE",
        workersCompNoReasonOther: "",
        workersCompCarrierName: "",
        workersCompPolicyNumber: "",
        workersCompExpirationDate: "",
        helperPaymentArrangement: "BUSINESS_PAYS",
        generalLiabilityStatus: "YES",
        insuranceProviderName: "NEXT Insurance",
        insuranceExpirationDate: "2027-06-01",
        insuranceOregonCoverage: "YES",
      },
      exempt,
      "2026-01-03T00:00:00.000Z",
      "c",
    );
    assert.equal(updated.workersCompComplianceStatus, "NEEDS_REVIEW");
    assert.ok(updated.workersCompComplianceHistory && updated.workersCompComplianceHistory.length >= 2);
  });
});
