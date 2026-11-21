import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { completeAssignmentOnHub } from "./complete-assignment-mutations.ts";
import type { CleanerProfile, Job, JobAssignment } from "../domain/types.ts";
import { emptyHub } from "../mock/seed.ts";

function stubCleaner(overrides: Partial<CleanerProfile> = {}): CleanerProfile {
  return {
    cleanerId: "ada",
    firstName: "Ada",
    lastName: "Lovelace",
    status: "ACTIVE",
    email: "ada@example.com",
    mobilePhone: "5035550101",
    homeMarketId: "portland",
    maxHelperCount: 0,
    typicalHelperCount: 0,
    typicalHourlyRateCents: 3500,
    createdAt: "",
    createdBy: "test",
    updatedAt: "",
    updatedBy: "test",
    ...overrides,
  };
}

function stubJob(overrides: Partial<Job> = {}): Job {
  return {
    jobId: "job-1",
    customerId: "cust-1",
    propertyId: "prop-1",
    serviceType: "DEEP_CLEAN",
    date: "2026-11-25",
    headcountNeeded: 2,
    arrivalWindowStart: "09:00",
    arrivalWindowEnd: "09:00",
    status: "SCHEDULED",
    specialInstructions: "",
    snapshot: {
      customerDisplayName: "Test Customer",
      customerFirstName: "Test",
      phone: "5035550100",
      propertyId: "prop-1",
      streetAddress: "123 Main St",
      city: "Portland",
      state: "OR",
      zip: "97201",
      marketId: "portland",
      timeZone: "America/Los_Angeles",
      bedrooms: 3,
      bathrooms: 2,
      squareFeet: 1500,
      preferences: "",
    },
    draftCleanerIds: ["rio"],
    createdAt: "",
    createdBy: "test",
    updatedAt: "",
    updatedBy: "test",
    ...overrides,
  };
}

function stubAssignment(overrides: Partial<JobAssignment> = {}): JobAssignment {
  return {
    assignmentId: "as-ada",
    jobId: "job-1",
    cleanerId: "ada",
    serviceDate: "2026-11-25",
    status: "CONFIRMED",
    proposedCrewSize: 1,
    confirmedCrewSize: 1,
    arrivalWindowStart: "09:00",
    arrivalWindowEnd: "09:00",
    payType: "HOURLY",
    payPerPersonCents: 3500,
    proposedTotalPayCents: 3500,
    confirmedTotalPayCents: 3500,
    createdAt: "",
    updatedAt: "",
    ...overrides,
  };
}

describe("completeAssignmentOnHub", () => {
  it("does not change job or other assignments when inviting a later cleaner", () => {
    const hub = {
      ...emptyHub("2026-11-20"),
      cleaners: [stubCleaner(), stubCleaner({ cleanerId: "rio", firstName: "Rio", email: "rio@example.com" })],
      jobs: [stubJob()],
      assignments: [stubAssignment()],
    };
    const result = completeAssignmentOnHub(hub, {
      jobId: "job-1",
      cleanerId: "rio",
      propertyId: "prop-1",
      arrivalWindowStart: "10:00",
      arrivalWindowEnd: "10:00",
      proposedCrewSize: 1,
      payType: "HOURLY",
      payPerPersonCents: 3500,
      specialInstructions: "",
      mode: "INVITE",
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    const job = result.hub.jobs.find((item) => item.jobId === "job-1");
    assert.equal(job?.arrivalWindowStart, "09:00");
    assert.equal(job?.arrivalWindowEnd, "09:00");
    const onJob = result.hub.assignments.filter((item) => item.jobId === "job-1" && item.status !== "CANCELED");
    assert.equal(onJob.length, 2);
    const ada = onJob.find((item) => item.cleanerId === "ada");
    const rio = onJob.find((item) => item.cleanerId === "rio");
    assert.equal(ada?.arrivalWindowStart, "09:00");
    assert.equal(rio?.arrivalWindowStart, "10:00");
  });

  it("does not change job or other assignments when saving one assignment's later start", () => {
    const hub = {
      ...emptyHub("2026-11-20"),
      cleaners: [stubCleaner(), stubCleaner({ cleanerId: "rio", firstName: "Rio", email: "rio@example.com" })],
      jobs: [stubJob({ draftCleanerIds: [] })],
      assignments: [
        stubAssignment(),
        stubAssignment({
          assignmentId: "as-rio",
          cleanerId: "rio",
          status: "INVITED",
          arrivalWindowStart: "10:00",
          arrivalWindowEnd: "10:00",
        }),
      ],
    };
    const result = completeAssignmentOnHub(hub, {
      jobId: "job-1",
      assignmentId: "as-rio",
      cleanerId: "rio",
      propertyId: "prop-1",
      arrivalWindowStart: "11:00",
      arrivalWindowEnd: "11:00",
      proposedCrewSize: 1,
      payType: "HOURLY",
      payPerPersonCents: 3500,
      specialInstructions: "",
      mode: "DRAFT",
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    const job = result.hub.jobs.find((item) => item.jobId === "job-1");
    assert.equal(job?.arrivalWindowStart, "09:00");
    const ada = result.hub.assignments.find((item) => item.assignmentId === "as-ada");
    const rio = result.hub.assignments.find((item) => item.assignmentId === "as-rio");
    assert.equal(ada?.arrivalWindowStart, "09:00");
    assert.equal(rio?.arrivalWindowStart, "11:00");
  });

  it("direct assign keeps late invite time and clears duration when job has client defaults", () => {
    const hub = {
      ...emptyHub("2026-11-20"),
      cleaners: [stubCleaner({ cleanerId: "rio", firstName: "Rio" })],
      jobs: [
        stubJob({
          headcountNeeded: 1,
          draftCleanerIds: [],
          arrivalWindowStart: "09:00",
          arrivalWindowEnd: "09:00",
          expectedDurationMinutes: 210,
        }),
      ],
      assignments: [
        stubAssignment({
          assignmentId: "as-rio",
          cleanerId: "rio",
          status: "INVITED",
          arrivalWindowStart: "11:00",
          arrivalWindowEnd: "11:00",
          expectedDurationMinutes: undefined,
        }),
      ],
    };
    const result = completeAssignmentOnHub(hub, {
      jobId: "job-1",
      assignmentId: "as-rio",
      cleanerId: "rio",
      propertyId: "prop-1",
      arrivalWindowStart: "11:00",
      arrivalWindowEnd: "11:00",
      proposedCrewSize: 1,
      payType: "HOURLY",
      payPerPersonCents: 3500,
      specialInstructions: "",
      mode: "DIRECT",
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    const job = result.hub.jobs.find((item) => item.jobId === "job-1");
    assert.equal(job?.arrivalWindowStart, "09:00");
    assert.equal(job?.expectedDurationMinutes, 210);
    const rio = result.hub.assignments.find((item) => item.assignmentId === "as-rio");
    assert.equal(rio?.status, "CONFIRMED");
    assert.equal(rio?.arrivalWindowStart, "11:00");
    assert.equal(rio?.expectedDurationMinutes, undefined);
  });
});