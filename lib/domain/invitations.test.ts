import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  expireRemainingInvitationsWhenFilled,
  validateInvitationAcceptance,
  withAssignmentConfirmed,
} from "./invitations.ts";
import type { JobAssignment } from "./types.ts";

function invite(overrides: Partial<JobAssignment> = {}): JobAssignment {
  return {
    assignmentId: "invite-1",
    jobId: "job-1",
    cleanerId: "claudia",
    serviceDate: "2026-10-02",
    status: "INVITED",
    proposedCrewSize: 2,
    arrivalWindowStart: "09:00",
    arrivalWindowEnd: "10:00",
    expectedDurationMinutes: 240,
    payType: "FLAT",
    payPerPersonCents: 5_000,
    proposedTotalPayCents: 10_000,
    invitedAt: "2026-09-26T00:00:00.000Z",
    createdAt: "2026-09-26T00:00:00.000Z",
    updatedAt: "2026-09-26T00:00:00.000Z",
    ...overrides,
  };
}

const openWindow = [{ date: "2026-10-02", start: "08:00", end: "17:00" }];

describe("invitation acceptance", () => {
  it("lets a helper-approved cleaner confirm one person from a proposed crew of two", () => {
    const result = validateInvitationAcceptance({
      assignment: invite(),
      job: { jobId: "job-1", status: "SCHEDULED", headcountNeeded: 3 },
      cleaner: { cleanerId: "claudia", status: "ACTIVE", helpersApproved: true },
      requestedCrewSize: 1,
      jobAssignments: [invite()],
      cleanerConfirmedAssignments: [],
      availabilityWindows: openWindow,
    });
    assert.deepEqual(result, { ok: true, confirmedCrewSize: 1, confirmedTotalPayCents: 5_000 });
  });

  it("lets a helper-approved cleaner increase the crew when headcount allows", () => {
    const result = validateInvitationAcceptance({
      assignment: invite(),
      job: { jobId: "job-1", status: "SCHEDULED", headcountNeeded: 4 },
      cleaner: { cleanerId: "claudia", status: "ACTIVE", helpersApproved: true },
      requestedCrewSize: 3,
      jobAssignments: [invite()],
      cleanerConfirmedAssignments: [],
      availabilityWindows: openWindow,
    });
    assert.deepEqual(result, { ok: true, confirmedCrewSize: 3, confirmedTotalPayCents: 15_000 });
  });

  it("rejects a manipulated crew size for a cleaner who is not helper-approved", () => {
    const result = validateInvitationAcceptance({
      assignment: invite({
        cleanerId: "maria",
        proposedCrewSize: 1,
        payPerPersonCents: 5_000,
        proposedTotalPayCents: 5_000,
      }),
      job: { jobId: "job-1", status: "SCHEDULED", headcountNeeded: 3 },
      cleaner: { cleanerId: "maria", status: "ACTIVE", helpersApproved: false },
      requestedCrewSize: 2,
      jobAssignments: [],
      cleanerConfirmedAssignments: [],
      availabilityWindows: openWindow,
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.message, "You can only attend on your own for this job.");
  });

  it("accepts a solo cleaner as exactly one person", () => {
    const result = validateInvitationAcceptance({
      assignment: invite({
        cleanerId: "maria",
        proposedCrewSize: 1,
        proposedTotalPayCents: 5_000,
      }),
      job: { jobId: "job-1", status: "SCHEDULED", headcountNeeded: 3 },
      cleaner: { cleanerId: "maria", status: "ACTIVE", helpersApproved: false },
      requestedCrewSize: 1,
      jobAssignments: [],
      cleanerConfirmedAssignments: [],
      availabilityWindows: openWindow,
    });
    assert.deepEqual(result, { ok: true, confirmedCrewSize: 1, confirmedTotalPayCents: 5_000 });
  });

  it("uses the stored rate for hourly crew pay", () => {
    const result = validateInvitationAcceptance({
      assignment: invite({ payType: "HOURLY", payPerPersonCents: 3_500, proposedTotalPayCents: 7_000 }),
      job: { jobId: "job-1", status: "SCHEDULED", headcountNeeded: 3 },
      cleaner: { cleanerId: "claudia", status: "ACTIVE", helpersApproved: true },
      requestedCrewSize: 2,
      jobAssignments: [],
      cleanerConfirmedAssignments: [],
      availabilityWindows: openWindow,
    });
    assert.deepEqual(result, { ok: true, confirmedCrewSize: 2, confirmedTotalPayCents: 7_000 });
  });

  it("expires the other invitations once the job is full", () => {
    const now = "2026-10-01T00:00:00.000Z";
    const filled = expireRemainingInvitationsWhenFilled(
      [
        invite({ assignmentId: "claudia", status: "CONFIRMED", confirmedCrewSize: 2 }),
        invite({ assignmentId: "maria", cleanerId: "maria", status: "INVITED" }),
        invite({ assignmentId: "jessica", cleanerId: "jessica", status: "DECLINED" }),
      ],
      2,
      now,
    );
    assert.equal(filled.find((item) => item.assignmentId === "maria")?.status, "EXPIRED_JOB_FILLED");
    assert.equal(filled.find((item) => item.assignmentId === "jessica")?.status, "DECLINED");
  });

  it("confirms only the selected occurrence", () => {
    const now = "2026-10-01T00:00:00.000Z";
    const updated = withAssignmentConfirmed(
      [
        invite({ assignmentId: "oct-6", jobId: "job-oct-6" }),
        invite({ assignmentId: "oct-20", jobId: "job-oct-20" }),
      ],
      "oct-6",
      2,
      10_000,
      now,
    );
    assert.equal(updated[0].status, "CONFIRMED");
    assert.equal(updated[0].confirmedCrewSize, 2);
    assert.equal(updated[1].status, "INVITED");
    assert.equal(updated[1].confirmedCrewSize, undefined);
  });
});
