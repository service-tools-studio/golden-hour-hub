import type { GoogleCalendarWatchState } from "../data/google-calendar-watch-state.ts";

export type GoogleCalendarWebhookHeaders = {
  channelId: string | null;
  resourceId: string | null;
  resourceState: string | null;
  channelToken: string | null;
  messageNumber: string | null;
};

export function readGoogleCalendarWebhookHeaders(request: Request): GoogleCalendarWebhookHeaders {
  return {
    channelId: request.headers.get("x-goog-channel-id"),
    resourceId: request.headers.get("x-goog-resource-id"),
    resourceState: request.headers.get("x-goog-resource-state"),
    channelToken: request.headers.get("x-goog-channel-token"),
    messageNumber: request.headers.get("x-goog-message-number"),
  };
}

export function googleCalendarWebhookAuthorized(
  headers: GoogleCalendarWebhookHeaders,
  watch: GoogleCalendarWatchState | null,
  expectedChannelToken: string,
): { ok: true } | { ok: false; reason: string } {
  if (!watch) {
    return { ok: false, reason: "no_watch_registered" };
  }
  if (!headers.channelId || !headers.resourceId) {
    return { ok: false, reason: "missing_channel_headers" };
  }
  if (headers.channelId !== watch.channelId || headers.resourceId !== watch.resourceId) {
    return { ok: false, reason: "channel_mismatch" };
  }
  const token = expectedChannelToken.trim();
  if (token) {
    const headerToken = headers.channelToken ?? "";
    if (headerToken !== token) {
      return { ok: false, reason: "token_mismatch" };
    }
  }
  return { ok: true };
}

/** Real calendar changes use `exists` / `not_exists`. `sync` is channel setup only — skip heavy import (daily cron backstop). */
export function googleCalendarWebhookShouldImport(resourceState: string | null): boolean {
  if (!resourceState) return false;
  const state = resourceState.toLowerCase();
  return state === "exists" || state === "not_exists";
}