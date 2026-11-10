import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildQuestionnaireFromInput } from "../domain/contractor-questionnaire.ts";
import { createQuestionnaireSubmissionRecord } from "../domain/contractor-questionnaire-submission.ts";
import { buildSeed } from "../mock/seed.ts";
import { hubToItems, itemsToHub } from "./items.ts";

describe("DynamoDB item mapping", () => {
  it("stores helper authorization as maxHelperCount and round-trips the schedule", () => {
    const today = "2026-09-27";
    const data = buildSeed(today);
    const items = hubToItems(data);
    const claudia = items.find((item) => item.entity === "cleaner" && item.cleanerId === "claudia");
    assert.equal(claudia?.pk, "CLEANER#claudia");
    assert.equal(claudia?.maxHelperCount, 2);
    assert.equal(claudia?.typicalHelperCount, 1);
    assert.equal("helpersApproved" in (claudia ?? {}), false);
    assert.equal("typicalCrewSize" in (claudia ?? {}), false);

    const occur = items.find((item) => item.entity === "occur");
    assert.ok(occur);
    assert.match(String(occur?.sk), /^OCCUR#/);

    const restored = itemsToHub(items, today);
    assert.equal(restored.cleaners.find((cleaner) => cleaner.cleanerId === "claudia")?.maxHelperCount, 2);
    assert.equal(restored.cleaners.find((cleaner) => cleaner.cleanerId === "claudia")?.homeMarketId, "portland");
    assert.ok(restored.properties.every((property) => property.marketId === "portland"));
    assert.ok(restored.jobs.every((job) => job.snapshot.marketId === "portland"));
    assert.ok(restored.jobs.every((job) => job.snapshot.timeZone === "America/Los_Angeles"));
    assert.equal(restored.jobs.length, data.jobs.length);
    assert.equal(restored.assignments.length, data.assignments.length);
    const dates = restored.jobs.filter((job) => job.seriesId).map((job) => `${job.seriesId}|${job.date}`);
    assert.equal(new Set(dates).size, dates.length);
  });

  it("reads an older helper flag as maxHelperCount", () => {
    const restored = itemsToHub(
      [
        {
          pk: "CLEANER#maria",
          sk: "PROFILE",
          entity: "cleaner",
          cleanerId: "maria",
          firstName: "Maria",
          lastName: "Santos",
          email: "maria@example.com",
          mobilePhone: "5035550101",
          status: "ACTIVE",
          helpersApproved: false,
          typicalHelperCount: 2,
          createdAt: "2026-09-01T00:00:00.000Z",
          createdBy: "kelsey",
          updatedAt: "2026-09-01T00:00:00.000Z",
          updatedBy: "kelsey",
        },
      ],
      "2026-09-27",
    );
    assert.equal(restored.cleaners[0].maxHelperCount, 0);
    assert.equal(restored.cleaners[0].typicalHelperCount, 0);
    assert.equal(restored.cleaners[0].homeMarketId, "portland");
  });

  it("round-trips businessQuestionnaire on cleaner profiles", () => {
    const today = "2026-09-27";
    const data = buildSeed(today);
    const cleaner = data.cleaners[0]!;
    const questionnaire = buildQuestionnaireFromInput(
      {
        businessDisplayName: "Test Co",
        ownerLegalName: "Pat Smith",
        registrationStatus: "SOLE_PROPRIETOR",
        businessStructure: "",
        registeredLegalName: "",
        registrationState: "",
        stateRegistrationNumber: "",
        businessStreetAddress: "1 Oak",
        businessCity: "Portland",
        businessState: "OR",
        businessZip: "97201",
        businessPhone: "5035550100",
        businessEmail: "pat@example.com",
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
      "2026-09-27T00:00:00.000Z",
      "pat@example.com",
    );
    const items = hubToItems({
      ...data,
      cleaners: data.cleaners.map((row) =>
        row.cleanerId === cleaner.cleanerId ? { ...row, businessQuestionnaire: questionnaire } : row,
      ),
    });
    const restored = itemsToHub(items, today);
    const roundTripped = restored.cleaners.find((row) => row.cleanerId === cleaner.cleanerId)?.businessQuestionnaire;
    assert.equal(roundTripped?.businessDisplayName, "Test Co");
    assert.equal(roundTripped?.reviewStatus, "SUBMITTED");
  });

  it("round-trips contractor questionnaire submission history items", () => {
    const today = "2026-09-27";
    const data = buildSeed(today);
    const cleaner = data.cleaners[0]!;
    const questionnaire = buildQuestionnaireFromInput(
      {
        businessDisplayName: "Test Co",
        ownerLegalName: "Pat Smith",
        registrationStatus: "SOLE_PROPRIETOR",
        businessStructure: "",
        registeredLegalName: "",
        registrationState: "",
        stateRegistrationNumber: "",
        businessStreetAddress: "1 Oak",
        businessCity: "Portland",
        businessState: "OR",
        businessZip: "97201",
        businessPhone: "5035550100",
        businessEmail: "pat@example.com",
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
      "2026-09-27T00:00:00.000Z",
      "pat@example.com",
    );
    const record = createQuestionnaireSubmissionRecord({
      cleanerId: cleaner.cleanerId,
      submissionVersion: 1,
      submittedAt: "2026-09-27T12:00:00.000Z",
      submittedByCognitoSub: "sub-1",
      submittedByEmail: "pat@example.com",
      electronicSignature: "Pat Smith",
      questionnaireSnapshot: questionnaire,
      submissionId: "bqsub-test-1",
    });
    const items = hubToItems({ ...data, contractorQuestionnaireSubmissions: [record] });
    const item = items.find((row) => row.entity === "contractor_questionnaire_submission");
    assert.equal(item?.pk, `CLEANER#${cleaner.cleanerId}`);
    assert.match(String(item?.sk), /^BQSUB#/);
    const restored = itemsToHub(items, today);
    assert.equal(restored.contractorQuestionnaireSubmissions.length, 1);
    assert.equal(restored.contractorQuestionnaireSubmissions[0]?.submissionId, "bqsub-test-1");
    assert.equal(restored.contractorQuestionnaireSubmissions[0]?.electronicSignature, "Pat Smith");
  });
});
