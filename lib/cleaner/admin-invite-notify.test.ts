import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { adminNotifyPhoneDigitsFromEnv, kelseyPhoneDigitsFromEnv } from "../contact.ts";
import { adminInviteAcceptedSms } from "./admin-invite-sms.ts";

describe("kelseyPhoneDigitsFromEnv", () => {
  it("normalizes to 10-digit US", () => {
    assert.equal(kelseyPhoneDigitsFromEnv("(503) 555-0100"), "5035550100");
    assert.equal(kelseyPhoneDigitsFromEnv("+15035550100"), "5035550100");
    assert.equal(kelseyPhoneDigitsFromEnv(""), "");
  });
});

describe("adminNotifyPhoneDigitsFromEnv", () => {
  it("dedupes Kelsey and Jasmin numbers", () => {
    const phones = adminNotifyPhoneDigitsFromEnv({
      KELSEY_PHONE: "5035550100",
      JASMIN_PHONE: "5035550100",
    });
    assert.deepEqual(phones, ["5035550100"]);
  });

  it("returns both when distinct", () => {
    const phones = adminNotifyPhoneDigitsFromEnv({
      KELSEY_PHONE: "5035550101",
      JASMIN_PHONE: "5035550102",
    });
    assert.deepEqual(phones, ["5035550101", "5035550102"]);
  });
});

describe("adminInviteAcceptedSms", () => {
  it("formats accept alert with date, client, and address", () => {
    const body = adminInviteAcceptedSms({
      cleanerFirstName: "Sam",
      clientFullName: "Jane Doe",
      details: {
        date: "2026-10-29",
        arrivalWindowStart: "09:00",
        serviceType: "RECURRING",
        streetAddress: "123 Main St",
        city: "Portland",
        state: "OR",
        zip: "97201",
      },
    });
    assert.match(body, /^Sam has just accepted the invite for this job:/);
    assert.match(body, /Jane Doe - Standard clean/);
    assert.match(body, /123 Main St/);
    assert.match(body, /Portland/);
    assert.doesNotMatch(body, /Golden Hour Hub here/);
  });

  it("uses TBD wording when start time is unset", () => {
    const body = adminInviteAcceptedSms({
      cleanerFirstName: "Sam",
      clientFullName: "Jane Doe",
      details: {
        date: "2026-10-29",
        serviceType: "DEEP_CLEAN",
        streetAddress: "123 Main St",
        city: "Portland",
        state: "OR",
        zip: "97201",
      },
    });
    assert.match(body, /start time to be confirmed/);
    assert.match(body, /Jane Doe - Deep clean/);
  });
});
