import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { runAvailabilityWeekOpenCron } from "./availability-week-open-cron.ts";
import { availabilityWeekOpenSmsBody } from "./availability-week-sms-copy.ts";
import { emptyHub } from "../mock/seed.ts";

describe("availabilityWeekOpenSmsBody", () => {
  it("mentions the week range and deadline", () => {
    const body = availabilityWeekOpenSmsBody({
      cleanerFirstName: "Claudia",
      weekStart: "2026-11-10",
      weekEnd: "2026-11-16",
    });
    assert.match(body, /submit your availability for the week of Nov 10 – Nov 16/);
    assert.match(body, /by Sunday/);
  });
});

describe("runAvailabilityWeekOpenCron", () => {
  it("does not run on non-Mondays", async () => {
    const hub = emptyHub("2026-11-04");
    const result = await runAvailabilityWeekOpenCron(hub, new Date("2026-11-04T16:00:00-08:00"));
    assert.equal(result.ran, false);
  });
});
