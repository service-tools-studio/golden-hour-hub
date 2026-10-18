import "server-only";

import { cleanerNeedsSmsOnboarding } from "@/lib/cleaner/sms-consent";
import { dynamoConfigured, loadHub } from "@/lib/data/repository";
import type { AuthSession } from "@/lib/auth/session";

export async function postSignInRedirect(session: AuthSession): Promise<string> {
  if (session.role === "ADMIN") return "/admin";
  if (session.role !== "CLEANER" || !session.cleanerId) return "/cleaner";
  if (!dynamoConfigured()) return "/cleaner";
  try {
    const hub = await loadHub();
    const cleaner = hub.cleaners.find((item) => item.cleanerId === session.cleanerId);
    if (cleaner && cleanerNeedsSmsOnboarding(cleaner)) return "/onboarding/sms";
  } catch (error) {
    console.error("postSignInRedirect hub load failed.", error);
  }
  return "/cleaner";
}
