import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { NEXT_INSURANCE_REFERRAL_URL } from "./next-insurance-referral.ts";

describe("next insurance referral", () => {
  it("uses one referral URL in all questionnaire NEXT links", () => {
    const root = join(dirname(fileURLToPath(import.meta.url)), "..");
    const source = readFileSync(join(root, "components/cleaner/next-insurance-recommendation.tsx"), "utf8");
    const hrefMatches = source.match(/href=\{NEXT_INSURANCE_REFERRAL_URL\}/g) ?? [];
    assert.equal(hrefMatches.length, 1, "all links should go through NextInsuranceReferralLink");
    assert.match(NEXT_INSURANCE_REFERRAL_URL, /^https:\/\/refer\.nextinsurance\.com\//);
  });
});
