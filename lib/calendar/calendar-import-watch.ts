import { randomUUID } from "node:crypto";
import {
  googleCalendarImportConfigured,
  googleCalendarWatchChannelToken,
  googleCalendarWebhookUrl,
  stopGoogleCalendarWatchChannel,
  watchGoogleCalendarEvents,
} from "../services/google-calendar-client.ts";
import { readGoogleCalendarWatchState, writeGoogleCalendarWatchState } from "../data/google-calendar-watch-state.ts";

const RENEW_BEFORE_MS = 48 * 60 * 60 * 1000;

export async function ensureGoogleCalendarWatchChannel(): Promise<{
  configured: boolean;
  renewed: boolean;
  message?: string;
}> {
  if (!googleCalendarImportConfigured()) {
    return { configured: false, renewed: false, message: "Calendar import not configured." };
  }

  const webhookUrl = googleCalendarWebhookUrl();
  if (!webhookUrl) {
    return { configured: true, renewed: false, message: "NEXT_PUBLIC_APP_URL is not set; cannot register watch." };
  }

  const calendarId = process.env.GOOGLE_CALENDAR_ID!.trim();
  const channelToken = googleCalendarWatchChannelToken();
  const existing = await readGoogleCalendarWatchState();
  const now = Date.now();

  if (
    existing &&
    existing.calendarId === calendarId &&
    existing.webhookUrl === webhookUrl &&
    existing.expirationMs > now + RENEW_BEFORE_MS
  ) {
    return { configured: true, renewed: false };
  }

  if (existing?.channelId && existing.resourceId) {
    try {
      await stopGoogleCalendarWatchChannel({
        channelId: existing.channelId,
        resourceId: existing.resourceId,
      });
    } catch (error) {
      console.warn("[gcal:watch] stop previous channel failed", error);
    }
  }

  const channelId = randomUUID();
  try {
    const channel = await watchGoogleCalendarEvents({
      webhookUrl,
      channelId,
      channelToken: channelToken || undefined,
    });
    await writeGoogleCalendarWatchState({
      channelId: channel.channelId,
      resourceId: channel.resourceId,
      expirationMs: channel.expirationMs,
      channelToken,
      calendarId,
      webhookUrl,
      updatedAt: new Date().toISOString(),
    });
    console.info("[gcal:watch] registered", {
      channelId: channel.channelId,
      expires: new Date(channel.expirationMs).toISOString(),
    });
    return { configured: true, renewed: true };
  } catch (error) {
    console.error("[gcal:watch] register failed", error);
    return { configured: true, renewed: false, message: "Could not register Google Calendar watch." };
  }
}