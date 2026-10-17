import { NextResponse } from "next/server";
import { cognitoConfigured } from "@/lib/auth/config";
import { signInWithPassword } from "@/lib/auth/cognito";
import { hubSignInSetupMessage, jasminSetupPhone } from "@/lib/auth/messages";
import { createSessionFromTokens, setAuthCookie } from "@/lib/auth/session";

export async function POST(request: Request) {
  if (!cognitoConfigured()) {
    return NextResponse.json({ ok: false, message: "Sign-in is not configured." }, { status: 503 });
  }
  const body = (await request.json()) as { email?: string; password?: string };
  const email = body.email?.trim();
  const password = body.password;
  if (!email || !password) {
    return NextResponse.json({ ok: false, message: "Email and password are required." }, { status: 400 });
  }
  const result = await signInWithPassword(email, password);
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, message: result.message, passwordRequirements: result.passwordRequirements },
      { status: 401 },
    );
  }
  if ("challenge" in result && result.challenge === "NEW_PASSWORD_REQUIRED") {
    return NextResponse.json({
      ok: true,
      challenge: "NEW_PASSWORD_REQUIRED",
      session: result.session,
      email: result.email,
    });
  }
  if (!("tokens" in result)) {
    return NextResponse.json({ ok: false, message: "Sign-in failed." }, { status: 401 });
  }
  const created = await createSessionFromTokens(result.tokens, result.email);
  if (!created) {
    return NextResponse.json(
      { ok: false, hubSetup: "sign-in", message: hubSignInSetupMessage, phone: jasminSetupPhone },
      { status: 403 },
    );
  }
  await setAuthCookie(created.cookieValue);
  const redirect = created.session.role === "ADMIN" ? "/admin" : "/cleaner";
  return NextResponse.json({ ok: true, role: created.session.role, redirect });
}
