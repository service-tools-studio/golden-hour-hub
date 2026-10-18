import { NextResponse } from "next/server";
import { cognitoConfigured } from "@/lib/auth/config";
import { postSignInRedirect } from "@/lib/auth/post-sign-in-redirect";
import { refreshServerSessionCookie } from "@/lib/auth/session";

/** Refreshes Cognito and sends the user to the right home (or login). */
export async function GET(request: Request) {
  if (!cognitoConfigured()) {
    return NextResponse.redirect(new URL("/", request.url));
  }
  const session = await refreshServerSessionCookie();
  if (!session) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  const destination = await postSignInRedirect(session);
  return NextResponse.redirect(new URL(destination, request.url));
}
