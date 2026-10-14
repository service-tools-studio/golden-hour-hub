import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildIcs, eventFromSearchParams, googleCalendarUrl, icsDownloadPath, type CalendarEvent } from "./calendar.ts";

const event: CalendarEvent = {
  uid: "as-mariana-priya@goldenhourhub",
  title: "Golden Hour: Priya Shah – Standard clean",
  start: new Date("2026-10-16T20:00:00.000Z"),
  end: new Date("2026-10-17T00:30:00.000Z"),
  location: "410 Division St, Portland, OR 97202",
  notes: "Arrival window: 1:00 PM – 1:30 PM\nPreferences: Lock the back door; water the ferns.",
};

describe("buildIcs", () => {
  it("writes UTC times and escapes commas, semicolons, and newlines", () => {
    const ics = buildIcs(event, new Date("2026-10-13T22:00:00.000Z"));
    assert.match(ics, /\r\nDTSTART:20261016T200000Z\r\n/);
    assert.match(ics, /\r\nDTEND:20261017T003000Z\r\n/);
    assert.match(ics, /\r\nLOCATION:410 Division St\\, Portland\\, OR 97202\r\n/);
    assert.ok(ics.replace(/\r\n /g, "").includes("1:30 PM\\nPreferences: Lock the back door\\; water the ferns."));
  });

  it("folds lines longer than 75 bytes", () => {
    const ics = buildIcs({ ...event, notes: "x".repeat(200) });
    for (const line of ics.split("\r\n")) assert.ok(new TextEncoder().encode(line).length <= 75, line);
  });
});

describe("calendar links", () => {
  it("round-trips an event through the download path", () => {
    const parsed = eventFromSearchParams(new URL(icsDownloadPath(event), "http://localhost").searchParams);
    assert.deepEqual(parsed, event);
  });

  it("rejects an event whose end is not after its start", () => {
    const params = new URLSearchParams({ title: "Cleaning", start: event.end.toISOString(), end: event.start.toISOString() });
    assert.equal(eventFromSearchParams(params), null);
  });

  it("builds a Google Calendar link with UTC dates", () => {
    const url = new URL(googleCalendarUrl(event));
    assert.equal(url.searchParams.get("dates"), "20261016T200000Z/20261017T003000Z");
  });
});
