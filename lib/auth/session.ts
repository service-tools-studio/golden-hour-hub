import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import type { AppRole } from "@/lib/domain/types";
import { authSessionSecret, cognitoConfigured } from "@/lib/auth/config";
import { decodeIdToken, resolveCognitoGroups, type CognitoTokens } from "@/lib/auth/cognito";
import { cleanerIdForEmail, roleFromCognitoGroups } from "@/lib/auth/roles";
import { dynamoConfigured, loadHub } from "@/lib/data/repository";

export const AUTH_COOKIE = "ghh-auth";

export const AUTH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: 60 * 60 * 24 * 60,
};

export type AuthSession = {
  sub: string;
  email: string;
  role: AppRole;
  cleanerId: string | null;
};

/** Small signed payload only — Cognito JWTs stay off the cookie (they exceed browser limits). */
type StoredSession = {
  sub: string;
  email: string;
  role: AppRole;
  cleanerId: string | null;
  refreshToken: string;
  expiresAt: number;
};

function seal(data: StoredSession): string {
  const payload = Buffer.from(JSON.stringify(data)).toString("base64url");
  const sig = createHmac("sha256", authSessionSecret()).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

function unseal(value: string): StoredSession | null {
  const [payload, sig] = value.split(".");
  if (!payload || !sig) return null;
  const expected = createHmac("sha256", authSessionSecret()).update(payload).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as StoredSession;
    if (!parsed.role || !parsed.sub || !parsed.email || typeof parsed.expiresAt !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
}

async function sessionFromTokens(tokens: CognitoTokens, email: string): Promise<AuthSession | null> {
  const claims = decodeIdToken(tokens.idToken);
  const groups = await resolveCognitoGroups(claims.username || claims.email, claims.groups);
  const role = roleFromCognitoGroups(groups);
  if (!role) return null;
  let cleanerId: string | null = null;
  if (role === "CLEANER") {
    if (!dynamoConfigured()) return null;
    const hub = await loadHub();
    cleanerId = cleanerIdForEmail(hub.cleaners, claims.email);
    if (!cleanerId) return null;
  }
  return { sub: claims.sub, email: claims.email, role, cleanerId };
}

function resolveAuthSession(stored: StoredSession): AuthSession | null {
  if (stored.expiresAt <= Math.floor(Date.now() / 1000)) return null;
  return { sub: stored.sub, email: stored.email, role: stored.role, cleanerId: stored.cleanerId };
}

export type SessionCookiePayload = {
  session: AuthSession;
  cookieValue: string;
};

export async function createSessionFromTokens(tokens: CognitoTokens, email: string): Promise<SessionCookiePayload | null> {
  const session = await sessionFromTokens(tokens, email);
  if (!session) return null;
  const stored: StoredSession = {
    sub: session.sub,
    email: session.email,
    role: session.role,
    cleanerId: session.cleanerId,
    refreshToken: tokens.refreshToken,
    expiresAt: Math.floor(Date.now() / 1000) + AUTH_COOKIE_OPTIONS.maxAge,
  };
  return { session, cookieValue: seal(stored) };
}

export async function setAuthCookie(cookieValue: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(AUTH_COOKIE, cookieValue, AUTH_COOKIE_OPTIONS);
}

export async function getServerSession(): Promise<AuthSession | null> {
  if (!cognitoConfigured()) return null;
  const cookieStore = await cookies();
  const raw = cookieStore.get(AUTH_COOKIE)?.value;
  if (!raw) return null;
  const stored = unseal(raw);
  if (!stored) return null;
  return resolveAuthSession(stored);
}

export async function clearSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(AUTH_COOKIE);
}
