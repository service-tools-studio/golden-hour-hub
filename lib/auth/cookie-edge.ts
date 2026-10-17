import type { AppRole } from "@/lib/domain/types";
import { authCookiePayloadValid, authCookieSessionActive, type StoredAuthCookie } from "@/lib/auth/cookie-payload";

function base64UrlToBytes(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function timingSafeEqualBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) {
    diff |= a[index] ^ b[index];
  }
  return diff === 0;
}

async function hmacSha256Base64Url(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  const signature = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return bytesToBase64Url(new Uint8Array(signature));
}

export async function unsealAuthCookieEdge(value: string, secret: string): Promise<StoredAuthCookie | null> {
  const [payload, sig] = value.split(".");
  if (!payload || !sig) return null;
  const expected = await hmacSha256Base64Url(secret, payload);
  const a = base64UrlToBytes(sig);
  const b = base64UrlToBytes(expected);
  if (!timingSafeEqualBytes(a, b)) return null;
  try {
    const json = new TextDecoder().decode(base64UrlToBytes(payload));
    const parsed = JSON.parse(json) as StoredAuthCookie;
    if (!authCookiePayloadValid(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export type EdgeAuthSession = {
  role: AppRole;
  cleanerId: string | null;
};

export async function readAuthSessionFromCookie(
  cookieValue: string | undefined,
  secret: string | undefined,
): Promise<EdgeAuthSession | null> {
  if (!cookieValue || !secret?.trim()) return null;
  const stored = await unsealAuthCookieEdge(cookieValue, secret.trim());
  if (!stored || !authCookieSessionActive(stored)) return null;
  return { role: stored.role, cleanerId: stored.cleanerId };
}
