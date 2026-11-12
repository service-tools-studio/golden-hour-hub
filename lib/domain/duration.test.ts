import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  hasKnownDurationMinutes,
  parseOptionalDurationMinutes,
  validateOptionalDurationMinutes,
} from "./duration.ts";

describe("optional duration", () => {
  it("treats absent and zero as no estimate", () => {
    assert.equal(parseOptionalDurationMinutes(undefined), undefined);
    assert.equal(parseOptionalDurationMinutes(null), undefined);
    assert.equal(parseOptionalDurationMinutes(0), undefined);
    assert.equal(hasKnownDurationMinutes(undefined), false);
    assert.equal(hasKnownDurationMinutes(240), true);
  });

  it("validates optional bounds", () => {
    assert.equal(validateOptionalDurationMinutes(undefined).ok, true);
    assert.equal(validateOptionalDurationMinutes(240).ok, true);
    const bad = validateOptionalDurationMinutes(20);
    assert.equal(bad.ok, false);
  });
});
