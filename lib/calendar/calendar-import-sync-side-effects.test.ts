import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  calendarCanceledCleanerIdsFromHub,
  calendarRescheduleStaffingCleanerIdsFromHub,
  calendarImportMissingFromGoogleSync,
  calendarImportShouldWithdrawFromGoogleSync,
  cancelJobFromCalendarSync,
  mergeJobPartitionIntoHub,
  rescheduleJobFromCalendarSync,
} from "./calendar-import-sync-side-effects.ts";
import type { CalendarImport, Job } from "../domain/types.ts";
import { emptyHub } from "../mock/seed.ts";

function stubImport(overrides: Partial<CalendarImport> = {}): CalendarImport {
  return {
    importId: "calimp-1",
    googleCalendarEventId: "evt-1",
    status: "PENDING_REVIEW",
    serviceDate: "2026-11-20",
    arrivalWindowStart: "09:00",
    arrivalWindowEnd: "09:00",
    serviceType: "DEEP_CLEAN",
    headcountNeeded: 1,
    specialInstructions: "",
    marketId: "portland",
    raw: { title: "Test", description: "", location: "" },
    parsed: {},
    createdAt: "",
    updatedAt: "",
    lastSyncedAt: "",
    ...overrides,
  };
}

function stubJob(overrides: Partial<Job> = {}): Job {
  return {
    jobId: "job-1",
    customerId: "cust-1",
    propertyId: "prop-1",
    serviceType: "DEEP_CLEAN",
    date: "2026-11-20",
    headcountNeeded: 1,
    snapshot: {
      customerDisplayName: "A B",
      phone: "",
      propertyId: "prop-1",
      streetAddress: "1 Main",
      city: "Portland",
      state: "OR",
      zip: "97201",
      marketId: "portland",
      timeZone: "America/Los_Angeles",
      bedrooms: 2,
      bathrooms: 1,
      squareFeet: 1000,
      preferences: "",
    },
    specialInstructions: "",
    status: "DRAFT",
    createdAt: "",
    createdBy: "test",
    updatedAt: "",
    updatedBy: "test",
    ...overrides,
  };
}

describe("calendar import sync side effects", () => {
  it("still withdraws approved imports when Google drops the event", () => {
    assert.equal(
      calendarImportShouldWithdrawFromGoogleSync(stubImport({ status: "APPROVED", approvedJobId: "job-1" }), "job-1"),
      true,
    );
    assert.equal(
      calendarImportShouldWithdrawFromGoogleSync(
        stubImport({ status: "REJECTED", matchedJobId: "job-1" }),
        undefined,
      ),
      false,
    );
    assert.equal(
      calendarImportShouldWithdrawFromGoogleSync(
        stubImport({ status: "REJECTED", matchedJobId: "job-1" }),
        "job-1",
      ),
      true,
    );
  });

  it("flags imports missing from Google inside the sync window", () => {
    const seen = new Set(["evt-other"]);
    assert.equal(
      calendarImportMissingFromGoogleSync(stubImport(), seen, "2026-11-01", "2026-12-31"),
      true,
    );
    assert.equal(
      calendarImportMissingFromGoogleSync(
        stubImport({ status: "APPROVED" }),
        seen,
        "2026-11-01",
        "2026-12-31",
      ),
      true,
    );
    assert.equal(
      calendarImportMissingFromGoogleSync(
        stubImport({ googleCalendarEventId: "evt-1" }),
        new Set(["evt-1"]),
        "2026-11-01",
        "2026-12-31",
      ),
      false,
    );
    assert.equal(
      calendarImportMissingFromGoogleSync(
        stubImport({ serviceDate: "2027-01-01" }),
        seen,
        "2026-11-01",
        "2026-12-31",
      ),
      false,
    );
  });

  it("collects confirmed cleaners before canceling assignments", () => {
    const hub = {
      ...emptyHub("2026-11-20"),
      jobs: [stubJob()],
      assignments: [
        {
          assignmentId: "a-1",
          jobId: "job-1",
          cleanerId: "cleaner-1",
          serviceDate: "2026-11-20",
          status: "CONFIRMED" as const,
          proposedCrewSize: 1,
          payType: "FLAT" as const,
          payPerPersonCents: 10000,
          proposedTotalPayCents: 10000,
          arrivalWindowStart: "09:00",
          arrivalWindowEnd: "09:00",
          createdAt: "",
          updatedAt: "",
        },
        {
          assignmentId: "a-2",
          jobId: "job-1",
          cleanerId: "cleaner-2",
          serviceDate: "2026-11-20",
          status: "INVITED" as const,
          proposedCrewSize: 1,
          payType: "FLAT" as const,
          payPerPersonCents: 10000,
          proposedTotalPayCents: 10000,
          arrivalWindowStart: "09:00",
          arrivalWindowEnd: "09:00",
          createdAt: "",
          updatedAt: "",
        },
      ],
    };
    assert.deepEqual(calendarCanceledCleanerIdsFromHub(hub, "job-1"), ["cleaner-1"]);
    assert.deepEqual(calendarRescheduleStaffingCleanerIdsFromHub(hub, "job-1"), ["cleaner-1", "cleaner-2"]);
  });

  it("cancels a linked hub job when the calendar event is removed", () => {
    const hub = {
      ...emptyHub("2026-11-20"),
      jobs: [stubJob()],
      assignments: [
        {
          assignmentId: "a-1",
          jobId: "job-1",
          cleanerId: "cleaner-1",
          serviceDate: "2026-11-20",
          status: "CONFIRMED" as const,
          proposedCrewSize: 1,
          payType: "FLAT" as const,
          payPerPersonCents: 10000,
          proposedTotalPayCents: 10000,
          arrivalWindowStart: "09:00",
          arrivalWindowEnd: "09:00",
          createdAt: "",
          updatedAt: "",
        },
      ],
    };
    const next = cancelJobFromCalendarSync(hub, "job-1");
    assert.equal(next.jobs[0]!.status, "CANCELED");
    assert.equal(next.assignments[0]!.status, "CANCELED");
  });

  it("merges a job partition into hub for staffing checks", () => {
    const hub = { ...emptyHub("2026-11-20"), jobs: [], assignments: [] };
    const slice = {
      ...emptyHub("2026-11-20"),
      jobs: [stubJob()],
      assignments: [
        {
          assignmentId: "a-1",
          jobId: "job-1",
          cleanerId: "cleaner-1",
          serviceDate: "2026-11-20",
          status: "INVITED" as const,
          proposedCrewSize: 1,
          payType: "FLAT" as const,
          payPerPersonCents: 10000,
          proposedTotalPayCents: 10000,
          arrivalWindowStart: "09:00",
          arrivalWindowEnd: "09:00",
          createdAt: "",
          updatedAt: "",
        },
      ],
    };
    const merged = mergeJobPartitionIntoHub(hub, slice, "job-1");
    assert.deepEqual(calendarRescheduleStaffingCleanerIdsFromHub(merged, "job-1"), ["cleaner-1"]);
  });

  it("moves job date and arrival when calendar reschedules", () => {
    const hub = {
      ...emptyHub("2026-11-20"),
      jobs: [stubJob()],
      assignments: [
        {
          assignmentId: "a-1",
          jobId: "job-1",
          cleanerId: "cleaner-1",
          serviceDate: "2026-11-20",
          notifiedServiceDate: "2026-11-20",
          status: "INVITED" as const,
          proposedCrewSize: 1,
          payType: "FLAT" as const,
          payPerPersonCents: 10000,
          proposedTotalPayCents: 10000,
          arrivalWindowStart: "09:00",
          arrivalWindowEnd: "09:00",
          createdAt: "",
          updatedAt: "",
        },
      ],
    };
    const next = rescheduleJobFromCalendarSync(hub, "job-1", {
      date: "2026-11-22",
      arrivalWindowStart: "13:00",
      arrivalWindowEnd: "13:00",
    });
    assert.equal(next.jobs[0]!.date, "2026-11-22");
    assert.equal(next.jobs[0]!.arrivalWindowStart, "13:00");
    assert.equal(next.assignments[0]!.serviceDate, "2026-11-22");
    assert.equal(next.assignments[0]!.needsDateReinvite, true);
  });
});