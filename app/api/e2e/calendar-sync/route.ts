import { NextResponse } from "next/server";
import { applyCalendarEventsToHub } from "@/lib/calendar/calendar-import-apply";
import { loadHubForCalendarImportApply } from "@/lib/calendar/calendar-import-hub-load";
import { authorizeE2eCalendarRoute } from "@/lib/e2e/e2e-route-auth";
import type { GoogleCalendarEvent } from "@/lib/services/google-calendar-client";

export const dynamic = "force-dynamic";

type SyncBody = {
  events?: GoogleCalendarEvent[];
};

export async function POST(request: Request): Promise<NextResponse> {
  if (!authorizeE2eCalendarRoute(request)) {
    return new NextResponse(null, { status: 404 });
  }
  let body: SyncBody;
  try {
    body = (await request.json()) as SyncBody;
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid JSON body." }, { status: 400 });
  }
  const events = Array.isArray(body.events) ? body.events : [];
  try {
    const hub = await loadHubForCalendarImportApply();
    const result = await applyCalendarEventsToHub(hub, events);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("[e2e:calendar-sync] apply failed", error);
    return NextResponse.json({ ok: false, message: "Could not apply calendar sync." }, { status: 500 });
  }
}