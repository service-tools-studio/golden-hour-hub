import { NextResponse } from "next/server";
import { cognitoConfigured, previewAuthEnabled } from "@/lib/auth/config";
import { previewAuthAllowed } from "@/lib/auth/preview-mode";
import { readPreviewAuthSession } from "@/lib/auth/preview-session";
import { renewClientAuthSession } from "@/lib/auth/session";

export async function GET() {
  const previewMode = previewAuthAllowed() && previewAuthEnabled();
  if (!cognitoConfigured()) {
    const previewSession = await readPreviewAuthSession();
    return NextResponse.json({
      configured: false,
      preview: previewMode,
      session: previewSession
        ? { role: previewSession.role, cleanerId: previewSession.cleanerId }
        : null,
    });
  }
  const session = await renewClientAuthSession();
  if (!session) {
    const previewSession = previewMode ? await readPreviewAuthSession() : null;
    return NextResponse.json({
      configured: true,
      preview: previewMode && Boolean(previewSession),
      session: previewSession
        ? { role: previewSession.role, cleanerId: previewSession.cleanerId }
        : null,
    });
  }
  return NextResponse.json({
    configured: true,
    preview: false,
    session: { email: session.email, role: session.role, cleanerId: session.cleanerId },
  });
}
