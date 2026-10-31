import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { adminAvailabilitySubmittedSms } from "./admin-availability-sms.ts";

describe("adminAvailabilitySubmittedSms", () => {
  it("formats first submit", () => {
    const body = adminAvailabilitySubmittedSms({
      cleanerFirstName: "Claudia",
      weekStart: "2026-10-05",
      kind: "submitted",
    });
    assert.match(body, /Claudia submitted availability for the week of Oct 5 – Oct 11\./);
  });

  it("formats update", () => {
    const body = adminAvailabilitySubmittedSms({
      cleanerFirstName: "Claudia",
      weekStart: "2026-10-05",
      kind: "updated",
    });
    assert.match(body, /Claudia updated availability for the week of Oct 5 – Oct 11\./);
  });
});
