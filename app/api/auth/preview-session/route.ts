import { NextResponse } from "next/server";
import type { AppRole } from "@/lib/domain/types";
import { previewPersistsToDynamo } from "@/lib/auth/preview-dynamo";
import { clearPreviewAuthSession, setPreviewAuthSession } from "@/lib/auth/preview-session";

function parseBody(body: unknown): { role: AppRole; cleanerId: string | null } | null {
  if (!body || typeof body !== "object") return null;
  const role = (body as { role?: unknown }).role;
  const cleanerId = (body as { cleanerId?: unknown }).cleanerId;
  if (role !== "ADMIN" && role !== "CLEANER") return null;
  const id = typeof cleanerId === "string" && cleanerId.trim() ? cleanerId.trim() : null;
  if (role === "CLEANER" && !id) return null;
  return { role, cleanerId: role === "ADMIN" ? null : id };
}

export async function POST(request: Request) {
  if (!previewPersistsToDynamo()) {
    return NextResponse.json({ ok: false, message: "Preview database session is not active." }, { status: 403 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid request." }, { status: 400 });
  }
  const parsed = parseBody(body);
  if (!parsed) {
    return NextResponse.json({ ok: false, message: "Invalid role." }, { status: 400 });
  }
  await setPreviewAuthSession(parsed);
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  if (!previewPersistsToDynamo()) {
    return NextResponse.json({ ok: true });
  }
  await clearPreviewAuthSession();
  return NextResponse.json({ ok: true });
}
