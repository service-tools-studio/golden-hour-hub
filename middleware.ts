import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { AUTH_COOKIE } from "@/lib/auth/constants";
import { readAuthSessionFromCookie } from "@/lib/auth/cookie-edge";

function authEnforced(): boolean {
  return Boolean(
    process.env.COGNITO_USER_POOL_ID?.trim() &&
      process.env.COGNITO_CLIENT_ID?.trim() &&
      process.env.AUTH_SESSION_SECRET?.trim(),
  );
}

function requiredRoleForPath(pathname: string): "ADMIN" | "CLEANER" | null {
  if (pathname === "/admin" || pathname.startsWith("/admin/")) return "ADMIN";
  if (pathname === "/cleaner" || pathname.startsWith("/cleaner/")) return "CLEANER";
  if (pathname === "/onboarding/sms" || pathname.startsWith("/onboarding/")) return "CLEANER";
  return null;
}

export async function middleware(request: NextRequest) {
  if (!authEnforced()) return NextResponse.next();

  const requiredRole = requiredRoleForPath(request.nextUrl.pathname);
  if (!requiredRole) return NextResponse.next();

  const session = await readAuthSessionFromCookie(
    request.cookies.get(AUTH_COOKIE)?.value,
    process.env.AUTH_SESSION_SECRET,
  );

  if (!session) {
    const login = new URL("/login", request.url);
    login.searchParams.set("from", request.nextUrl.pathname);
    return NextResponse.redirect(login);
  }

  if (session.role !== requiredRole) {
    const home = new URL(session.role === "ADMIN" ? "/admin" : "/cleaner", request.url);
    return NextResponse.redirect(home);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin", "/admin/:path*", "/cleaner", "/cleaner/:path*", "/onboarding/sms", "/onboarding/:path*"],
};
