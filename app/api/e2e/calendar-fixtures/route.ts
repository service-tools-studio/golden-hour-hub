import { NextResponse } from "next/server";
import { writeE2eGoogleCalendarFixtures } from "@/lib/calendar/e2e-google-calendar-fixtures";
import { authorizeE2eCalendarRoute } from "@/lib/e2e/e2e-route-auth";
import type { GoogleCalendarEvent } from "@/lib/services/google-calendar-client";

export const dynamic = "force-dynamic";

type FixtureBody = {
  events?: GoogleCalendarEvent[];
};

export async function POST(request: Request): Promise<NextResponse> {
  if (!authorizeE2eCalendarRoute(request)) {
    return new NextResponse(null, { status: 404 });
  }
  let body: FixtureBody;
  try {
    body = (await request.json()) as FixtureBody;
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid JSON body." }, { status: 400 });
  }
  const events = Array.isArray(body.events) ? body.events : [];
  try {
    await writeE2eGoogleCalendarFixtures(events);
    return NextResponse.json({ ok: true, count: events.length });
  } catch (error) {
    console.error("[e2e:calendar-fixtures] write failed", error);
    return NextResponse.json({ ok: false, message: "Could not write fixtures." }, { status: 500 });
  }
}