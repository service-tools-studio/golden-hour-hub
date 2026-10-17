import { NextResponse } from "next/server";
import { cognitoConfigured, previewAuthEnabled } from "@/lib/auth/config";
import { getServerSession } from "@/lib/auth/session";

export async function GET() {
  if (!cognitoConfigured()) {
    return NextResponse.json({ configured: false, preview: previewAuthEnabled(), session: null });
  }
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ configured: true, preview: false, session: null });
  }
  return NextResponse.json({
    configured: true,
    preview: false,
    session: { email: session.email, role: session.role, cleanerId: session.cleanerId },
  });
}
