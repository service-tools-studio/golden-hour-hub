import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildCleanerAssignmentCalendarEvent,
  CLEANER_CALENDAR_DEFAULT_DURATION_MINUTES,
} from "./calendar-event.ts";
import type { Job, JobAssignment } from "../domain/types.ts";

function stubJob(): Job {
  return {
    jobId: "job-1",
    customerId: "c-1",
    propertyId: "p-1",
    serviceType: "DEEP_CLEAN",
    date: "2026-11-25",
    headcountNeeded: 1,
    status: "SCHEDULED",
    specialInstructions: "",
    snapshot: {
      customerDisplayName: "Emma Test",
      customerFirstName: "Emma",
      phone: "",
      propertyId: "p-1",
      streetAddress: "123 Main St",
      city: "Portland",
      state: "OR",
      zip: "97211",
      marketId: "portland",
      timeZone: "America/Los_Angeles",
      bedrooms: 3,
      bathrooms: 2,
      squareFeet: 1700,
      preferences: "",
    },
    createdAt: "",
    createdBy: "test",
    updatedAt: "",
    updatedBy: "test",
  };
}

function stubAssignment(overrides: Partial<JobAssignment> = {}): JobAssignment {
  return {
    assignmentId: "as-1",
    jobId: "job-1",
    cleanerId: "cl-1",
    serviceDate: "2026-11-25",
    status: "CONFIRMED",
    proposedCrewSize: 1,
    confirmedCrewSize: 1,
    arrivalWindowStart: "12:00",
    arrivalWindowEnd: "12:00",
    payType: "HOURLY",
    payPerPersonCents: 3500,
    proposedTotalPayCents: 3500,
    confirmedTotalPayCents: 3500,
    createdAt: "",
    updatedAt: "",
    ...overrides,
  };
}

describe("buildCleanerAssignmentCalendarEvent", () => {
  it("returns null when start time is TBD", () => {
    const event = buildCleanerAssignmentCalendarEvent(stubJob(), stubAssignment({ arrivalWindowStart: undefined, arrivalWindowEnd: undefined }));
    assert.equal(event, null);
  });

  it("uses a one-hour block when duration is unset", () => {
    const event = buildCleanerAssignmentCalendarEvent(
      stubJob(),
      stubAssignment({ expectedDurationMinutes: undefined }),
    );
    assert.ok(event);
    const durationMs = event!.end.getTime() - event!.start.getTime();
    assert.equal(durationMs, CLEANER_CALENDAR_DEFAULT_DURATION_MINUTES * 60_000);
  });

  it("uses assignment duration when set", () => {
    const event = buildCleanerAssignmentCalendarEvent(
      stubJob(),
      stubAssignment({ expectedDurationMinutes: 210 }),
    );
    assert.ok(event);
    const durationMs = event!.end.getTime() - event!.start.getTime();
    assert.equal(durationMs, 210 * 60_000);
  });
});