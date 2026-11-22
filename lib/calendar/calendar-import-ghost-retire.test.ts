import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CalendarImport } from "../domain/types.ts";
import {
  normalizeDismissedCalendarImportRow,
  retireCalendarImportGhostsForLiveApprovals,
} from "./calendar-import-ghost-retire.ts";
import { emptyHub } from "../mock/seed.ts";

const base: CalendarImport = {
  importId: "calimp-x",
  googleCalendarEventId: "gcal-dead",
  status: "WITHDRAWN",
  serviceDate: "2026-12-15",
  arrivalWindowStart: "15:00",
  arrivalWindowEnd: "15:00",
  serviceType: "RECURRING",
  headcountNeeded: 1,
  specialInstructions: "",
  marketId: "portland",
  raw: { title: "Jim Early", description: "", location: "" },
  parsed: {},
  suggestedCustomerId: "cust-jim",
  createdAt: "",
  updatedAt: "2026-11-19T12:00:00.000Z",
  lastSyncedAt: "",
};

describe("normalizeDismissedCalendarImportRow", () => {
  it("fixes WITHDRAWN rows that still carry a dismiss reason", () => {
    const fixed = normalizeDismissedCalendarImportRow(
      { ...base, rejectedReason: "Dismissed after sync removal" },
      "2026-11-20T12:00:00.000Z",
    );
    assert.equal(fixed.status, "REJECTED");
  });
});

describe("retireCalendarImportGhostsForLiveApprovals", () => {
  it("rejects stale withdrawn rows when live approved import is in the Google feed", () => {
    const live: CalendarImport = {
      ...base,
      importId: "calimp-live",
      googleCalendarEventId: "gcal-live",
      status: "APPROVED",
      approvedJobId: "job-live",
    };
    const hub = {
      ...emptyHub("2026-11-20"),
      jobs: [
        {
          jobId: "job-live",
          customerId: "cust-jim",
          propertyId: "p1",
          serviceType: "RECURRING" as const,
          date: "2026-12-15",
          headcountNeeded: 1,
          googleCalendarEventId: "gcal-live",
          snapshot: {} as import("../domain/types.ts").Job["snapshot"],
          status: "DRAFT" as const,
          createdAt: "",
          createdBy: "t",
          updatedAt: "",
          updatedBy: "t",
          specialInstructions: "",
        },
      ],
    };
    const seen = new Set(["gcal-live"]);
    const result = retireCalendarImportGhostsForLiveApprovals(hub, [base, live], seen, "2026-11-20T12:00:00.000Z");
    assert.equal(result.retired, 1);
    assert.equal(result.imports[0]!.status, "REJECTED");
    assert.equal(result.imports[0]!.rejectedReason, "Superseded by live Gmail link");
  });
});