import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { authCookiePayloadValid, type StoredAuthCookie } from "@/lib/auth/cookie-payload";

export function sealAuthCookie(data: StoredAuthCookie, secret: string): string {
  const payload = Buffer.from(JSON.stringify(data)).toString("base64url");
  const sig = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function unsealAuthCookie(value: string, secret: string): StoredAuthCookie | null {
  const [payload, sig] = value.split(".");
  if (!payload || !sig) return null;
  const expected = createHmac("sha256", secret).update(payload).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as StoredAuthCookie;
    if (!authCookiePayloadValid(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}
