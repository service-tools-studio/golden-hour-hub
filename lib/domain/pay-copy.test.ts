import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assignmentPayFieldHints,
  assignmentPayFieldLabel,
  assignmentPaySummaryLine,
  cleanerInvitationPayLines,
} from "./pay-copy.ts";
import type { JobAssignment } from "./types.ts";

describe("pay copy", () => {
  it("labels solo vs helper-approved staffing", () => {
    assert.equal(assignmentPayFieldLabel(false, "FLAT"), "Total per job");
    assert.equal(assignmentPayFieldLabel(false, "HOURLY"), "Pay per hour");
    assert.equal(assignmentPayFieldLabel(true, "FLAT"), "Total for crew per job");
    assert.equal(assignmentPayFieldLabel(true, "HOURLY"), "Pay per crew hour");
  });

  it("formats admin hints for solo cleaners", () => {
    assert.deepEqual(
      assignmentPayFieldHints({
        bringsHelpers: false,
        payType: "FLAT",
        crewTotalCents: 15000,
        perPersonCents: 15000,
        crewSize: 1,
      }),
      ["$150.00 total for the job"],
    );
    assert.deepEqual(
      assignmentPayFieldHints({
        bringsHelpers: false,
        payType: "HOURLY",
        crewTotalCents: 15000,
        perPersonCents: 15000,
        crewSize: 1,
      }),
      ["$150.00 per hour"],
    );
  });

  it("formats admin hints for helper-approved crews", () => {
    assert.deepEqual(
      assignmentPayFieldHints({
        bringsHelpers: true,
        payType: "FLAT",
        crewTotalCents: 3500,
        perPersonCents: 3500,
        crewSize: 1,
      }),
      ["$35.00 total for crew for the job", "$35.00 per person for the job, 1 person crew"],
    );
    assert.deepEqual(
      assignmentPayFieldHints({
        bringsHelpers: true,
        payType: "FLAT",
        crewTotalCents: 7000,
        perPersonCents: 3500,
        crewSize: 2,
      }),
      ["$70.00 total for crew for the job", "$35.00 per person for the job, 2 person crew"],
    );
    assert.deepEqual(
      assignmentPayFieldHints({
        bringsHelpers: true,
        payType: "HOURLY",
        crewTotalCents: 7000,
        perPersonCents: 3500,
        crewSize: 2,
      }),
      ["$35.00 per person per hour, 2 person crew"],
    );
  });

  it("adds crew hourly total on invitations for helpers", () => {
    assert.deepEqual(
      cleanerInvitationPayLines({
        bringsHelpers: true,
        payType: "HOURLY",
        crewTotalCents: 7000,
        perPersonCents: 3500,
        crewSize: 2,
      }),
      ["$70.00 per hour", "$35.00 per person per hour, 2 person crew"],
    );
  });

  it("formats cleaner job pay lines", () => {
    const assignment = {
      payType: "FLAT",
      proposedTotalPayCents: 15000,
      confirmedTotalPayCents: 15000,
      payPerPersonCents: 15000,
    } as JobAssignment;
    assert.equal(assignmentPaySummaryLine(assignment, true, false), "$150.00 total for the job");
    assert.equal(assignmentPaySummaryLine(assignment, true, true), "$150.00 total for crew for the job");
  });
});
