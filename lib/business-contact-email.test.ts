import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  GOLDEN_HOUR_BUSINESS_CONTACT_EMAIL,
  businessContactEmail,
  businessContactEmailFromEnv,
} from "./business-contact-email.ts";

describe("businessContactEmailFromEnv", () => {
  it("returns configured email", () => {
    assert.equal(
      businessContactEmailFromEnv({ NEXT_PUBLIC_BUSINESS_CONTACT_EMAIL: "ops@example.com" }),
      "ops@example.com",
    );
  });

  it("returns null when unset or invalid", () => {
    assert.equal(businessContactEmailFromEnv({}), null);
    assert.equal(businessContactEmailFromEnv({ BUSINESS_CONTACT_EMAIL: "not-an-email" }), null);
  });
});

describe("businessContactEmail", () => {
  it("falls back to Golden Hour default", () => {
    assert.equal(businessContactEmail({}), GOLDEN_HOUR_BUSINESS_CONTACT_EMAIL);
  });

  it("prefers env override", () => {
    assert.equal(businessContactEmail({ NEXT_PUBLIC_BUSINESS_CONTACT_EMAIL: "ops@example.com" }), "ops@example.com");
  });
});
