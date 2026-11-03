import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { adminBusinessQuestionnaireSubmittedSms } from "./admin-business-questionnaire-sms.ts";

describe("adminBusinessQuestionnaireSubmittedSms", () => {
  it("formats first submit", () => {
    const body = adminBusinessQuestionnaireSubmittedSms({
      cleanerFirstName: "Claudia",
      businessDisplayName: "Bright Cleaning Co",
      kind: "submitted",
    });
    assert.equal(
      body,
      "Golden Hour Hub: Claudia submitted business information (Bright Cleaning Co).",
    );
  });

  it("formats update", () => {
    const body = adminBusinessQuestionnaireSubmittedSms({
      cleanerFirstName: "Claudia",
      businessDisplayName: "Bright Cleaning Co",
      kind: "updated",
    });
    assert.equal(body, "Golden Hour Hub: Claudia updated business information (Bright Cleaning Co).");
  });
});
