export const SIGNED_OUT_STORAGE_KEY = "hub-signed-out";
export const SIGNED_OUT_GRACE_MS = 15_000;

export function signedOutRecently(): boolean {
  try {
    const raw = sessionStorage.getItem(SIGNED_OUT_STORAGE_KEY);
    if (!raw) return false;
    const at = Number(raw);
    if (!Number.isFinite(at) || Date.now() - at > SIGNED_OUT_GRACE_MS) {
      sessionStorage.removeItem(SIGNED_OUT_STORAGE_KEY);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function clearSignedOutGuard(): void {
  try {
    sessionStorage.removeItem(SIGNED_OUT_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
