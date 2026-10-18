import { NextResponse } from "next/server";
import { loadRemoteHub } from "@/lib/hub/bootstrap-remote";

export const dynamic = "force-dynamic";

export async function GET() {
  const remote = await loadRemoteHub();
  if ("ok" in remote) {
    return NextResponse.json({ ok: false, message: remote.message }, { status: 401 });
  }
  return NextResponse.json(remote, {
    headers: {
      "Cache-Control": "no-store, max-age=0",
    },
  });
}
