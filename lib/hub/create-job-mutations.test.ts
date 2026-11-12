import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createJobOnHub } from "./create-job-mutations.ts";
import { buildSeed } from "../mock/seed.ts";

describe("createJobOnHub optional duration", () => {
  it("creates a one-time cleaning without a duration estimate", () => {
    const hub = buildSeed("2026-11-11");
    const customer = hub.customers[0];
    const property = hub.properties.find((item) => item.customerId === customer.customerId);
    assert.ok(property);
    const result = createJobOnHub(
      hub,
      {
        date: hub.today,
        customerId: customer.customerId,
        propertyId: property.propertyId,
        serviceType: "DEEP_CLEAN",
        arrivalWindowStart: "09:00",
        arrivalWindowEnd: "09:00",
        headcountNeeded: 1,
        cleanerIds: [],
        specialInstructions: "",
      },
      "tester",
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;
    const job = result.hub.jobs.find((item) => item.jobId === result.jobId);
    assert.ok(job);
    assert.equal(job.expectedDurationMinutes, undefined);
  });
});
