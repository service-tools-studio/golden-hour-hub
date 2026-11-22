import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CalendarImport } from "../domain/types.ts";
import {
  calendarImportIdForGoogleEvent,
  dedupeCalendarImportsByGoogleEventId,
  pickCanonicalCalendarImport,
} from "./calendar-import-canonical.ts";

function stubImport(overrides: Partial<CalendarImport> & Pick<CalendarImport, "importId" | "googleCalendarEventId">): CalendarImport {
  return {
    status: "PENDING_REVIEW",
    serviceDate: "2026-11-23",
    arrivalWindowStart: "12:45",
    arrivalWindowEnd: "12:45",
    headcountNeeded: 1,
    serviceType: "OTHER",
    specialInstructions: "",
    marketId: "portland",
    raw: { title: "CPU Opt", description: "", location: "" },
    parsed: {},
    createdAt: "2026-11-22T07:27:49.022Z",
    updatedAt: "2026-11-22T07:27:49.022Z",
    lastSyncedAt: "2026-11-22T07:27:49.022Z",
    ...overrides,
  };
}

const gcal = "_6t2jegi26ork6ba28gs34b9k6op3gb9p6cr4cb9l6oo30ea584r36dpo6o";

describe("calendarImportIdForGoogleEvent", () => {
  it("is stable for the same event id", () => {
    const a = calendarImportIdForGoogleEvent(gcal);
    const b = calendarImportIdForGoogleEvent(gcal);
    assert.equal(a, b);
    assert.match(a, /^calimp-gcal-[a-f0-9]{24}$/);
  });
});

describe("pickCanonicalCalendarImport", () => {
  it("prefers pending over withdrawn for the same event", () => {
    const pending = stubImport({
      importId: "calimp-b",
      googleCalendarEventId: gcal,
      status: "PENDING_REVIEW",
      createdAt: "2026-11-22T07:27:50.696Z",
    });
    const withdrawn = stubImport({
      importId: "calimp-a",
      googleCalendarEventId: gcal,
      status: "WITHDRAWN",
    });
    const picked = pickCanonicalCalendarImport([withdrawn, pending]);
    assert.equal(picked?.importId, "calimp-b");
  });
});

describe("dedupeCalendarImportsByGoogleEventId", () => {
  it("collapses duplicates and re-keys to the canonical import id", () => {
    const pending = stubImport({
      importId: "calimp-_6t2jegi26or-mwrillcz",
      googleCalendarEventId: gcal,
      status: "PENDING_REVIEW",
      createdAt: "2026-11-22T07:27:50.696Z",
    });
    const withdrawn = stubImport({
      importId: "calimp-_6t2jegi26or-mwrilkfq",
      googleCalendarEventId: gcal,
      status: "WITHDRAWN",
    });
    const targetId = calendarImportIdForGoogleEvent(gcal);
    const { imports, removedImportIds } = dedupeCalendarImportsByGoogleEventId([pending, withdrawn]);
    assert.equal(imports.length, 1);
    assert.equal(imports[0]!.importId, targetId);
    assert.equal(imports[0]!.status, "PENDING_REVIEW");
    assert.deepEqual(new Set(removedImportIds), new Set([pending.importId, withdrawn.importId]));
  });
});