import "server-only";

import { cookies } from "next/headers";
import type { AppRole } from "@/lib/domain/types";
import { AUTH_COOKIE_OPTIONS } from "@/lib/auth/session";
import type { AuthSession } from "@/lib/auth/session";
import { PREVIEW_SESSION_COOKIE } from "@/lib/auth/constants";
import { previewPersistsToDynamo } from "@/lib/auth/preview-dynamo";

const PREVIEW_SESSION_EMAIL = "preview@local.dev";
const PREVIEW_SESSION_SUB = "preview-local";

type PreviewSessionPayload = {
  role: AppRole;
  cleanerId: string | null;
};

function parsePreviewSessionPayload(raw: string | undefined): PreviewSessionPayload | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as PreviewSessionPayload;
    if (data.role !== "ADMIN" && data.role !== "CLEANER") return null;
    const cleanerId =
      typeof data.cleanerId === "string" && data.cleanerId.trim() ? data.cleanerId.trim() : null;
    if (data.role === "CLEANER" && !cleanerId) return null;
    return { role: data.role, cleanerId: data.role === "ADMIN" ? null : cleanerId };
  } catch {
    return null;
  }
}

export async function readPreviewAuthSession(): Promise<AuthSession | null> {
  if (!previewPersistsToDynamo()) return null;
  const store = await cookies();
  const payload = parsePreviewSessionPayload(store.get(PREVIEW_SESSION_COOKIE)?.value);
  if (!payload) return null;
  return {
    sub: PREVIEW_SESSION_SUB,
    email: PREVIEW_SESSION_EMAIL,
    role: payload.role,
    cleanerId: payload.cleanerId,
  };
}

export async function setPreviewAuthSession(payload: PreviewSessionPayload): Promise<void> {
  if (!previewPersistsToDynamo()) return;
  const store = await cookies();
  if (payload.role === "ADMIN") {
    store.set(
      PREVIEW_SESSION_COOKIE,
      JSON.stringify({ role: "ADMIN", cleanerId: null } satisfies PreviewSessionPayload),
      AUTH_COOKIE_OPTIONS,
    );
    return;
  }
  const cleanerId =
    typeof payload.cleanerId === "string" && payload.cleanerId.trim() ? payload.cleanerId.trim() : null;
  if (!cleanerId) {
    store.delete(PREVIEW_SESSION_COOKIE);
    return;
  }
  store.set(
    PREVIEW_SESSION_COOKIE,
    JSON.stringify({ role: "CLEANER", cleanerId } satisfies PreviewSessionPayload),
    AUTH_COOKIE_OPTIONS,
  );
}

export async function clearPreviewAuthSession(): Promise<void> {
  const store = await cookies();
  store.delete(PREVIEW_SESSION_COOKIE);
}
