import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { smsToE164 } from "./sms.ts";

describe("smsToE164", () => {
  it("prefixes 10-digit US numbers", () => {
    assert.equal(smsToE164("5039335444"), "+15039335444");
  });

  it("strips a leading 1 from 11 digits", () => {
    assert.equal(smsToE164("15039335444"), "+15039335444");
  });

  it("passes through E.164", () => {
    assert.equal(smsToE164("+15039335444"), "+15039335444");
  });
});
