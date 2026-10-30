import { NextResponse } from "next/server";
import { purgeStaleAssignmentSmsLogs } from "@/lib/cleaner/assignment-sms-log-retention";
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
    return NextResponse.json({ ok: true, deleted: 0, message: "DynamoDB is not configured." });
  }
  try {
    const hub = await loadHub();
    const deleted = await purgeStaleAssignmentSmsLogs(hub);
    return NextResponse.json({ ok: true, deleted });
  } catch (error) {
    console.error("assignment-sms-log-retention cron failed", error);
    return NextResponse.json({ ok: false, message: "Retention run failed." }, { status: 500 });
  }
}
