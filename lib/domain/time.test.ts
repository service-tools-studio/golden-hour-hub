import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyAvailabilityTimeWheelPatch,
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
