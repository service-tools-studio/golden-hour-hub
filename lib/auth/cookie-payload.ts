import type { AppRole } from "@/lib/domain/types";

/** Signed cookie payload (no Cognito JWTs). */
export type StoredAuthCookie = {
  sub: string;
  email: string;
  /** Cognito username for refresh (may differ from email). */
  cognitoUsername?: string;
  role: AppRole;
  cleanerId: string | null;
  refreshToken: string;
  expiresAt: number;
  /** Last time role was re-checked against Cognito (unix seconds). */
  verifiedAt: number;
};

export function authCookiePayloadValid(parsed: StoredAuthCookie): boolean {
  return Boolean(parsed.role && parsed.sub && parsed.email && typeof parsed.expiresAt === "number");
}

export function authCookieSessionActive(parsed: StoredAuthCookie, nowSeconds = Math.floor(Date.now() / 1000)): boolean {
  return parsed.expiresAt > nowSeconds;
}
