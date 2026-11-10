import type { AppRole } from "@/lib/domain/types";

/** Mirror browser role picker into an HttpOnly cookie so server actions can persist to DynamoDB. */
export async function syncPreviewSessionCookie(
  role: AppRole | null,
  cleanerId: string | null,
): Promise<void> {
  try {
    if (role === null) {
      await fetch("/api/auth/preview-session", { method: "DELETE", credentials: "same-origin" });
      return;
    }
    await fetch("/api/auth/preview-session", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role, cleanerId }),
    });
  } catch (error) {
    console.error("Could not sync preview session cookie.", error);
  }
}
