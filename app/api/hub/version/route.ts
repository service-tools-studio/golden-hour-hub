import { NextResponse } from "next/server";
import { loadRemoteHubRevision } from "@/lib/hub/bootstrap-remote";

export const dynamic = "force-dynamic";

export async function GET() {
  const remote = await loadRemoteHubRevision();
  if ("ok" in remote) {
    return NextResponse.json({ ok: false, message: remote.message }, { status: 401 });
  }
  if ("source" in remote) {
    return NextResponse.json(remote, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  }
  return NextResponse.json({ revision: remote.revision }, {
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}
