import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Job } from "../domain/types.ts";
import { emptyHub } from "../mock/seed.ts";
import { isGeneratedSeriesJobId, removeAllRecurringSchedulesFromHub } from "./remove-recurring-schedules.ts";

describe("removeAllRecurringSchedulesFromHub", () => {
  it("removes series, horizon jobs, and detaches past visits", () => {
    const hub = emptyHub("2026-11-21");
    hub.series = [
      {
        seriesId: "series-1",
        customerId: "c1",
        propertyId: "p1",
        recurrence: { frequency: "WEEK", interval: 1, daysOfWeek: ["WEDNESDAY"] },
        startDate: "2026-11-05",
        endMode: "UNTIL_CANCELED",
        defaultHeadcountNeeded: 1,
        defaultArrivalWindowStart: "09:00",
        defaultArrivalWindowEnd: "09:00",
        defaultServiceType: "RECURRING",
        staffingTemplateMode: "BLANK",
        staffingTemplate: [],
        status: "ACTIVE",
        generatedThroughDate: "2026-11-21",
        createdAt: "",
        updatedAt: "",
        createdBy: "test",
        updatedBy: "test",
      },
    ];
  const snapshot = {
    customerDisplayName: "A",
    phone: "5035550100",
    propertyId: "p1",
    streetAddress: "1",
    city: "P",
    state: "OR",
    zip: "97201",
    marketId: "portland" as const,
    timeZone: "America/Los_Angeles",
    bedrooms: 2,
    bathrooms: 1,
    squareFeet: 1000,
    preferences: "",
  };
    const jobs: Job[] = [
      {
        jobId: "job-series-1-2026-11-05",
        customerId: "c1",
        propertyId: "p1",
        seriesId: "series-1",
        serviceType: "RECURRING",
        date: "2026-11-05",
        headcountNeeded: 1,
        snapshot,
        specialInstructions: "",
        status: "SCHEDULED",
        createdAt: "",
        createdBy: "test",
        updatedAt: "",
        updatedBy: "test",
      },
      {
        jobId: "job-series-1-2026-11-26",
        customerId: "c1",
        propertyId: "p1",
        seriesId: "series-1",
        serviceType: "RECURRING",
        date: "2026-11-26",
        headcountNeeded: 1,
        snapshot,
        specialInstructions: "",
        status: "SCHEDULED",
        createdAt: "",
        createdBy: "test",
        updatedAt: "",
        updatedBy: "test",
      },
      {
        jobId: "job-legacy-anchor",
        customerId: "c1",
        propertyId: "p1",
        seriesId: "series-1",
        serviceType: "RECURRING",
        date: "2026-11-05",
        headcountNeeded: 1,
        snapshot,
        specialInstructions: "",
        status: "SCHEDULED",
        createdAt: "",
        createdBy: "test",
        updatedAt: "",
        updatedBy: "test",
      },
    ];
    hub.jobs = jobs;
    hub.assignments = [];
    assert.equal(isGeneratedSeriesJobId(jobs[0]!), true);
    const { hub: next, removedJobIds } = removeAllRecurringSchedulesFromHub(hub);
    assert.equal(next.series.length, 0);
    assert.ok(removedJobIds.includes("job-series-1-2026-11-26"));
    assert.ok(!next.jobs.some((job: Job) => job.jobId === "job-series-1-2026-11-26"));
    const kept = next.jobs.find((job: Job) => job.jobId === "job-legacy-anchor");
    assert.ok(kept);
    assert.equal(kept?.seriesId, undefined);
  });
});