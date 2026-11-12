import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeLegacyAssignment } from "./assignment-legacy.ts";
import type { JobAssignment } from "./types.ts";

const base: JobAssignment = {
  assignmentId: "a1",
  jobId: "j1",
  cleanerId: "c1",
  serviceDate: "2026-11-12",
  status: "INVITED",
  proposedCrewSize: 2,
  payType: "FLAT",
  payPerPersonCents: 5000,
  proposedTotalPayCents: 10000,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("normalizeLegacyAssignment", () => {
  it("maps legacy pending availability to confirmed", () => {
    const row = {
      ...base,
      status: "PENDING_AVAILABILITY",
      pendingCrewSize: 2,
    };
    const normalized = normalizeLegacyAssignment(row);
    assert.equal(normalized.status, "CONFIRMED");
    assert.equal(normalized.confirmedCrewSize, 2);
    assert.equal(normalized.confirmedTotalPayCents, 10000);
    assert.equal("pendingCrewSize" in normalized, false);
  });

  it("leaves current statuses unchanged", () => {
    const confirmed = { ...base, status: "CONFIRMED" as const, confirmedCrewSize: 1 };
    assert.equal(normalizeLegacyAssignment(confirmed), confirmed);
  });

  it("promotes legacy conflict NEEDS_ATTENTION to confirmed", () => {
    const row = {
      ...base,
      status: "NEEDS_ATTENTION" as const,
      attentionReason: "This conflicts with another confirmed job for Claudia.",
      proposedCrewSize: 2,
    };
    const normalized = normalizeLegacyAssignment(row);
    assert.equal(normalized.status, "CONFIRMED");
    assert.equal(normalized.confirmedCrewSize, 2);
    assert.match(normalized.attentionReason ?? "", /conflicts with another confirmed job/);
  });
});
