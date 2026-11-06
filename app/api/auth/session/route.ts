import { NextResponse } from "next/server";
import { cognitoConfigured, previewAuthEnabled } from "@/lib/auth/config";
import { previewAuthAllowed } from "@/lib/auth/preview-mode";
import { renewClientAuthSession } from "@/lib/auth/session";

export async function GET() {
  if (!cognitoConfigured()) {
    return NextResponse.json({
      configured: false,
      preview: previewAuthAllowed() && previewAuthEnabled(),
      session: null,
    });
  }
  const session = await renewClientAuthSession();
  if (!session) {
    return NextResponse.json({ configured: true, preview: false, session: null });
  }
  return NextResponse.json({
    configured: true,
    preview: false,
    session: { email: session.email, role: session.role, cleanerId: session.cleanerId },
  });
}
