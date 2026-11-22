import { NextResponse } from "next/server";
import { runCalendarImportCron } from "@/lib/calendar/calendar-import-cron";
import {
  googleCalendarWebhookAuthorized,
  googleCalendarWebhookShouldImport,
  readGoogleCalendarWebhookHeaders,
} from "@/lib/calendar/google-calendar-webhook";
import { readGoogleCalendarWatchState } from "@/lib/data/google-calendar-watch-state";
import { dynamoConfigured } from "@/lib/data/repository";
import { loadHubForCalendarImportApply } from "@/lib/calendar/calendar-import-hub-load";
import { googleCalendarImportConfigured, googleCalendarWatchChannelToken } from "@/lib/services/google-calendar-client";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!googleCalendarImportConfigured()) {
    return new NextResponse(null, { status: 204 });
  }

  const headers = readGoogleCalendarWebhookHeaders(request);
  const watch = await readGoogleCalendarWatchState();
  const auth = googleCalendarWebhookAuthorized(headers, watch, googleCalendarWatchChannelToken());
  if (!auth.ok) {
    console.warn("[gcal:webhook] rejected", auth.reason, {
      messageNumber: headers.messageNumber,
      resourceState: headers.resourceState,
    });
    return new NextResponse(null, { status: 403 });
  }

  if (!googleCalendarWebhookShouldImport(headers.resourceState)) {
    return new NextResponse(null, { status: 204 });
  }

  if (!dynamoConfigured()) {
    console.error("[gcal:webhook] DynamoDB not configured");
    return new NextResponse(null, { status: 503 });
  }

  try {
    const hub = await loadHubForCalendarImportApply();
    const result = await runCalendarImportCron(hub);
    console.info("[gcal:webhook] import", {
      messageNumber: headers.messageNumber,
      resourceState: headers.resourceState,
      ...result,
    });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error("[gcal:webhook] import failed", error);
    return NextResponse.json({ ok: false, message: "Import failed." }, { status: 500 });
  }
}