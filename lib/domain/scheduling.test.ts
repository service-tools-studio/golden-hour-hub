import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { copyWeekWindows, listSubmissionStatus, mergeAdjacentWindows } from "./availability.ts";
import {
  calculateConfirmedFlatPay,
  calculateConfirmedHourlyCrewRate,
  calculateFlatPayPerPerson,
} from "./compensation.ts";
import { deriveCrewSettings } from "./cleaners.ts";
import {
  buildCustomerSearchKeys,
  searchCustomers,
  snapshotVisit,
  validateCustomerInput,
} from "./customers.ts";
import {
  calculateBlockedRange,
  calculateConfirmedHeadcount,
  cleaningCoverage,
  calculateRemainingHeadcount,
  claimHeadcount,
  detectConfirmedAssignmentConflict,
  findCompatibleCleaners,
  isCleanerAllowedCrewSize,
  subtractConfirmedBookingsFromAvailability,
  validateAvailabilityEdit,
  validateCleanerSchedule,
  validateRequestedCrewSize,
  type AssignmentSchedule,
} from "./scheduling.ts";
import { addDays, nextAvailabilityWeek, zonedParts, zonedToUtc } from "./time.ts";
import type { AvailabilityWindow, Customer } from "./types.ts";

function schedule(overrides: Partial<AssignmentSchedule> = {}): AssignmentSchedule {
  return {
    assignmentId: "a1",
    cleanerId: "claudia",
    jobId: "job-1",
    status: "CONFIRMED",
    serviceDate: "2026-10-06",
    arrivalWindowStart: "09:00",
    arrivalWindowEnd: "10:00",
    expectedDurationMinutes: 240,
    ...overrides,
  };
}

describe("blocked time and effective availability", () => {
  it("blocks from the arrival window start through the window end plus duration", () => {
    const blocked = calculateBlockedRange({
      date: "2026-10-06",
      arrivalWindowStart: "09:00",
      arrivalWindowEnd: "10:00",
      expectedDurationMinutes: 240,
    });
    assert.equal(blocked.spans.length, 1);
    assert.equal(blocked.spans[0].startMin, 9 * 60);
    assert.equal(blocked.spans[0].endMin, 14 * 60);
  });

  it("keeps Portland noon stable across daylight saving", () => {
    assert.equal(zonedToUtc("2026-01-15", "12:00").toISOString(), "2026-01-15T20:00:00.000Z");
    assert.equal(zonedToUtc("2026-09-26", "12:00").toISOString(), "2026-09-26T19:00:00.000Z");
    assert.equal(zonedToUtc("2026-03-09", "12:00").toISOString(), "2026-03-09T19:00:00.000Z");
  });

  it("spans from the earliest arrival start to the latest expected end", () => {
    const coverage = cleaningCoverage([
      schedule({
        assignmentId: "later",
        status: "INVITED",
        arrivalWindowStart: "11:00",
        arrivalWindowEnd: "11:30",
        expectedDurationMinutes: 180,
      }),
      schedule({ arrivalWindowStart: "09:00", arrivalWindowEnd: "10:00", expectedDurationMinutes: 240 }),
      schedule({
        assignmentId: "declined",
        status: "DECLINED",
        arrivalWindowStart: "07:00",
        arrivalWindowEnd: "08:00",
        expectedDurationMinutes: 600,
      }),
      schedule({ assignmentId: "canceled", status: "CANCELED", arrivalWindowStart: "06:00", arrivalWindowEnd: "07:00" }),
    ]);
    assert.ok(coverage);
    const start = zonedParts(coverage.startUtc);
    const end = zonedParts(coverage.endUtc);
    assert.equal(start.hour, 9);
    assert.equal(start.minute, 0);
    assert.equal(end.hour, 14);
    assert.equal(end.minute, 30);
    assert.equal(cleaningCoverage([schedule({ status: "DECLINED" })]), null);
  });

  it("does not subtract pending invitations from availability", () => {
    const windows = [{ date: "2026-10-06", start: "08:00", end: "17:00" }];
    const remaining = subtractConfirmedBookingsFromAvailability(windows, [
      schedule({ status: "INVITED" }),
      schedule({ assignmentId: "declined", status: "DECLINED" }),
    ]);
    assert.deepEqual(remaining, windows);
  });

  it("subtracts only confirmed bookings and can split a window", () => {
    const remaining = subtractConfirmedBookingsFromAvailability(
      [{ date: "2026-10-06", start: "08:00", end: "17:00" }],
      [schedule()],
    );
    assert.deepEqual(remaining, [
      { date: "2026-10-06", start: "08:00", end: "09:00" },
      { date: "2026-10-06", start: "14:00", end: "17:00" },
    ]);
  });

  it("rejects an availability edit that uncovers a confirmed cleaning", () => {
    const result = validateAvailabilityEdit({
      newWindows: [{ date: "2026-10-06", start: "15:00", end: "18:00" }],
      confirmedAssignments: [schedule(), schedule({ assignmentId: "invite", status: "INVITED", serviceDate: "2026-10-07" })],
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(
        result.message,
        "You already have a cleaning scheduled during this time. Please call Kelsey if you need to change your availability.",
      );
    }
  });

  it("allows an availability edit when confirmed work still fits", () => {
    const result = validateAvailabilityEdit({
      newWindows: [{ date: "2026-10-06", start: "08:00", end: "15:00" }],
      confirmedAssignments: [schedule()],
    });
    assert.equal(result.ok, true);
  });

  it("finds cleaners whose effective availability covers the schedule", () => {
    const cleaners = [
      { cleanerId: "claudia", status: "ACTIVE" as const },
      { cleanerId: "maria", status: "ACTIVE" as const },
    ];
    const compatible = findCompatibleCleaners({
      cleaners,
      windowsByCleaner: {
        claudia: [{ date: "2026-10-06", start: "08:00", end: "17:00" }],
        maria: [{ date: "2026-10-06", start: "08:00", end: "11:00" }],
      },
      confirmedByCleaner: { claudia: [], maria: [] },
      required: {
        date: "2026-10-06",
        arrivalWindowStart: "09:00",
        arrivalWindowEnd: "10:00",
        expectedDurationMinutes: 240,
      },
    });
    assert.deepEqual(
      compatible.map((cleaner) => cleaner.cleanerId),
      ["claudia"],
    );
  });

  it("rejects a schedule that conflicts with a confirmed job", () => {
    const blocked = calculateBlockedRange({
      date: "2026-10-06",
      arrivalWindowStart: "12:00",
      arrivalWindowEnd: "12:30",
      expectedDurationMinutes: 60,
    });
    const result = validateCleanerSchedule({
      cleanerId: "claudia",
      cleanerStatus: "ACTIVE",
      windows: [{ date: "2026-10-06", start: "08:00", end: "17:00" }],
      blocked,
      confirmedAssignments: [schedule()],
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.message, "You already have a confirmed cleaning during this time.");
    }
  });

  it("ignores overlapping invitations when detecting conflicts", () => {
    const blocked = calculateBlockedRange({
      date: "2026-10-06",
      arrivalWindowStart: "09:00",
      arrivalWindowEnd: "10:00",
      expectedDurationMinutes: 240,
    });
    const conflict = detectConfirmedAssignmentConflict({
      cleanerId: "claudia",
      blocked,
      confirmedAssignments: [schedule({ status: "INVITED" })],
    });
    assert.equal(conflict, null);
  });
});

describe("headcount and helper approval", () => {
  it("counts confirmed people, not assignment records", () => {
    const assignments = [
      { status: "CONFIRMED" as const, confirmedCrewSize: 2 },
      { status: "CONFIRMED" as const, confirmedCrewSize: 1 },
      { status: "INVITED" as const, confirmedCrewSize: 4 },
      { status: "DECLINED" as const, confirmedCrewSize: 1 },
    ];
    assert.equal(calculateConfirmedHeadcount(assignments), 3);
    assert.equal(calculateRemainingHeadcount(3, assignments), 0);
  });

  it("lets a helper-approved cleaner confirm 1 or increase when spots remain", () => {
    assert.equal(isCleanerAllowedCrewSize(true, 1), true);
    assert.equal(isCleanerAllowedCrewSize(true, 3), true);
    assert.equal(
      validateRequestedCrewSize({ helpersApproved: true, requestedCrewSize: 1, remainingHeadcount: 3 }).ok,
      true,
    );
    assert.equal(
      validateRequestedCrewSize({ helpersApproved: true, requestedCrewSize: 3, remainingHeadcount: 3 }).ok,
      true,
    );
  });

  it("rejects crew size above remaining headcount", () => {
    const result = validateRequestedCrewSize({
      helpersApproved: true,
      requestedCrewSize: 3,
      remainingHeadcount: 2,
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.message, /2 spots/);
  });

  it("rejects crew size 2 for a cleaner who cannot bring helpers", () => {
    assert.equal(isCleanerAllowedCrewSize(false, 2), false);
    assert.equal(isCleanerAllowedCrewSize(false, 1), true);
    const result = validateRequestedCrewSize({
      helpersApproved: false,
      requestedCrewSize: 2,
      remainingHeadcount: 3,
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.message, "You can only attend on your own for this job.");
  });

  it("forces a non-approved cleaner back to a crew of 1", () => {
    const result = deriveCrewSettings({ helpersApproved: false, typicalHelperCount: 4 });
    assert.deepEqual(result, {
      ok: true,
      helpersApproved: false,
      typicalHelperCount: 0,
      typicalCrewSize: 1,
    });
  });

  it("keeps the final headcount slot safe when two confirmations read the same count", () => {
    const needed = 3;
    const seen = 2;
    const first = claimHeadcount(seen, 1, needed);
    const stale = claimHeadcount(seen, 1, needed);
    assert.equal(first.ok, true);
    assert.equal(stale.ok, true);
    const afterFirst = first.ok ? first.next : seen;
    const second = claimHeadcount(afterFirst, 1, needed);
    assert.equal(second.ok, false);
    if (!second.ok) assert.equal(second.message, "This job was just filled.");
  });
});

describe("compensation", () => {
  it("derives flat per-person pay from the proposed total", () => {
    assert.equal(calculateFlatPayPerPerson(10_000, 2), 5_000);
  });

  it("scales flat pay with the confirmed crew", () => {
    const perPerson = calculateFlatPayPerPerson(10_000, 2);
    assert.equal(calculateConfirmedFlatPay(perPerson, 1), 5_000);
    assert.equal(calculateConfirmedFlatPay(perPerson, 2), 10_000);
    assert.equal(calculateConfirmedFlatPay(perPerson, 3), 15_000);
  });

  it("scales hourly pay per person", () => {
    assert.equal(calculateConfirmedHourlyCrewRate(3_500, 2), 7_000);
  });
});

describe("weekly submission", () => {
  it("targets Sep 28–Oct 4 from Saturday Sep 26", () => {
    assert.deepEqual(nextAvailabilityWeek("2026-09-26"), {
      weekStart: "2026-09-28",
      weekEnd: "2026-10-04",
    });
  });

  it("counts a week as submitted even when the cleaner has zero availability", () => {
    const status = listSubmissionStatus(
      [
        { cleanerId: "maria", firstName: "Maria", lastName: "Santos", status: "ACTIVE" },
        { cleanerId: "manuel", firstName: "Manuel", lastName: "Ortiz", status: "ACTIVE" },
      ],
      [{ cleanerId: "maria", weekStart: "2026-09-28" }],
      "2026-09-28",
    );
    assert.equal(status.find((item) => item.cleanerId === "maria")?.submitted, true);
    assert.equal(status.find((item) => item.cleanerId === "manuel")?.submitted, false);
  });

  it("consolidates adjacent windows on the same day into one block", () => {
    const windows: AvailabilityWindow[] = [
      { availabilityId: "early", cleanerId: "claudia", date: "2026-09-28", start: "08:00", end: "11:00" },
      { availabilityId: "late", cleanerId: "claudia", date: "2026-09-28", start: "11:00", end: "17:00" },
      { availabilityId: "gap", cleanerId: "claudia", date: "2026-09-29", start: "13:00", end: "15:00" },
      { availabilityId: "overlap", cleanerId: "claudia", date: "2026-09-30", start: "08:00", end: "12:00" },
      { availabilityId: "overlap-next", cleanerId: "claudia", date: "2026-09-30", start: "10:00", end: "17:00" },
    ];
    const merged = mergeAdjacentWindows(windows);
    assert.deepEqual(
      merged.map((window) => ({ date: window.date, start: window.start, end: window.end, availabilityId: window.availabilityId })),
      [
        { date: "2026-09-28", start: "08:00", end: "17:00", availabilityId: "early" },
        { date: "2026-09-29", start: "13:00", end: "15:00", availabilityId: "gap" },
        { date: "2026-09-30", start: "08:00", end: "12:00", availabilityId: "overlap" },
        { date: "2026-09-30", start: "10:00", end: "17:00", availabilityId: "overlap-next" },
      ],
    );
  });

  it("copies last week forward without changing the source windows", () => {
    const original: AvailabilityWindow[] = [
      {
        availabilityId: "w1",
        cleanerId: "claudia",
        date: "2026-09-21",
        start: "08:00",
        end: "12:00",
      },
    ];
    let nextId = 0;
    const copied = copyWeekWindows(original, "claudia", "2026-09-21", "2026-09-28", () => `copy-${nextId++}`);
    assert.equal(copied[0].date, "2026-09-28");
    assert.equal(copied[0].availabilityId, "copy-0");
    assert.equal(original[0].date, "2026-09-21");
    assert.equal(addDays("2026-09-21", 7), "2026-09-28");
  });
});

describe("customers", () => {
  const jeff: Customer = {
    customerId: "jeff",
    firstName: "Jeff",
    lastName: "Bachrach",
    phone: "5035551234",
    status: "ACTIVE",
    createdAt: "2026-09-01T00:00:00.000Z",
    createdBy: "kelsey",
    updatedAt: "2026-09-01T00:00:00.000Z",
    updatedBy: "kelsey",
  };
  const main = {
    propertyId: "prop-main",
    customerId: "jeff",
    label: "Main house",
    streetAddress: "123 Main St",
    city: "Portland",
    state: "OR",
    zip: "97214",
    bedrooms: 3,
    bathrooms: 2,
    squareFeet: 1800,
    preferences: "Please use the side entrance.",
    status: "ACTIVE" as const,
    createdAt: "2026-09-01T00:00:00.000Z",
    createdBy: "kelsey",
    updatedAt: "2026-09-01T00:00:00.000Z",
    updatedBy: "kelsey",
  };

  it("searches by name, phone, and street", () => {
    assert.equal(searchCustomers([jeff], [main], "bach").length, 1);
    assert.equal(searchCustomers([jeff], [main], "Jeff Bachrach").length, 1);
    assert.equal(searchCustomers([jeff], [main], "555-1234").length, 1);
    assert.equal(searchCustomers([jeff], [main], "main st").length, 1);
    assert.equal(searchCustomers([jeff], [main], "nobody").length, 0);
  });

  it("builds prefix search keys and snapshots the service location", () => {
    const keys = buildCustomerSearchKeys(jeff);
    assert.ok(keys.nameKeys.includes("bachrach jeff"));
    assert.ok(keys.nameKeys.includes("jeff bachrach"));
    assert.equal(keys.phoneKey, "5035551234");
    assert.equal(keys.phoneLast7, "5551234");
    const snapshot = snapshotVisit(jeff, main);
    assert.equal(snapshot.customerDisplayName, "Jeff Bachrach");
    assert.equal(snapshot.propertyId, "prop-main");
    assert.equal(snapshot.streetAddress, "123 Main St");
    assert.equal(snapshot.preferences, "Please use the side entrance.");
  });

  it("normalizes a valid customer and rejects a bad phone", () => {
    const home = {
      streetAddress: "9 Elm St",
      city: "Portland",
      state: "or",
      zip: "97202",
      bedrooms: 2,
      bathrooms: 1,
      squareFeet: 900,
      preferences: "",
    };
    const valid = validateCustomerInput({
      firstName: " Amy ",
      lastName: "Johnson",
      phone: "(503) 555-0199",
      properties: [home],
    });
    assert.equal(valid.ok, true);
    if (valid.ok) {
      assert.equal(valid.value.phone, "5035550199");
      assert.equal(valid.value.properties[0].state, "OR");
      assert.equal(valid.value.notes, undefined);
    }
    const withNotes = validateCustomerInput({
      firstName: "Amy",
      lastName: "Johnson",
      phone: "(503) 555-0199",
      notes: "  Gate code 1234  ",
      properties: [home],
    });
    assert.equal(withNotes.ok, true);
    if (withNotes.ok) assert.equal(withNotes.value.notes, "Gate code 1234");
    const invalid = validateCustomerInput({
      firstName: "Amy",
      lastName: "Johnson",
      phone: "555",
      properties: [home],
    });
    assert.equal(invalid.ok, false);
    if (!invalid.ok) assert.equal(invalid.field, "phone");
    const missing = validateCustomerInput({
      firstName: "Amy",
      lastName: "Johnson",
      phone: "(503) 555-0199",
      properties: [],
    });
    assert.equal(missing.ok, false);
    if (!missing.ok) assert.equal(missing.field, "properties");
    const address = validateCustomerInput({
      firstName: "Amy",
      lastName: "Johnson",
      phone: "(503) 555-0199",
      properties: [{ ...home, streetAddress: "1" }],
    });
    assert.equal(address.ok, false);
    if (!address.ok) assert.equal(address.field, "properties.0.streetAddress");
  });
});
