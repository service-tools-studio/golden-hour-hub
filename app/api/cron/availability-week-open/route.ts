import { NextResponse } from "next/server";
import { runAvailabilityWeekOpenCron } from "@/lib/cleaner/availability-week-open-cron";
import { dynamoConfigured, loadHub } from "@/lib/data/repository";

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
  if (!dynamoConfigured()) {
    return NextResponse.json({ ok: true, ran: false, message: "DynamoDB is not configured." });
  }
  try {
    const hub = await loadHub();
    const result = await runAvailabilityWeekOpenCron(hub);
    if (!result.ran) {
      return NextResponse.json({ ok: true, ran: false, message: "Skipped — not Monday in business timezone." });
    }
    console.info("[cron:availability-week-open]", result);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("availability-week-open cron failed", error);
    return NextResponse.json({ ok: false, message: "Cron run failed." }, { status: 500 });
  }
}
