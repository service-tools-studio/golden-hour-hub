import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyAvailabilityTimeWheelPatch,
  scheduleLookbackRangeForMonth,
  scheduleLookbackStart,
  shiftMonth,
  timeFromWheelClock,
  wheelClockFromTime,
} from "./time.ts";

describe("availability time wheel", () => {
  it("maps 12 on the hour wheel to noon when AM was still selected", () => {
    const current = wheelClockFromTime("11:00");
    assert.equal(current.suffix, "AM");
    const next = applyAvailabilityTimeWheelPatch(current, { hour: 12 });
    assert.equal(next.suffix, "PM");
    assert.equal(timeFromWheelClock(next.hour, next.minute, next.suffix), "12:00");
  });

  it("allows midnight when the user explicitly chooses AM at hour 12", () => {
    const atNoon = applyAvailabilityTimeWheelPatch(wheelClockFromTime("08:00"), { hour: 12 });
    assert.equal(timeFromWheelClock(atNoon.hour, atNoon.minute, atNoon.suffix), "12:00");
    const midnight = applyAvailabilityTimeWheelPatch(atNoon, { suffix: "AM" });
    assert.equal(timeFromWheelClock(midnight.hour, midnight.minute, midnight.suffix), "00:00");
  });
});

describe("schedule lookback", () => {
  it("starts two calendar months before today", () => {
    assert.equal(scheduleLookbackStart("2026-11-09"), "2026-09-01");
    assert.equal(shiftMonth("2026-01-01", -1), "2025-12-01");
  });

  it("loads only past days inside the current and previous two months", () => {
    assert.deepEqual(scheduleLookbackRangeForMonth("2026-09-01", "2026-11-09"), {
      start: "2026-09-01",
      end: "2026-09-30",
    });
    assert.deepEqual(scheduleLookbackRangeForMonth("2026-10-01", "2026-11-09"), {
      start: "2026-10-01",
      end: "2026-10-31",
    });
    assert.deepEqual(scheduleLookbackRangeForMonth("2026-11-01", "2026-11-09"), {
      start: "2026-11-01",
      end: "2026-11-08",
    });
    assert.equal(scheduleLookbackRangeForMonth("2026-08-01", "2026-11-09"), null);
    assert.equal(scheduleLookbackRangeForMonth("2026-12-01", "2026-11-09"), null);
  });
});
