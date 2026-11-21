import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { reopenCalendarImportOnHub } from "./calendar-import-mutations.ts";
import type { CalendarImport } from "../domain/types.ts";
import { emptyHub } from "../mock/seed.ts";

function stubImport(overrides: Partial<CalendarImport> = {}): CalendarImport {
  return {
    importId: "calimp-1",
    googleCalendarEventId: "evt-1",
    status: "REJECTED",
    serviceDate: "2026-11-20",
    arrivalWindowStart: "09:00",
    arrivalWindowEnd: "09:00",
    serviceType: "DEEP_CLEAN",
    headcountNeeded: 1,
    specialInstructions: "",
    rejectedReason: "Dismissed by admin",
    marketId: "portland",
    raw: { title: "Test", description: "", location: "" },
    parsed: {},
    createdAt: "",
    updatedAt: "",
    lastSyncedAt: "",
    ...overrides,
  };
}

describe("reopenCalendarImportOnHub", () => {
  it("returns REJECTED import to PENDING_REVIEW", () => {
    const hub = { ...emptyHub("2026-11-20"), calendarImports: [stubImport()] };
    const result = reopenCalendarImportOnHub(hub, "calimp-1");
    assert.equal(result.ok, true);
    if (!result.ok) return;
    const row = result.hub.calendarImports[0];
    assert.equal(row?.status, "PENDING_REVIEW");
    assert.equal(row?.rejectedReason, undefined);
  });

  it("returns WITHDRAWN import to PENDING_REVIEW", () => {
    const hub = { ...emptyHub("2026-11-20"), calendarImports: [stubImport({ status: "WITHDRAWN" })] };
    const result = reopenCalendarImportOnHub(hub, "calimp-1");
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.hub.calendarImports[0]?.status, "PENDING_REVIEW");
    assert.match(result.message ?? "", /Check Gmail/i);
  });

  it("refuses when the same Google event is already pending", () => {
    const hub = {
      ...emptyHub("2026-11-20"),
      calendarImports: [
        stubImport(),
        stubImport({
          importId: "calimp-2",
          status: "PENDING_REVIEW",
          googleCalendarEventId: "evt-1",
        }),
      ],
    };
    const result = reopenCalendarImportOnHub(hub, "calimp-1");
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.match(result.message, /already waiting/i);
  });
});