import { NextResponse } from "next/server";
import { ensureGoogleCalendarWatchChannel } from "@/lib/calendar/calendar-import-watch";

export const dynamic = "force-dynamic";

function cronAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return process.env.NODE_ENV !== "production";
  const header = request.headers.get("authorization");
  return header === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!cronAuthorized(request)) {
    return NextResponse.json({ ok: false, message: "Unauthorized." }, { status: 401 });
  }
  try {
    const result = await ensureGoogleCalendarWatchChannel();
    console.info("[cron:calendar-import-watch]", result);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("calendar-import-watch cron failed", error);
    return NextResponse.json({ ok: false, message: "Watch renewal failed." }, { status: 500 });
  }
}