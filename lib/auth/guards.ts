import "server-only";

import type { AppRole } from "@/lib/domain/types";
import type { AuthSession } from "@/lib/auth/session";
import { refreshServerSessionCookie } from "@/lib/auth/session";

export class AuthError extends Error {
  readonly code: "UNAUTHORIZED" | "FORBIDDEN";

  constructor(code: "UNAUTHORIZED" | "FORBIDDEN", message: string) {
    super(message);
    this.name = "AuthError";
    this.code = code;
  }
}

export async function requireSession(): Promise<AuthSession> {
  const session = await refreshServerSessionCookie();
  if (!session) throw new AuthError("UNAUTHORIZED", "Sign in required.");
  return session;
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
