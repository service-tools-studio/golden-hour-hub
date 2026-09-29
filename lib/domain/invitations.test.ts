import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  expireRemainingInvitationsWhenFilled,
  revalidatePendingAssignments,
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
      cleaner: { cleanerId: "claudia", status: "ACTIVE", maxHelperCount: 2 },
      requestedCrewSize: 1,
      jobAssignments: [invite()],
      cleanerConfirmedAssignments: [],
      availabilityWindows: openWindow,
      availabilitySubmitted: true,
    });
    assert.deepEqual(result, { ok: true, status: "CONFIRMED", confirmedCrewSize: 1, confirmedTotalPayCents: 5_000 });
  });

  it("lets a helper-approved cleaner increase the crew when headcount allows", () => {
    const result = validateInvitationAcceptance({
      assignment: invite(),
      job: { jobId: "job-1", status: "SCHEDULED", headcountNeeded: 4 },
      cleaner: { cleanerId: "claudia", status: "ACTIVE", maxHelperCount: 2 },
      requestedCrewSize: 3,
      jobAssignments: [invite()],
      cleanerConfirmedAssignments: [],
      availabilityWindows: openWindow,
      availabilitySubmitted: true,
    });
    assert.deepEqual(result, { ok: true, status: "CONFIRMED", confirmedCrewSize: 3, confirmedTotalPayCents: 15_000 });
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
      cleaner: { cleanerId: "maria", status: "ACTIVE", maxHelperCount: 0 },
      requestedCrewSize: 2,
      jobAssignments: [],
      cleanerConfirmedAssignments: [],
      availabilityWindows: openWindow,
      availabilitySubmitted: true,
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
      cleaner: { cleanerId: "maria", status: "ACTIVE", maxHelperCount: 0 },
      requestedCrewSize: 1,
      jobAssignments: [],
      cleanerConfirmedAssignments: [],
      availabilityWindows: openWindow,
      availabilitySubmitted: true,
    });
    assert.deepEqual(result, { ok: true, status: "CONFIRMED", confirmedCrewSize: 1, confirmedTotalPayCents: 5_000 });
  });

  it("uses the stored rate for hourly crew pay", () => {
    const result = validateInvitationAcceptance({
      assignment: invite({ payType: "HOURLY", payPerPersonCents: 3_500, proposedTotalPayCents: 7_000 }),
      job: { jobId: "job-1", status: "SCHEDULED", headcountNeeded: 3 },
      cleaner: { cleanerId: "claudia", status: "ACTIVE", maxHelperCount: 2 },
      requestedCrewSize: 2,
      jobAssignments: [],
      cleanerConfirmedAssignments: [],
      availabilityWindows: openWindow,
      availabilitySubmitted: true,
    });
    assert.deepEqual(result, { ok: true, status: "CONFIRMED", confirmedCrewSize: 2, confirmedTotalPayCents: 7_000 });
  });

  it("keeps an accepted future job pending until that week's availability exists", () => {
    const result = validateInvitationAcceptance({
      assignment: invite({ serviceDate: "2026-11-02" }),
      job: { jobId: "job-1", status: "SCHEDULED", headcountNeeded: 3 },
      cleaner: { cleanerId: "claudia", status: "ACTIVE", maxHelperCount: 2 },
      requestedCrewSize: 2,
      jobAssignments: [invite({ serviceDate: "2026-11-02" })],
      cleanerConfirmedAssignments: [],
      availabilityWindows: [],
      availabilitySubmitted: false,
    });
    assert.deepEqual(result, { ok: true, status: "PENDING_AVAILABILITY", pendingCrewSize: 2 });
  });

  it("rechecks the current helper maximum when an old invitation is accepted", () => {
    const tooLarge = validateInvitationAcceptance({
      assignment: invite({ proposedCrewSize: 3, proposedTotalPayCents: 15_000 }),
      job: { jobId: "job-1", status: "SCHEDULED", headcountNeeded: 4 },
      cleaner: { cleanerId: "claudia", status: "ACTIVE", maxHelperCount: 1 },
      requestedCrewSize: 3,
      jobAssignments: [],
      cleanerConfirmedAssignments: [],
      availabilityWindows: openWindow,
      availabilitySubmitted: true,
    });
    assert.equal(tooLarge.ok, false);
    if (!tooLarge.ok) assert.equal(tooLarge.message, "Your approved crew size is 2.");
    const withinNewMax = validateInvitationAcceptance({
      assignment: invite({ proposedCrewSize: 3, proposedTotalPayCents: 15_000 }),
      job: { jobId: "job-1", status: "SCHEDULED", headcountNeeded: 4 },
      cleaner: { cleanerId: "claudia", status: "ACTIVE", maxHelperCount: 1 },
      requestedCrewSize: 2,
      jobAssignments: [],
      cleanerConfirmedAssignments: [],
      availabilityWindows: openWindow,
      availabilitySubmitted: true,
    });
    assert.equal(withinNewMax.ok, true);
    if (withinNewMax.ok && withinNewMax.status === "CONFIRMED") assert.equal(withinNewMax.confirmedCrewSize, 2);
  });

  it("confirms a pending assignment once availability fits and flags one that does not", () => {
    const pending = invite({
      status: "PENDING_AVAILABILITY",
      serviceDate: "2026-10-02",
      pendingCrewSize: 3,
      proposedCrewSize: 3,
    });
    const historical = invite({
      assignmentId: "old",
      jobId: "old-job",
      status: "CONFIRMED",
      serviceDate: "2026-09-04",
      confirmedCrewSize: 3,
      confirmedTotalPayCents: 15_000,
    });
    const outside = invite({
      assignmentId: "outside",
      jobId: "job-outside",
      status: "PENDING_AVAILABILITY",
      serviceDate: "2026-10-03",
      pendingCrewSize: 1,
      proposedCrewSize: 1,
    });
    const settled = revalidatePendingAssignments({
      assignments: [pending, historical, outside],
      cleaner: { cleanerId: "claudia", status: "ACTIVE", maxHelperCount: 1 },
      weekStart: "2026-09-28",
      weekEnd: "2026-10-04",
      windows: openWindow,
      jobs: [
        { jobId: "job-1", status: "SCHEDULED", headcountNeeded: 3 },
        { jobId: "job-outside", status: "SCHEDULED", headcountNeeded: 2 },
        { jobId: "old-job", status: "SCHEDULED", headcountNeeded: 3 },
      ],
      nowIso: "2026-09-27T00:00:00.000Z",
    });
    const confirmed = settled.find((item) => item.assignmentId === "invite-1");
    const flagged = settled.find((item) => item.assignmentId === "outside");
    const history = settled.find((item) => item.assignmentId === "old");
    assert.equal(confirmed?.status, "NEEDS_ATTENTION");
    assert.match(confirmed?.attentionReason ?? "", /approved crew size is 2/);
    assert.equal(flagged?.status, "NEEDS_ATTENTION");
    assert.match(flagged?.attentionReason ?? "", /outside the cleaner's submitted availability/);
    assert.equal(history?.status, "CONFIRMED");
    assert.equal(history?.confirmedCrewSize, 3);
  });

  it("confirms a pending assignment that fits the newly submitted week", () => {
    const pending = invite({
      status: "PENDING_AVAILABILITY",
      pendingCrewSize: 2,
    });
    const settled = revalidatePendingAssignments({
      assignments: [pending],
      cleaner: { cleanerId: "claudia", status: "ACTIVE", maxHelperCount: 2 },
      weekStart: "2026-09-28",
      weekEnd: "2026-10-04",
      windows: openWindow,
      jobs: [{ jobId: "job-1", status: "SCHEDULED", headcountNeeded: 3 }],
      nowIso: "2026-09-27T00:00:00.000Z",
    });
    assert.equal(settled[0].status, "CONFIRMED");
    assert.equal(settled[0].confirmedCrewSize, 2);
    assert.equal(settled[0].confirmedTotalPayCents, 10_000);
    assert.equal(settled[0].pendingCrewSize, undefined);
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
