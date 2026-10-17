import { NextResponse } from "next/server";
import { cognitoConfigured } from "@/lib/auth/config";
import { completeNewPassword } from "@/lib/auth/cognito";
import { createSessionFromTokens, setAuthCookie } from "@/lib/auth/session";

export async function POST(request: Request) {
  if (!cognitoConfigured()) {
    return NextResponse.json({ ok: false, message: "Sign-in is not configured." }, { status: 503 });
  }
  const body = (await request.json()) as { email?: string; password?: string; session?: string };
  const email = body.email?.trim();
  const password = body.password;
  const session = body.session;
  if (!email || !password || !session) {
    return NextResponse.json({ ok: false, message: "Email, password, and session are required." }, { status: 400 });
  }
  const result = await completeNewPassword(email, password, session);
  if (!result.ok) {
    return NextResponse.json({ ok: false, message: result.message }, { status: 401 });
  }
  if (!("tokens" in result)) {
    return NextResponse.json({ ok: false, message: "Password change failed." }, { status: 401 });
  }
  const created = await createSessionFromTokens(result.tokens, result.email);
  if (!created) {
    return NextResponse.json(
      {
        ok: false,
        message:
          "Password updated, but this account is not set up in Hub yet. Check your group and cleaner email in DynamoDB.",
      },
      { status: 403 },
    );
  }
  await setAuthCookie(created.cookieValue);
  const redirect = created.session.role === "ADMIN" ? "/admin" : "/cleaner";
  return NextResponse.json({ ok: true, role: created.session.role, redirect });
}
