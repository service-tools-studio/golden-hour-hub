import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ASSIGNMENT_SMS_LOG_RETENTION_DAYS,
  jobIdsPastAssignmentSmsLogRetention,
} from "./assignment-sms-log-retention.ts";
import type { Job } from "../domain/types.ts";

function job(jobId: string, date: string): Job {
  return {
    jobId,
    date,
    customerId: "c",
    propertyId: "p",
    status: "SCHEDULED",
    serviceType: "ONE_TIME",
    headcountNeeded: 1,
    snapshot: {
      customerDisplayName: "Test",
      phone: "5035550100",
      propertyId: "p",
      streetAddress: "1 Main",
      city: "Portland",
      state: "OR",
      zip: "97201",
      bedrooms: 2,
      bathrooms: 1,
      squareFeet: 1000,
      preferences: "",
    },
    specialInstructions: "",
    createdAt: "",
    createdBy: "kelsey",
    updatedAt: "",
    updatedBy: "kelsey",
  };
}

describe("jobIdsPastAssignmentSmsLogRetention", () => {
  it("uses a fifteen-day cutoff in the business calendar", () => {
    assert.equal(ASSIGNMENT_SMS_LOG_RETENTION_DAYS, 15);
    const today = "2026-10-29";
    const ids = jobIdsPastAssignmentSmsLogRetention(
      [job("keep", "2026-10-15"), job("drop", "2026-10-14"), job("old", "2026-09-01")],
      today,
    );
    assert.deepEqual(ids.sort(), ["drop", "old"]);
  });
});
