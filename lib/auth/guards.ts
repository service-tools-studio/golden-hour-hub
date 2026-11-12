import "server-only";

import type { AppRole } from "@/lib/domain/types";
import type { AuthSession } from "@/lib/auth/session";
import { getServerSession, refreshServerSessionCookie } from "@/lib/auth/session";
import { readPreviewAuthSession } from "@/lib/auth/preview-session";

export class AuthError extends Error {
  readonly code: "UNAUTHORIZED" | "FORBIDDEN";

  constructor(code: "UNAUTHORIZED" | "FORBIDDEN", message: string) {
    super(message);
    this.name = "AuthError";
    this.code = code;
  }
}

/** Cognito session when present; otherwise preview role cookie (same role semantics as sign-in). */
export async function resolveHubAuthSession(
  explicit?: AuthSession | null,
  options: { refreshCognito?: boolean } = {},
): Promise<AuthSession | null> {
  if (explicit) return explicit;
  const cognito = options.refreshCognito
    ? await refreshServerSessionCookie()
    : await getServerSession();
  if (cognito) return cognito;
  return readPreviewAuthSession();
}

export async function requireSession(): Promise<AuthSession> {
  const session = await resolveHubAuthSession(undefined, { refreshCognito: true });
  if (session) return session;
  throw new AuthError("UNAUTHORIZED", "Sign in required.");
}

export async function requireRole(role: AppRole): Promise<AuthSession> {
  const session = await requireSession();
  if (session.role !== role) throw new AuthError("FORBIDDEN", "You do not have access to this action.");
  return session;
}

export async function requireAdmin(): Promise<AuthSession> {
  return requireRole("ADMIN");
}

export async function requireCleaner(): Promise<AuthSession> {
  return requireRole("CLEANER");
}
