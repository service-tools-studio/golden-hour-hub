import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { coalesceGcalEventSnapshot } from "./resolve-google-calendar-event.ts";

describe("coalesceGcalEventSnapshot", () => {
  it("fills event id from the link request when snapshot id was omitted", () => {
    const id = "_8go42c9k60pk4ba160qjab9k8krk4ba16kp3aba28d0jge256p130ghm8o";
    const event = coalesceGcalEventSnapshot(
      {
        summary: "Angela bandy",
        start: { dateTime: "2026-11-22T09:00:00-08:00" },
        end: { dateTime: "2026-11-22T10:00:00-08:00" },
      },
      id,
    );
    assert.ok(event);
    assert.equal(event!.id, id);
  });

  it("builds times from serviceDate when start was dropped from the snapshot", () => {
    const id = "_8go42c9k60pk4ba160qjab9k8krk4ba16kp3aba28d0jge256p130ghm8o";
    const event = coalesceGcalEventSnapshot(
      {
        summary: "Angela bandy",
        end: { dateTime: "2026-11-22T10:00:00-08:00" },
      },
      id,
      { serviceDate: "2026-11-22", title: "Angela bandy" },
    );
    assert.ok(event);
    assert.ok(event!.start?.dateTime);
    assert.equal(event!.id, id);
  });
});