import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cleanerOtherCleanersNote } from "./headcount-copy.ts";

describe("cleanerOtherCleanersNote", () => {
  it("returns null for solo headcount", () => {
    assert.equal(cleanerOtherCleanersNote(1), null);
    assert.equal(cleanerOtherCleanersNote(0), null);
  });

  it("uses singular cleaner for one other", () => {
    assert.equal(cleanerOtherCleanersNote(2), "You may be working with ~1 other cleaner.");
  });

  it("uses plural cleaners for multiple others", () => {
    assert.equal(cleanerOtherCleanersNote(4), "You may be working with ~3 other cleaners.");
  });
});