import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SMS_SCHEDULING_DISCLOSURE_VERSION } from "./sms-disclosure.ts";
import { planInboundSmsReply } from "./sms-inbound.ts";
import { emptyHub } from "../mock/seed.ts";
import type { CleanerProfile } from "../domain/types.ts";

function cleaner(overrides: Partial<CleanerProfile> = {}): CleanerProfile {
  return {
    cleanerId: "jasmin",
    firstName: "Jasmin",
    lastName: "Heart",
    email: "jasmin@example.com",
    mobilePhone: "5035550101",
    status: "ACTIVE",
    typicalHelperCount: 0,
    maxHelperCount: 0,
    typicalHourlyRateCents: 5000,
    createdAt: "2026-01-01T00:00:00.000Z",
    createdBy: "test",
    updatedAt: "2026-01-01T00:00:00.000Z",
    updatedBy: "test",
    ...overrides,
  };
}

describe("planInboundSmsReply", () => {
  it("opts in on START and records consent on the inbound number", () => {
    const hub = { ...emptyHub("2026-10-21"), cleaners: [cleaner({ smsSchedulingOptIn: false, smsOptInRecordedAt: "2026-01-01T00:00:00.000Z" })] };
    const plan = planInboundSmsReply(hub, "+15035550101", "START");
    assert.equal(plan.action, "opt_in");
    if (plan.action !== "opt_in") return;
    assert.equal(plan.cleaners[0].smsSchedulingOptIn, true);
    assert.equal(plan.cleaners[0].smsConsentPhone, "5035550101");
    assert.equal(plan.cleaners[0].smsConsentMethod, "sms_start");
    assert.equal(plan.cleaners[0].smsConsentDisclosureVersion, SMS_SCHEDULING_DISCLOSURE_VERSION);
  });

  it("opts out on STOP", () => {
    const hub = {
      ...emptyHub("2026-10-21"),
      cleaners: [
        cleaner({
          smsSchedulingOptIn: true,
          smsOptInRecordedAt: "2026-01-01T00:00:00.000Z",
          smsConsentPhone: "5035550101",
          smsConsentRecordedAt: "2026-01-01T00:00:00.000Z",
          smsConsentDisclosureVersion: SMS_SCHEDULING_DISCLOSURE_VERSION,
        }),
      ],
    };
    const plan = planInboundSmsReply(hub, "+15035550101", "STOP");
    assert.equal(plan.action, "opt_out");
    if (plan.action !== "opt_out") return;
    assert.equal(plan.cleaners[0].smsSchedulingOptIn, false);
    assert.equal(plan.cleaners[0].smsConsentPhone, undefined);
  });
});
