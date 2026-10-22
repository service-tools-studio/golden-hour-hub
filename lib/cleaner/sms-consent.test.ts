import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  cleanerAllowsSchedulingSms,
  cleanerNeedsSmsOnboarding,
  cleanerSmsEnrollmentUpToDate,
  cleanerWithMobilePhone,
  schedulingSmsConsentIsCurrent,
} from "./sms-consent.ts";
import { SMS_SCHEDULING_DISCLOSURE_VERSION } from "./sms-disclosure.ts";
import type { CleanerProfile } from "../domain/types.ts";

function baseCleaner(overrides: Partial<CleanerProfile> = {}): CleanerProfile {
  return {
    cleanerId: "demo",
    firstName: "Demo",
    lastName: "Cleaner",
    email: "demo@example.com",
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

describe("scheduling SMS consent", () => {
  it("requires onboarding when enrollment was never completed", () => {
    const cleaner = baseCleaner();
    assert.equal(cleanerNeedsSmsOnboarding(cleaner), true);
    assert.equal(cleanerSmsEnrollmentUpToDate(cleaner), false);
  });

  it("allows SMS when opt-in consent matches profile phone and disclosure version", () => {
    const cleaner = baseCleaner({
      smsSchedulingOptIn: true,
      smsOptInRecordedAt: "2026-10-01T00:00:00.000Z",
      smsConsentPhone: "5035550101",
      smsConsentRecordedAt: "2026-10-01T00:00:00.000Z",
      smsConsentDisclosureVersion: SMS_SCHEDULING_DISCLOSURE_VERSION,
    });
    assert.equal(schedulingSmsConsentIsCurrent(cleaner), true);
    assert.equal(cleanerAllowsSchedulingSms(cleaner), true);
    assert.equal(cleanerNeedsSmsOnboarding(cleaner), false);
  });

  it("blocks SMS and requires re-consent when profile phone changes", () => {
    const cleaner = baseCleaner({
      smsSchedulingOptIn: true,
      smsOptInRecordedAt: "2026-10-01T00:00:00.000Z",
      smsConsentPhone: "5035550101",
      smsConsentRecordedAt: "2026-10-01T00:00:00.000Z",
      smsConsentDisclosureVersion: SMS_SCHEDULING_DISCLOSURE_VERSION,
      mobilePhone: "5035550199",
    });
    assert.equal(cleanerAllowsSchedulingSms(cleaner), false);
    assert.equal(cleanerNeedsSmsOnboarding(cleaner), true);
  });

  it("revokes active opt-in when mobile phone is updated but keeps consent audit fields", () => {
    const optedIn = baseCleaner({
      smsSchedulingOptIn: true,
      smsOptInRecordedAt: "2026-10-01T00:00:00.000Z",
      smsConsentPhone: "5035550101",
      smsConsentRecordedAt: "2026-10-01T00:00:00.000Z",
      smsConsentDisclosureVersion: SMS_SCHEDULING_DISCLOSURE_VERSION,
    });
    const next = cleanerWithMobilePhone(optedIn, "(503) 555-0199");
    assert.equal(next.mobilePhone, "5035550199");
    assert.equal(next.smsSchedulingOptIn, false);
    assert.equal(next.smsConsentPhone, "5035550101");
    assert.equal(cleanerNeedsSmsOnboarding(next), true);
  });

  it("treats declined enrollment as up to date", () => {
    const cleaner = baseCleaner({
      smsSchedulingOptIn: false,
      smsOptInRecordedAt: "2026-10-01T00:00:00.000Z",
    });
    assert.equal(cleanerNeedsSmsOnboarding(cleaner), false);
    assert.equal(cleanerAllowsSchedulingSms(cleaner), false);
  });
});
