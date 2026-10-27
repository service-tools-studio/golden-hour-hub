import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mondayOf } from "../domain/time.ts";
import type { AvailabilityWindow, CleanerProfile } from "../domain/types.ts";
import { emptyHub } from "../mock/seed.ts";
import { updateCleanerAdminOnHub } from "./admin-mutations.ts";
import { submitAvailabilityOnHub } from "./cleaner-mutations.ts";

const STAMP = "2026-10-01T12:00:00.000Z";

function testCleaner(cleanerId: string): CleanerProfile {
  return {
    cleanerId,
    firstName: "Ada",
    lastName: "Cleaner",
    email: `${cleanerId}@example.com`,
    mobilePhone: "5035550100",
    status: "ACTIVE",
    typicalHelperCount: 0,
    maxHelperCount: 0,
    typicalHourlyRateCents: 3000,
    createdAt: STAMP,
    createdBy: "kelsey",
    updatedAt: STAMP,
    updatedBy: "kelsey",
  };
}

function wednesdayWindow(cleanerId: string): AvailabilityWindow {
  return {
    availabilityId: "win-wed",
    cleanerId,
    date: "2026-10-28",
    start: "07:00",
    end: "14:45",
  };
}

describe("hub mutations", () => {
  it("submitAvailabilityOnHub keeps each window on the entered calendar date", () => {
    const cleanerId = "ada";
    const weekStart = mondayOf("2026-10-28");
    const hub = { ...emptyHub("2026-10-27"), cleaners: [testCleaner(cleanerId)] };
    const { hub: next, result } = submitAvailabilityOnHub(hub, cleanerId, weekStart, [
      wednesdayWindow(cleanerId),
      {
        availabilityId: "win-wed-pm",
        cleanerId,
        date: "2026-10-28",
        start: "16:00",
        end: "23:55",
      },
    ]);
    assert.equal(result.ok, true);
    const wednesday = next.availability.filter((window) => window.cleanerId === cleanerId && window.date === "2026-10-28");
    assert.equal(wednesday.length, 2);
    assert.ok(wednesday.every((window) => window.date === "2026-10-28"));
    assert.ok(!next.availability.some((window) => window.cleanerId === cleanerId && window.date === "2026-10-29"));
  });

  it("updateCleanerAdminOnHub after availability keeps the new week windows", () => {
    const cleanerId = "ada";
    const weekStart = mondayOf("2026-10-28");
    const hub = { ...emptyHub("2026-10-27"), cleaners: [testCleaner(cleanerId)] };
    const afterAvailability = submitAvailabilityOnHub(hub, cleanerId, weekStart, [wednesdayWindow(cleanerId)]).hub;
    const { hub: afterProfile } = updateCleanerAdminOnHub(afterAvailability, cleanerId, {
      typicalHelperCount: 1,
      maxHelperCount: 2,
      typicalHourlyRateCents: 4500,
      status: "ACTIVE",
    });
    const wednesday = afterProfile.availability.filter(
      (window) => window.cleanerId === cleanerId && window.date === "2026-10-28",
    );
    assert.equal(wednesday.length, 1);
    assert.equal(wednesday[0]?.start, "07:00");
    assert.equal(wednesday[0]?.end, "14:45");
    const cleaner = afterProfile.cleaners.find((item) => item.cleanerId === cleanerId);
    assert.equal(cleaner?.typicalHourlyRateCents, 4500);
    assert.equal(cleaner?.maxHelperCount, 2);
  });

  it("documents stale spread: spreading a pre-save hub snapshot drops availability", () => {
    const cleanerId = "ada";
    const weekStart = mondayOf("2026-10-28");
    const hub = { ...emptyHub("2026-10-27"), cleaners: [testCleaner(cleanerId)] };
    const staleSnapshot = hub;
    const afterAvailability = submitAvailabilityOnHub(hub, cleanerId, weekStart, [wednesdayWindow(cleanerId)]).hub;
    const profileInput = {
      typicalHelperCount: 0,
      maxHelperCount: 0,
      typicalHourlyRateCents: 5000,
      status: "ACTIVE" as const,
    };
    const updatedCleaners = updateCleanerAdminOnHub(afterAvailability, cleanerId, profileInput).hub.cleaners;
    const buggyMergedHub = { ...staleSnapshot, cleaners: updatedCleaners };
    assert.equal(afterAvailability.availability.length, 1);
    assert.equal(buggyMergedHub.availability.length, 0);
  });
});
