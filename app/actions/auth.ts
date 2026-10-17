"use server";

import { redirect } from "next/navigation";
import { cognitoConfigured } from "@/lib/auth/config";
import { completeNewPassword, signInWithPassword } from "@/lib/auth/cognito";
import { createSessionFromTokens, setAuthCookie } from "@/lib/auth/session";

export type SignInResult =
  | { ok: true }
  | { ok: false; message: string }
  | { ok: true; challenge: "NEW_PASSWORD_REQUIRED"; session: string; email: string };

export async function signInAction(email: string, password: string): Promise<SignInResult> {
  if (!cognitoConfigured()) {
    return { ok: false, message: "Sign-in is not configured." };
  }
  const result = await signInWithPassword(email, password);
  if (!result.ok) return { ok: false, message: result.message };
  if ("challenge" in result && result.challenge === "NEW_PASSWORD_REQUIRED") {
    return { ok: true, challenge: "NEW_PASSWORD_REQUIRED", session: result.session, email: result.email };
  }
  if (!("tokens" in result)) {
    return { ok: false, message: "Sign-in failed." };
  }
  const created = await createSessionFromTokens(result.tokens, result.email);
  if (!created) {
    return {
      ok: false,
      message:
        "Signed in to Cognito, but this account is not set up in Hub yet. Check your group (ADMIN or CLEANER) and that your email matches a cleaner profile.",
    };
  }
  await setAuthCookie(created.cookieValue);
  redirect(created.session.role === "ADMIN" ? "/admin" : "/cleaner");
}

export async function completeNewPasswordAction(
  email: string,
  password: string,
  session: string,
): Promise<SignInResult> {
  if (!cognitoConfigured()) {
    return { ok: false, message: "Sign-in is not configured." };
  }
  const result = await completeNewPassword(email, password, session);
  if (!result.ok) return { ok: false, message: result.message };
  if (!("tokens" in result)) {
    return { ok: false, message: "Password change failed." };
  }
  const created = await createSessionFromTokens(result.tokens, result.email);
  if (!created) {
    return {
      ok: false,
      message:
        "Password updated, but this account is not set up in Hub yet. Check your group and cleaner email in DynamoDB.",
    };
  }
  await setAuthCookie(created.cookieValue);
  redirect(created.session.role === "ADMIN" ? "/admin" : "/cleaner");
}
