import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildSyncLinkWorkspace } from "./calendar-sync-link.ts";
import { emptyHub } from "../mock/seed.ts";
import type { Customer, Job, Property } from "../domain/types.ts";

const today = "2026-11-21";

function customer(id: string, first: string, last: string): Customer {
  return {
    customerId: id,
    firstName: first,
    lastName: last,
    phone: "5035550100",
    status: "ACTIVE",
    createdAt: "",
    updatedAt: "",
    createdBy: "test",
    updatedBy: "test",
  };
}

function property(customerId: string): Property {
  return {
    propertyId: "prop-1",
    customerId,
    label: "Home",
    streetAddress: "123 Main St",
    city: "Portland",
    state: "OR",
    zip: "97211",
    marketId: "portland",
    bedrooms: 3,
    bathrooms: 2,
    squareFeet: 1600,
    preferences: "",
    status: "ACTIVE",
    createdAt: "",
    updatedAt: "",
    createdBy: "test",
    updatedBy: "test",
  };
}

function job(overrides: Partial<Job> = {}): Job {
  return {
    jobId: "job-1",
    customerId: "c-1",
    propertyId: "prop-1",
    serviceType: "DEEP_CLEAN",
    date: "2026-11-25",
    arrivalWindowStart: "09:00",
    arrivalWindowEnd: "09:00",
    headcountNeeded: 1,
    status: "SCHEDULED",
    specialInstructions: "",
    snapshot: {
      customerDisplayName: "Courtney Campbell",
      customerFirstName: "Courtney",
      phone: "",
      propertyId: "prop-1",
      streetAddress: "123 Main St",
      city: "Portland",
      state: "OR",
      zip: "97211",
      marketId: "portland",
      timeZone: "America/Los_Angeles",
      bedrooms: 3,
      bathrooms: 2,
      squareFeet: 1600,
      preferences: "",
    },
    createdAt: "",
    createdBy: "test",
    updatedAt: "",
    updatedBy: "test",
    ...overrides,
  };
}

describe("buildSyncLinkWorkspace", () => {
  it("suggests linking when customer and date match", () => {
    const hub = emptyHub(today);
    hub.customers = [customer("c-1", "Courtney", "Campbell")];
    hub.properties = [property("c-1")];
    hub.jobs = [job()];

    const workspace = buildSyncLinkWorkspace(hub, [
      {
        id: "gcal-courtney",
        summary: "Courtney Campbell - Deep clean",
        start: { dateTime: "2026-11-25T09:00:00-08:00" },
        end: { dateTime: "2026-11-25T12:00:00-08:00" },
      },
    ]);

    assert.equal(workspace.suggestions.length, 1);
    assert.equal(workspace.suggestions[0]!.jobId, "job-1");
    assert.equal(workspace.suggestions[0]!.confidence, "high");
    assert.equal(workspace.unlinkedJobs.length, 1);
    assert.equal(workspace.unlinkedEvents.length, 1);
  });

  it("counts already-linked pairs", () => {
    const hub = emptyHub(today);
    hub.customers = [customer("c-1", "Courtney", "Campbell")];
    hub.properties = [property("c-1")];
    hub.jobs = [job({ googleCalendarEventId: "gcal-courtney" })];

    const workspace = buildSyncLinkWorkspace(hub, [
      {
        id: "gcal-courtney",
        summary: "Courtney Campbell",
        start: { dateTime: "2026-11-25T09:00:00-08:00" },
        end: { dateTime: "2026-11-25T12:00:00-08:00" },
      },
    ]);

    assert.equal(workspace.linkedPairs, 1);
    assert.equal(workspace.suggestions.length, 0);
    assert.equal(workspace.unlinkedJobs.length, 0);
  });
});