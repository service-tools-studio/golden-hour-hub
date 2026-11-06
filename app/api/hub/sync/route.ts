import { NextResponse } from "next/server";
import { loadRemoteHubSync } from "@/lib/hub/bootstrap-remote";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const revisionParam = url.searchParams.get("revision");
  const parsed = revisionParam ? Number(revisionParam) : null;
  const clientRevision = parsed !== null && Number.isFinite(parsed) ? parsed : null;

  const remote = await loadRemoteHubSync(clientRevision);
  if ("ok" in remote) {
    return NextResponse.json({ ok: false, message: remote.message }, { status: 401 });
  }
  return NextResponse.json(remote, {
    headers: {
      "Cache-Control": "no-store, max-age=0",
    },
  });
}
