import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

function authEnforced(): boolean {
  return Boolean(
    process.env.COGNITO_USER_POOL_ID?.trim() &&
      process.env.COGNITO_CLIENT_ID?.trim() &&
      process.env.AUTH_SESSION_SECRET?.trim(),
  );
}

/**
 * Server Actions POST to the same URL as the page; re-running auth in layouts on those
 * requests can redirect to /login even when the browser has a valid cookie. Skip
 * middleware for actions and only gate full document navigations.
 */
export function middleware(request: NextRequest) {
  if (!authEnforced()) return NextResponse.next();
  if (request.headers.has("next-action") || request.headers.has("Next-Action")) {
    return NextResponse.next();
  }
  if (!request.cookies.get("ghh-auth")?.value) {
    const login = new URL("/login", request.url);
    login.searchParams.set("from", request.nextUrl.pathname);
    return NextResponse.redirect(login);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/admin", "/admin/:path*", "/cleaner", "/cleaner/:path*"],
};
