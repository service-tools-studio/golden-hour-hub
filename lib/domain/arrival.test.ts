import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assignmentScheduleNoticeInSync,
  assignmentStartTimeOutOfSync,
  assignmentNoticeInSync,
  normalizeArrivalWindow,
  validateArrivalWindow,
} from "./arrival.ts";
import type { AssignmentNotice } from "./types.ts";

describe("arrival times", () => {
  it("stores a single hard start time", () => {
    assert.deepEqual(normalizeArrivalWindow("14:30"), {
      arrivalWindowStart: "14:30",
      arrivalWindowEnd: "14:30",
    });
  });

  it("ignores pay and crew when comparing schedule notice", () => {
    const last: AssignmentNotice = {
      arrivalWindowStart: "11:00",
      expectedDurationMinutes: 120,
      proposedCrewSize: 1,
      payType: "FLAT",
      payPerPersonCents: 5000,
    };
    const current: AssignmentNotice = {
      ...last,
      proposedCrewSize: 2,
      payPerPersonCents: 8000,
      payType: "HOURLY",
    };
    assert.equal(assignmentScheduleNoticeInSync(last, current), true);
    assert.equal(assignmentNoticeInSync(last, current), false);
    assert.equal(assignmentStartTimeOutOfSync(last, current), false);
  });

  it("detects start time drift without duration changes", () => {
    const last: AssignmentNotice = {
      arrivalWindowStart: "11:00",
      expectedDurationMinutes: 120,
      proposedCrewSize: 1,
      payType: "FLAT",
      payPerPersonCents: 5000,
    };
    const current: AssignmentNotice = {
      ...last,
      arrivalWindowStart: "13:00",
    };
    assert.equal(assignmentStartTimeOutOfSync(last, current), true);
    assert.equal(assignmentScheduleNoticeInSync(last, current), false);
  });

  it("does not flag duration-only drift as start time change", () => {
    const last: AssignmentNotice = {
      arrivalWindowStart: "11:00",
      expectedDurationMinutes: 120,
      proposedCrewSize: 1,
      payType: "FLAT",
      payPerPersonCents: 5000,
    };
    const current: AssignmentNotice = {
      ...last,
      expectedDurationMinutes: 90,
    };
    assert.equal(assignmentStartTimeOutOfSync(last, current), false);
    assert.equal(assignmentScheduleNoticeInSync(last, current), false);
  });

  it("treats legacy window end as in sync when the start time matches", () => {
    const last: AssignmentNotice = {
      arrivalWindowStart: "11:00",
      arrivalWindowEnd: "12:00",
      expectedDurationMinutes: 120,
      proposedCrewSize: 1,
      payType: "FLAT",
      payPerPersonCents: 5000,
    };
    const current: AssignmentNotice = {
      ...last,
      arrivalWindowEnd: "11:00",
    };
    assert.equal(assignmentNoticeInSync(last, current), true);
  });

  it("accepts legacy windows but normalizes to the start", () => {
    const result = validateArrivalWindow("08:00", "09:00");
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.arrivalWindowStart, "08:00");
      assert.equal(result.arrivalWindowEnd, "08:00");
    }
  });
});
