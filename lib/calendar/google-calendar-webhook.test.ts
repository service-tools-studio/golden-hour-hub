import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  googleCalendarWebhookAuthorized,
  googleCalendarWebhookShouldImport,
} from "./google-calendar-webhook.ts";
import type { GoogleCalendarWatchState } from "../data/google-calendar-watch-state.ts";

const watch: GoogleCalendarWatchState = {
  channelId: "ch-1",
  resourceId: "res-1",
  expirationMs: Date.now() + 86400000,
  channelToken: "secret",
  calendarId: "cal@example.com",
  webhookUrl: "https://hub.example/api/google-calendar/webhook",
  updatedAt: new Date().toISOString(),
};

describe("googleCalendarWebhookAuthorized", () => {
  it("accepts matching channel and token", () => {
    const result = googleCalendarWebhookAuthorized(
      {
        channelId: "ch-1",
        resourceId: "res-1",
        resourceState: "exists",
        channelToken: "secret",
        messageNumber: "1",
      },
      watch,
      "secret",
    );
    assert.equal(result.ok, true);
  });

  it("rejects channel mismatch", () => {
    const result = googleCalendarWebhookAuthorized(
      {
        channelId: "other",
        resourceId: "res-1",
        resourceState: "exists",
        channelToken: "secret",
        messageNumber: "1",
      },
      watch,
      "secret",
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "channel_mismatch");
  });

  it("rejects token mismatch when token configured", () => {
    const result = googleCalendarWebhookAuthorized(
      {
        channelId: "ch-1",
        resourceId: "res-1",
        resourceState: "exists",
        channelToken: "wrong",
        messageNumber: "1",
      },
      watch,
      "secret",
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "token_mismatch");
  });
});

describe("googleCalendarWebhookShouldImport", () => {
  it("imports on sync, exists, and not_exists", () => {
    assert.equal(googleCalendarWebhookShouldImport("sync"), true);
    assert.equal(googleCalendarWebhookShouldImport("exists"), true);
    assert.equal(googleCalendarWebhookShouldImport("not_exists"), true);
    assert.equal(googleCalendarWebhookShouldImport("unknown"), false);
  });
});