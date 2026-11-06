import "server-only";

import { cookies } from "next/headers";
import type { AppRole } from "@/lib/domain/types";
import { authSessionSecret, cognitoConfigured } from "@/lib/auth/config";
import { authCookieSessionActive, type StoredAuthCookie } from "@/lib/auth/cookie-payload";
import { sealAuthCookie, unsealAuthCookie } from "@/lib/auth/cookie-node";
import {
  cognitoUserSignInAllowed,
  decodeIdToken,
  refreshTokens,
  resolveCognitoGroups,
  type CognitoTokens,
} from "@/lib/auth/cognito";
import { cleanerIdForCognitoUser, roleFromCognitoGroups } from "@/lib/auth/roles";
import { dynamoConfigured, loadHub } from "@/lib/data/repository";

import { AUTH_COOKIE } from "@/lib/auth/constants";

export { AUTH_COOKIE };

/** Hub session lifetime (matches expected max idle time before re-login). */
export const AUTH_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 60;

export const AUTH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: AUTH_SESSION_MAX_AGE_SECONDS,
};

/** Minimum seconds between Cognito refresh calls (avoids refresh-token rotation races). */
const COGNITO_RECHECK_SECONDS = 60 * 15;

export type AuthSession = {
  sub: string;
  email: string;
  role: AppRole;
  cleanerId: string | null;
};

const refreshInflight = new Map<string, Promise<StoredAuthCookie | null>>();

function toAuthSession(stored: StoredAuthCookie): AuthSession | null {
  if (!authCookieSessionActive(stored)) return null;
  return { sub: stored.sub, email: stored.email, role: stored.role, cleanerId: stored.cleanerId };
}

async function sessionFromTokens(
  tokens: CognitoTokens,
  email: string,
  trustedStored?: Pick<StoredAuthCookie, "sub" | "role" | "cleanerId">,
): Promise<AuthSession | null> {
  const claims = decodeIdToken(tokens.idToken);
  const groups = await resolveCognitoGroups(claims.username || claims.email, claims.groups);
  let role = roleFromCognitoGroups(groups);
  if (!role && trustedStored && trustedStored.sub === claims.sub) {
    role = trustedStored.role;
  }
  if (!role) return null;

  let cleanerId: string | null = null;
  if (role === "CLEANER") {
    if (
      trustedStored &&
      trustedStored.sub === claims.sub &&
      trustedStored.role === "CLEANER" &&
      trustedStored.cleanerId
    ) {
      cleanerId = trustedStored.cleanerId;
    } else {
      try {
        if (!dynamoConfigured()) return null;
        const hub = await loadHub();
        cleanerId = cleanerIdForCognitoUser(hub.cleaners, claims.sub, claims.email);
      } catch (error) {
        console.error("Could not load hub for cleaner session.", error);
        if (trustedStored?.sub === claims.sub && trustedStored.role === "CLEANER" && trustedStored.cleanerId) {
          cleanerId = trustedStored.cleanerId;
        }
      }
      if (!cleanerId) return null;
    }
  }
  return { sub: claims.sub, email: claims.email, role, cleanerId };
}

function sessionFromStoredIdentity(
  stored: StoredAuthCookie,
  claims: ReturnType<typeof decodeIdToken>,
): AuthSession | null {
  if (stored.sub !== claims.sub) return null;
  if (!authCookieSessionActive(stored)) return null;
  return { sub: stored.sub, email: stored.email, role: stored.role, cleanerId: stored.cleanerId };
}

function storedFromSession(
  session: AuthSession,
  tokens: CognitoTokens,
  cognitoUsername: string,
  verifiedAt: number,
): StoredAuthCookie {
  return {
    sub: session.sub,
    email: session.email,
    cognitoUsername,
    role: session.role,
    cleanerId: session.cleanerId,
    refreshToken: tokens.refreshToken,
    expiresAt: Math.floor(Date.now() / 1000) + AUTH_SESSION_MAX_AGE_SECONDS,
    verifiedAt,
  };
}

function cognitoUsernameForRefresh(stored: StoredAuthCookie): string {
  return (stored.cognitoUsername ?? stored.email).trim().toLowerCase();
}

function readStoredSession(raw: string | undefined): StoredAuthCookie | null {
  if (!raw) return null;
  const stored = unsealAuthCookie(raw, authSessionSecret());
  if (!stored || !authCookieSessionActive(stored)) return null;
  return stored;
}

async function revalidateStoredSessionOnce(stored: StoredAuthCookie): Promise<StoredAuthCookie | null> {
  const now = Math.floor(Date.now() / 1000);
  if (now - (stored.verifiedAt ?? 0) < COGNITO_RECHECK_SECONDS) {
    return stored;
  }

  const signInStatus = await cognitoUserSignInAllowed(cognitoUsernameForRefresh(stored));
  if (signInStatus === "disabled") return null;

  const refresh = await refreshTokens(cognitoUsernameForRefresh(stored), stored.refreshToken);
  if (!refresh.ok) {
    if (refresh.reason === "not_authorized") {
      if (authCookieSessionActive(stored, now)) return stored;
      return null;
    }
    return stored;
  }

  const tokens = refresh.tokens;
  const claims = decodeIdToken(tokens.idToken);
  const username = (claims.username || claims.email).toLowerCase();

  const session = await sessionFromTokens(tokens, stored.email, stored);
  if (session) {
    const next = storedFromSession(session, tokens, username, now);
    return { ...next, expiresAt: now + AUTH_SESSION_MAX_AGE_SECONDS };
  }

  const fallback = sessionFromStoredIdentity(stored, claims);
  if (fallback) {
    const next = storedFromSession(fallback, tokens, username, now);
    return { ...next, expiresAt: now + AUTH_SESSION_MAX_AGE_SECONDS };
  }

  return {
    ...stored,
    refreshToken: tokens.refreshToken,
    verifiedAt: now,
    expiresAt: now + AUTH_SESSION_MAX_AGE_SECONDS,
  };
}

async function revalidateStoredSession(stored: StoredAuthCookie): Promise<StoredAuthCookie | null> {
  const inflight = refreshInflight.get(stored.sub);
  if (inflight) return inflight;

  const promise = revalidateStoredSessionOnce(stored).finally(() => {
    refreshInflight.delete(stored.sub);
  });
  refreshInflight.set(stored.sub, promise);
  return promise;
}

export type SessionCookiePayload = {
  session: AuthSession;
  cookieValue: string;
};

export async function createSessionFromTokens(tokens: CognitoTokens, email: string): Promise<SessionCookiePayload | null> {
  const session = await sessionFromTokens(tokens, email);
  if (!session) return null;
  const claims = decodeIdToken(tokens.idToken);
  const now = Math.floor(Date.now() / 1000);
  const username = (claims.username || claims.email).toLowerCase();
  const stored = storedFromSession(session, tokens, username, now);
  return { session, cookieValue: sealAuthCookie(stored, authSessionSecret()) };
}

export async function setAuthCookie(cookieValue: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(AUTH_COOKIE, cookieValue, AUTH_COOKIE_OPTIONS);
}

/** Read session from the signed cookie only (no live Cognito check). Safe in Server Components. */
export async function getServerSession(): Promise<AuthSession | null> {
  if (!cognitoConfigured()) return null;
  const cookieStore = await cookies();
  const stored = readStoredSession(cookieStore.get(AUTH_COOKIE)?.value);
  if (!stored) return null;
  return toAuthSession(stored);
}

/**
 * For `/api/auth/session`: trust the signed cookie, slide expiry, renew browser `maxAge`.
 * Does not call Cognito (so reopening the app after idle days does not depend on refresh-token rotation).
 */
export async function renewClientAuthSession(): Promise<AuthSession | null> {
  if (!cognitoConfigured()) return null;
  const cookieStore = await cookies();
  const stored = readStoredSession(cookieStore.get(AUTH_COOKIE)?.value);
  if (!stored) return null;
  const session = toAuthSession(stored);
  if (!session) return null;

  const now = Math.floor(Date.now() / 1000);
  const renewed: StoredAuthCookie = {
    ...stored,
    expiresAt: now + AUTH_SESSION_MAX_AGE_SECONDS,
  };
  cookieStore.set(AUTH_COOKIE, sealAuthCookie(renewed, authSessionSecret()), AUTH_COOKIE_OPTIONS);
  return toAuthSession(renewed);
}

/**
 * Live Cognito refresh when due + cookie update. Use in Route Handlers and Server Actions only.
 * Clears the session cookie when Cognito rejects the refresh token or the user is disabled.
 */
export async function refreshServerSessionCookie(): Promise<AuthSession | null> {
  if (!cognitoConfigured()) return null;
  const cookieStore = await cookies();
  const stored = readStoredSession(cookieStore.get(AUTH_COOKIE)?.value);
  if (!stored) return null;

  const revalidated = await revalidateStoredSession(stored);
  let resolved = revalidated;
  if (!resolved) {
    const reread = readStoredSession(cookieStore.get(AUTH_COOKIE)?.value);
    if (reread && reread.sub === stored.sub && reread.refreshToken !== stored.refreshToken) {
      resolved = await revalidateStoredSession(reread);
    }
  }
  if (!resolved) {
    cookieStore.delete(AUTH_COOKIE);
    return null;
  }

  const nextValue = sealAuthCookie(resolved, authSessionSecret());
  cookieStore.set(AUTH_COOKIE, nextValue, AUTH_COOKIE_OPTIONS);

  return toAuthSession(resolved);
}

export async function clearSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(AUTH_COOKIE);
}
