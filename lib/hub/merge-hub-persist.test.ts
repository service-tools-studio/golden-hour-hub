import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mergeHubPersistAttempt } from "./merge-hub-persist.ts";
import type { HubData } from "../mock/seed.ts";
import type { Job } from "../domain/types.ts";

function baseHub(overrides: Partial<HubData> = {}): HubData {
  return {
    today: "2026-03-01",
    cleaners: [],
    customers: [],
    properties: [],
    series: [],
    jobs: [],
    assignments: [],
    availability: [],
    submissions: [],
    contractorQuestionnaireSubmissions: [],
    ...overrides,
  };
}

function job(jobId: string, updatedAt: string): Job {
  return {
    jobId,
    customerId: "cust-1",
    propertyId: "prop-1",
    serviceType: "OTHER",
    date: "2026-03-10",
    headcountNeeded: 1,
    expectedDurationMinutes: 240,
    draftCleanerIds: [],
    snapshot: {
      customerDisplayName: "Test",
      phone: "5555555555",
      propertyId: "prop-1",
      streetAddress: "1 Main",
      city: "LA",
      state: "CA",
      zip: "90001",
      bedrooms: 2,
      bathrooms: 1,
      squareFeet: 1000,
      preferences: "",
    },
    specialInstructions: "",
    status: "DRAFT",
    createdAt: updatedAt,
    createdBy: "a",
    updatedAt,
    updatedBy: "a",
  };
}

describe("mergeHubPersistAttempt", () => {
  it("keeps a new job from the local attempt", () => {
    const server = baseHub({ jobs: [job("job-old", "2026-03-01T10:00:00.000Z")] });
    const local = baseHub({
      jobs: [job("job-old", "2026-03-01T10:00:00.000Z"), job("job-new", "2026-03-01T11:00:00.000Z")],
    });
    const merged = mergeHubPersistAttempt(server, local);
    assert.equal(merged.jobs.length, 2);
    assert.ok(merged.jobs.some((item) => item.jobId === "job-new"));
  });

  it("prefers newer updatedAt for the same job", () => {
    const server = baseHub({ jobs: [job("job-1", "2026-03-01T12:00:00.000Z")] });
    const local = baseHub({ jobs: [job("job-1", "2026-03-01T11:00:00.000Z")] });
    const merged = mergeHubPersistAttempt(server, local);
    assert.equal(merged.jobs[0]?.updatedAt, "2026-03-01T12:00:00.000Z");
  });

  it("applies a newer local edit over server", () => {
    const server = baseHub({ jobs: [job("job-1", "2026-03-01T10:00:00.000Z")] });
    const local = baseHub({ jobs: [job("job-1", "2026-03-01T13:00:00.000Z")] });
    const merged = mergeHubPersistAttempt(server, local);
    assert.equal(merged.jobs[0]?.updatedAt, "2026-03-01T13:00:00.000Z");
  });

  it("keeps server availability when the admin persist snapshot is stale", () => {
    const server = baseHub({
      availability: [
        {
          availabilityId: "win-1",
          cleanerId: "ada",
          date: "2026-03-10",
          start: "09:00",
          end: "17:00",
        },
      ],
    });
    const local = baseHub({ jobs: [job("job-new", "2026-03-01T11:00:00.000Z")] });
    const merged = mergeHubPersistAttempt(server, local);
    assert.equal(merged.availability.length, 1);
    assert.equal(merged.availability[0]?.availabilityId, "win-1");
    assert.ok(merged.jobs.some((item) => item.jobId === "job-new"));
  });
});
