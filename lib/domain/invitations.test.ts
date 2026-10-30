import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  clearStaleNotScheduledAttention,
  ASSIGNMENT_JOB_NOT_SCHEDULED_REASON,
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
    payPerPersonCents: 5000,
    proposedTotalPayCents: 10000,
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
    });
    assert.deepEqual(result, { ok: true, status: "CONFIRMED", confirmedCrewSize: 1, confirmedTotalPayCents: 5000 });
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
    });
    assert.deepEqual(result, { ok: true, status: "CONFIRMED", confirmedCrewSize: 3, confirmedTotalPayCents: 15000 });
  });

  it("rejects a manipulated crew size for a cleaner who is not helper-approved", () => {
    const result = validateInvitationAcceptance({
      assignment: invite({
        cleanerId: "maria",
        proposedCrewSize: 1,
        payPerPersonCents: 5000,
        proposedTotalPayCents: 5000,
      }),
      job: { jobId: "job-1", status: "SCHEDULED", headcountNeeded: 3 },
      cleaner: { cleanerId: "maria", status: "ACTIVE", maxHelperCount: 0 },
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
        proposedTotalPayCents: 5000,
      }),
      job: { jobId: "job-1", status: "SCHEDULED", headcountNeeded: 3 },
      cleaner: { cleanerId: "maria", status: "ACTIVE", maxHelperCount: 0 },
      requestedCrewSize: 1,
      jobAssignments: [],
      cleanerConfirmedAssignments: [],
      availabilityWindows: openWindow,
    });
    assert.deepEqual(result, { ok: true, status: "CONFIRMED", confirmedCrewSize: 1, confirmedTotalPayCents: 5000 });
  });

  it("lets a cleaner accept up to the proposed crew when job headcount is lower", () => {
    const result = validateInvitationAcceptance({
      assignment: invite({ proposedCrewSize: 2, proposedTotalPayCents: 10000 }),
      job: { jobId: "job-1", status: "SCHEDULED", headcountNeeded: 1 },
      cleaner: { cleanerId: "claudia", status: "ACTIVE", maxHelperCount: 2 },
      requestedCrewSize: 2,
      jobAssignments: [invite({ proposedCrewSize: 2, proposedTotalPayCents: 10000 })],
      cleanerConfirmedAssignments: [],
      availabilityWindows: openWindow,
    });
    assert.deepEqual(result, { ok: true, status: "CONFIRMED", confirmedCrewSize: 2, confirmedTotalPayCents: 10000 });
  });

  it("uses the stored rate for hourly crew pay", () => {
    const result = validateInvitationAcceptance({
      assignment: invite({ payType: "HOURLY", payPerPersonCents: 3500, proposedTotalPayCents: 7000 }),
      job: { jobId: "job-1", status: "SCHEDULED", headcountNeeded: 3 },
      cleaner: { cleanerId: "claudia", status: "ACTIVE", maxHelperCount: 2 },
      requestedCrewSize: 2,
      jobAssignments: [],
      cleanerConfirmedAssignments: [],
      availabilityWindows: openWindow,
    });
    assert.deepEqual(result, { ok: true, status: "CONFIRMED", confirmedCrewSize: 2, confirmedTotalPayCents: 7000 });
  });

  it("confirms an accepted job before that week's availability is submitted", () => {
    const result = validateInvitationAcceptance({
      assignment: invite({ serviceDate: "2026-11-02" }),
      job: { jobId: "job-1", status: "SCHEDULED", headcountNeeded: 3 },
      cleaner: { cleanerId: "claudia", status: "ACTIVE", maxHelperCount: 2 },
      requestedCrewSize: 2,
      jobAssignments: [invite({ serviceDate: "2026-11-02" })],
      cleanerConfirmedAssignments: [],
      availabilityWindows: [],
    });
    assert.deepEqual(result, { ok: true, status: "CONFIRMED", confirmedCrewSize: 2, confirmedTotalPayCents: 10000 });
  });

  it("rechecks the current helper maximum when an old invitation is accepted", () => {
    const tooLarge = validateInvitationAcceptance({
      assignment: invite({ proposedCrewSize: 3, proposedTotalPayCents: 15000 }),
      job: { jobId: "job-1", status: "SCHEDULED", headcountNeeded: 4 },
      cleaner: { cleanerId: "claudia", status: "ACTIVE", maxHelperCount: 1 },
      requestedCrewSize: 3,
      jobAssignments: [],
      cleanerConfirmedAssignments: [],
      availabilityWindows: openWindow,
    });
    assert.equal(tooLarge.ok, false);
    if (!tooLarge.ok) assert.equal(tooLarge.message, "Your approved crew size is 2.");
    const withinNewMax = validateInvitationAcceptance({
      assignment: invite({ proposedCrewSize: 3, proposedTotalPayCents: 15000 }),
      job: { jobId: "job-1", status: "SCHEDULED", headcountNeeded: 4 },
      cleaner: { cleanerId: "claudia", status: "ACTIVE", maxHelperCount: 1 },
      requestedCrewSize: 2,
      jobAssignments: [],
      cleanerConfirmedAssignments: [],
      availabilityWindows: openWindow,
    });
    assert.equal(withinNewMax.ok, true);
    if (withinNewMax.ok && withinNewMax.status === "CONFIRMED") assert.equal(withinNewMax.confirmedCrewSize, 2);
  });

  it("flags confirmed assignments when submitted availability no longer fits crew or schedule", () => {
    const oversized = invite({
      status: "CONFIRMED",
      serviceDate: "2026-10-02",
      confirmedCrewSize: 3,
      confirmedTotalPayCents: 15000,
      proposedCrewSize: 3,
    });
    const historical = invite({
      assignmentId: "old",
      jobId: "old-job",
      status: "CONFIRMED",
      serviceDate: "2026-09-04",
      confirmedCrewSize: 3,
      confirmedTotalPayCents: 15000,
    });
    const outside = invite({
      assignmentId: "outside",
      jobId: "job-outside",
      status: "CONFIRMED",
      serviceDate: "2026-10-03",
      confirmedCrewSize: 1,
      confirmedTotalPayCents: 5000,
      proposedCrewSize: 1,
    });
    const settled = revalidatePendingAssignments({
      assignments: [oversized, historical, outside],
      cleaner: { cleanerId: "claudia", firstName: "Claudia", status: "ACTIVE", maxHelperCount: 1 },
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
    assert.match(flagged?.attentionReason ?? "", /Follow up with Claudia\./);
    assert.equal(flagged?.availabilityConflictWeekStart, "2026-09-28");
    assert.equal(history?.status, "CONFIRMED");
    assert.equal(history?.confirmedCrewSize, 3);
  });

  it("flags a confirmed assignment when submitted availability does not cover it", () => {
    const confirmed = invite({
      status: "CONFIRMED",
      confirmedCrewSize: 1,
      confirmedTotalPayCents: 5000,
      serviceDate: "2026-10-03",
      arrivalWindowStart: "09:00",
      arrivalWindowEnd: "10:00",
    });
    const settled = revalidatePendingAssignments({
      assignments: [confirmed],
      cleaner: { cleanerId: "claudia", firstName: "Claudia", status: "ACTIVE", maxHelperCount: 0 },
      weekStart: "2026-09-28",
      weekEnd: "2026-10-04",
      windows: [{ date: "2026-10-03", start: "15:00", end: "18:00" }],
      jobs: [{ jobId: "job-1", status: "SCHEDULED", headcountNeeded: 1 }],
      nowIso: "2026-09-27T00:00:00.000Z",
    });
    assert.equal(settled[0].status, "NEEDS_ATTENTION");
    assert.match(settled[0].attentionReason ?? "", /falls outside those hours/);
    assert.equal(settled[0].availabilityConflictWeekStart, "2026-09-28");
  });

  it("revalidates a confirmed assignment on a covered day outside the submitted week", () => {
    const confirmed = invite({
      status: "CONFIRMED",
      serviceDate: "2026-10-04",
      confirmedCrewSize: 1,
      confirmedTotalPayCents: 5000,
      proposedCrewSize: 1,
      proposedTotalPayCents: 5000,
      arrivalWindowStart: "18:00",
      arrivalWindowEnd: "19:00",
      expectedDurationMinutes: 300,
    });
    const laterWeek = invite({
      assignmentId: "later",
      jobId: "job-later",
      status: "CONFIRMED",
      serviceDate: "2026-10-12",
      confirmedCrewSize: 1,
      confirmedTotalPayCents: 5000,
      proposedCrewSize: 1,
    });
    const settled = revalidatePendingAssignments({
      assignments: [confirmed, laterWeek],
      cleaner: { cleanerId: "claudia", firstName: "Claudia", status: "ACTIVE", maxHelperCount: 0 },
      weekStart: "2026-10-05",
      weekEnd: "2026-10-11",
      windows: [{ date: "2026-10-04", start: "00:00", end: "24:00" }],
      jobs: [
        { jobId: "job-1", status: "SCHEDULED", headcountNeeded: 1 },
        { jobId: "job-later", status: "SCHEDULED", headcountNeeded: 1 },
      ],
      nowIso: "2026-10-04T00:00:00.000Z",
    });
    const kept = settled.find((item) => item.assignmentId === "invite-1");
    const untouched = settled.find((item) => item.assignmentId === "later");
    assert.equal(kept?.status, "CONFIRMED");
    assert.equal(kept?.confirmedCrewSize, 1);
    assert.equal(untouched?.status, "CONFIRMED");
  });

  it("clears a stale not-scheduled flag after the job is booked", () => {
    const flagged = invite({
      assignmentId: "stale",
      status: "NEEDS_ATTENTION",
      attentionReason: ASSIGNMENT_JOB_NOT_SCHEDULED_REASON,
      confirmedCrewSize: undefined,
    });
    const cleared = clearStaleNotScheduledAttention(
      [{ jobId: "job-1", status: "SCHEDULED" }],
      [flagged],
      "2026-10-04T00:00:00.000Z",
    );
    assert.equal(cleared[0]?.status, "CONFIRMED");
    assert.equal(cleared[0]?.attentionReason, undefined);
    assert.equal(cleared[0]?.confirmedCrewSize, 2);
  });

  it("expires outstanding invites once headcount is met", () => {
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

  it("keeps confirmed assignments when headcount is met", () => {
    const now = "2026-10-01T00:00:00.000Z";
    const filled = expireRemainingInvitationsWhenFilled(
      [
        invite({ assignmentId: "claudia", status: "CONFIRMED", confirmedCrewSize: 2 }),
        invite({
          assignmentId: "maria",
          cleanerId: "maria",
          status: "CONFIRMED",
          confirmedCrewSize: 1,
          proposedCrewSize: 1,
        }),
      ],
      2,
      now,
    );
    assert.equal(filled.find((item) => item.assignmentId === "maria")?.status, "CONFIRMED");
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
      10000,
      now,
    );
    assert.equal(updated[0].status, "CONFIRMED");
    assert.equal(updated[0].confirmedCrewSize, 2);
    assert.equal(updated[1].status, "INVITED");
    assert.equal(updated[1].confirmedCrewSize, undefined);
  });
});
