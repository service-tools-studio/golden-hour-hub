import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { calculateConfirmedHeadcount, calculateRemainingHeadcount } from "./scheduling.ts";
import {
  calculateNextOccurrence,
  copyStaffingTemplateToOccurrence,
  determineRecurringEditScope,
  generateOccurrenceDates,
  planOccurrenceStaffing,
  recurrenceSummary,
  shouldGenerateOccurrence,
  validateRecurrenceRule,
} from "./recurrence.ts";
import type { JobAssignment, RecurrenceRule, StaffingTemplateEntry } from "./types.ts";

const weeklyMonday: RecurrenceRule = {
  frequency: "WEEK",
  interval: 1,
  daysOfWeek: ["MONDAY"],
};

const biweeklyTuesday: RecurrenceRule = {
  frequency: "WEEK",
  interval: 2,
  daysOfWeek: ["TUESDAY"],
};

const everyFourFridays: RecurrenceRule = {
  frequency: "WEEK",
  interval: 4,
  daysOfWeek: ["FRIDAY"],
};

const monthly15: RecurrenceRule = {
  frequency: "MONTH",
  interval: 1,
  dayOfMonth: 15,
};

const secondMonday: RecurrenceRule = {
  frequency: "MONTH",
  interval: 1,
  daysOfWeek: ["MONDAY"],
  weekOrdinals: [2],
};

const firstAndThirdSaturday: RecurrenceRule = {
  frequency: "MONTH",
  interval: 1,
  daysOfWeek: ["SATURDAY"],
  weekOrdinals: [1, 3],
};

const lastFriday: RecurrenceRule = {
  frequency: "MONTH",
  interval: 1,
  daysOfWeek: ["FRIDAY"],
  weekOrdinals: ["LAST"],
};

function template(overrides: Partial<StaffingTemplateEntry> = {}): StaffingTemplateEntry {
  return {
    cleanerId: "claudia",
    proposedCrewSize: 2,
    arrivalWindowStart: "09:00",
    arrivalWindowEnd: "10:00",
    expectedDurationMinutes: 240,
    payType: "FLAT",
    payPerPersonCents: 5_000,
    ...overrides,
  };
}

describe("recurrence dates", () => {
  it("describes patterns in plain language", () => {
    assert.equal(recurrenceSummary(weeklyMonday), "Every Monday");
    assert.equal(recurrenceSummary(biweeklyTuesday), "Every 2 weeks on Tuesday");
    assert.equal(recurrenceSummary(everyFourFridays), "Every 4 weeks on Friday");
    assert.equal(recurrenceSummary(monthly15), "Every month on the 15th");
    assert.equal(recurrenceSummary(secondMonday), "Every 2nd Monday of the month");
    assert.equal(recurrenceSummary(firstAndThirdSaturday), "Every 1st and 3rd Saturday of the month");
    assert.equal(recurrenceSummary(lastFriday), "Every last Friday of the month");
  });

  it("generates weekly, biweekly, and every-4-weeks dates", () => {
    assert.deepEqual(generateOccurrenceDates(weeklyMonday, "2026-10-05", "2026-10-19"), [
      "2026-10-05",
      "2026-10-12",
      "2026-10-19",
    ]);
    assert.deepEqual(generateOccurrenceDates(biweeklyTuesday, "2026-10-06", "2026-11-17"), [
      "2026-10-06",
      "2026-10-20",
      "2026-11-03",
      "2026-11-17",
    ]);
    assert.deepEqual(generateOccurrenceDates(everyFourFridays, "2026-10-02", "2026-12-25"), [
      "2026-10-02",
      "2026-10-30",
      "2026-11-27",
      "2026-12-25",
    ]);
  });

  it("generates monthly dates, including ordinal weeks, and skips missing calendar days", () => {
    assert.deepEqual(generateOccurrenceDates(monthly15, "2026-10-15", "2027-01-15"), [
      "2026-10-15",
      "2026-11-15",
      "2026-12-15",
      "2027-01-15",
    ]);
    assert.deepEqual(
      generateOccurrenceDates(
        { frequency: "MONTH", interval: 1, dayOfMonth: 31 },
        "2026-01-31",
        "2026-05-31",
      ),
      ["2026-01-31", "2026-03-31", "2026-05-31"],
    );
    assert.deepEqual(generateOccurrenceDates(secondMonday, "2026-10-12", "2026-12-14"), [
      "2026-10-12",
      "2026-11-09",
      "2026-12-14",
    ]);
    assert.deepEqual(generateOccurrenceDates(firstAndThirdSaturday, "2026-10-03", "2026-10-31"), [
      "2026-10-03",
      "2026-10-17",
    ]);
    assert.deepEqual(generateOccurrenceDates(lastFriday, "2026-10-30", "2026-11-30"), [
      "2026-10-30",
      "2026-11-27",
    ]);
  });

  it("crosses month and year boundaries without drifting off the weekday", () => {
    assert.deepEqual(generateOccurrenceDates(biweeklyTuesday, "2026-10-20", "2026-11-03"), [
      "2026-10-20",
      "2026-11-03",
    ]);
    assert.deepEqual(generateOccurrenceDates(weeklyMonday, "2026-12-28", "2027-01-11"), [
      "2026-12-28",
      "2027-01-04",
      "2027-01-11",
    ]);
  });

  it("keeps the same weekday across the daylight-saving change", () => {
    assert.deepEqual(generateOccurrenceDates(weeklyMonday, "2026-03-02", "2026-03-16"), [
      "2026-03-02",
      "2026-03-09",
      "2026-03-16",
    ]);
    assert.equal(calculateNextOccurrence(weeklyMonday, "2026-03-02", "2026-03-08"), "2026-03-09");
  });

  it("does not generate a duplicate date that already exists", () => {
    const dates = generateOccurrenceDates(biweeklyTuesday, "2026-10-06", "2026-11-03");
    const existing = new Set(dates);
    const again = generateOccurrenceDates(biweeklyTuesday, "2026-10-06", "2026-11-17").filter((date) =>
      shouldGenerateOccurrence(existing, date),
    );
    assert.deepEqual(again, ["2026-11-17"]);
  });

  it("rejects a start date that is not on the pattern", () => {
    const result = validateRecurrenceRule(weeklyMonday, "2026-10-06");
    assert.equal(result.ok, false);
  });
});

describe("recurring edits and staffing", () => {
  const dates = ["2026-10-06", "2026-10-20", "2026-11-03"];

  it("keeps a one-occurrence edit off the series and off other dates", () => {
    assert.deepEqual(determineRecurringEditScope("THIS_ONLY", "2026-10-20", dates), {
      updateSeries: false,
      dates: ["2026-10-20"],
    });
  });

  it("updates this and future dates without touching earlier occurrences", () => {
    assert.deepEqual(determineRecurringEditScope("THIS_AND_FUTURE", "2026-10-20", dates), {
      updateSeries: true,
      dates: ["2026-10-20", "2026-11-03"],
    });
  });

  it("copies independent invitation records and snapshots pay", () => {
    const entry = template();
    let n = 0;
    const first = copyStaffingTemplateToOccurrence({
      jobId: "job-oct-6",
      serviceDate: "2026-10-06",
      template: [entry],
      mode: "INVITE",
      nowIso: "2026-09-26T00:00:00.000Z",
      newId: () => `a-${n++}`,
    });
    const second = copyStaffingTemplateToOccurrence({
      jobId: "job-oct-20",
      serviceDate: "2026-10-20",
      template: [entry],
      mode: "INVITE",
      nowIso: "2026-09-26T00:00:00.000Z",
      newId: () => `b-${n++}`,
    });
    entry.payPerPersonCents = 9_999;
    first[0].payPerPersonCents = 1;
    assert.equal(second[0].payPerPersonCents, 5_000);
    assert.equal(second[0].jobId, "job-oct-20");
    assert.equal(first[0].jobId, "job-oct-6");
    assert.equal(first[0].status, "INVITED");
    assert.notEqual(first[0].assignmentId, second[0].assignmentId);
  });

  it("leaves future cleanings unassigned when that staffing option is chosen", () => {
    const plan = planOccurrenceStaffing({
      jobId: "job-1",
      serviceDate: "2026-10-20",
      headcountNeeded: 2,
      mode: "BLANK",
      template: [template()],
      cleaners: [],
      availabilityByCleaner: {},
      confirmedAssignments: [],
      nowIso: "2026-09-26T00:00:00.000Z",
      newId: () => "unused",
    });
    assert.deepEqual(plan.assignments, []);
    assert.equal(calculateConfirmedHeadcount(plan.assignments), 0);
    assert.equal(calculateRemainingHeadcount(2, plan.assignments), 2);
  });

  it("does not invite a non-approved cleaner with a crew larger than 1", () => {
    const plan = planOccurrenceStaffing({
      jobId: "job-1",
      serviceDate: "2026-10-20",
      headcountNeeded: 3,
      mode: "INVITE",
      template: [template({ cleanerId: "maria", proposedCrewSize: 2 })],
      cleaners: [{ cleanerId: "maria", firstName: "Maria", status: "ACTIVE", helpersApproved: false }],
      availabilityByCleaner: {},
      confirmedAssignments: [],
      nowIso: "2026-09-26T00:00:00.000Z",
      newId: () => "a1",
    });
    assert.equal(plan.assignments.length, 0);
    assert.match(plan.attention[0].reason, /not approved to bring helpers/);
  });

  it("invites an approved cleaner without confirming the series", () => {
    const plan = planOccurrenceStaffing({
      jobId: "job-oct-6",
      serviceDate: "2026-10-06",
      headcountNeeded: 3,
      mode: "INVITE",
      template: [template()],
      cleaners: [{ cleanerId: "claudia", firstName: "Claudia", status: "ACTIVE", helpersApproved: true }],
      availabilityByCleaner: {},
      confirmedAssignments: [],
      nowIso: "2026-09-26T00:00:00.000Z",
      newId: () => "a1",
    });
    assert.equal(plan.assignments.length, 1);
    assert.equal(plan.assignments[0].status, "INVITED");
    assert.equal(plan.assignments[0].confirmedCrewSize, undefined);
    assert.equal(plan.assignments[0].payPerPersonCents, 5_000);
    assert.equal(plan.assignments[0].proposedTotalPayCents, 10_000);
  });

  it("does not directly assign a cleaner onto a conflicting confirmed job", () => {
    const conflict: JobAssignment = {
      assignmentId: "existing",
      jobId: "other-job",
      cleanerId: "claudia",
      serviceDate: "2026-10-06",
      status: "CONFIRMED",
      proposedCrewSize: 1,
      confirmedCrewSize: 1,
      arrivalWindowStart: "09:00",
      arrivalWindowEnd: "10:00",
      expectedDurationMinutes: 240,
      payType: "FLAT",
      payPerPersonCents: 5_000,
      proposedTotalPayCents: 5_000,
      confirmedTotalPayCents: 5_000,
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-01T00:00:00.000Z",
    };
    const plan = planOccurrenceStaffing({
      jobId: "job-oct-6",
      serviceDate: "2026-10-06",
      headcountNeeded: 2,
      mode: "DIRECT",
      template: [template({ proposedCrewSize: 1, payPerPersonCents: 5_000 })],
      cleaners: [{ cleanerId: "claudia", firstName: "Claudia", status: "ACTIVE", helpersApproved: true }],
      availabilityByCleaner: {
        claudia: {
          submitted: true,
          windows: [{ date: "2026-10-06", start: "08:00", end: "17:00" }],
        },
      },
      confirmedAssignments: [conflict],
      nowIso: "2026-09-26T00:00:00.000Z",
      newId: () => "new",
    });
    assert.equal(plan.assignments.length, 0);
    assert.match(plan.attention[0].reason, /conflicts with another confirmed job/);
  });

  it("does not directly confirm a week the cleaner has not submitted", () => {
    const plan = planOccurrenceStaffing({
      jobId: "job-oct-6",
      serviceDate: "2026-10-06",
      headcountNeeded: 2,
      mode: "DIRECT",
      template: [template({ proposedCrewSize: 1 })],
      cleaners: [{ cleanerId: "claudia", firstName: "Claudia", status: "ACTIVE", helpersApproved: true }],
      availabilityByCleaner: { claudia: { submitted: false, windows: [] } },
      confirmedAssignments: [],
      nowIso: "2026-09-26T00:00:00.000Z",
      newId: () => "new",
    });
    assert.equal(plan.assignments.length, 0);
    assert.match(plan.attention[0].reason, /has not submitted availability/);
  });
});
