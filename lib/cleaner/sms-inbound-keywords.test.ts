import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseInboundSmsKeyword } from "./sms-inbound-keywords.ts";

describe("parseInboundSmsKeyword", () => {
  it("recognizes START, YES, and UNSTOP", () => {
    assert.deepEqual(parseInboundSmsKeyword("start"), { type: "opt_in", keyword: "START" });
    assert.deepEqual(parseInboundSmsKeyword("  YES  "), { type: "opt_in", keyword: "YES" });
    assert.deepEqual(parseInboundSmsKeyword("Unstop."), { type: "opt_in", keyword: "UNSTOP" });
  });

  it("recognizes STOP and HELP", () => {
    assert.deepEqual(parseInboundSmsKeyword("STOP"), { type: "opt_out", keyword: "STOP" });
    assert.deepEqual(parseInboundSmsKeyword("help"), { type: "help", keyword: "HELP" });
  });

  it("ignores unrelated messages", () => {
    assert.deepEqual(parseInboundSmsKeyword("Thanks!"), { type: "none" });
  });
});
