"use server";

import { AuthError, requireAdmin } from "@/lib/auth/guards";
import { cleanerAllowsSchedulingSms } from "@/lib/cleaner/sms-consent";
import { dynamoConfigured, loadHub } from "@/lib/data/repository";
import type { CleanerTextResult } from "@/lib/sms-notify";
import { SmsDeliveryError, sendSms } from "@/lib/services/sms";

export async function sendCleanerText(
  to: string,
  body: string,
  options?: { cleanerId?: string },
): Promise<CleanerTextResult> {
  try {
    await requireAdmin();
    if (options?.cleanerId && dynamoConfigured()) {
      const hub = await loadHub();
      const cleaner = hub.cleaners.find((item) => item.cleanerId === options.cleanerId);
      if (cleaner && !cleanerAllowsSchedulingSms(cleaner)) {
        return { ok: false, message: `${cleaner.firstName} has not opted in to SMS notifications.` };
      }
    }
    if (!/^\d{10}$/.test(to)) return { ok: false, message: "This cleaner has no mobile number on file." };
    const result = await sendSms({ to, body });
    return {
      ok: true,
      provider: result.provider,
      confirmed: result.provider === "twilio" && result.confirmed === true,
    };
  } catch (error) {
    if (error instanceof AuthError) return { ok: false, message: error.message };
    console.error(error);
    const message =
      error instanceof SmsDeliveryError ? error.userMessage : "The text could not be sent. Please try again.";
    return { ok: false, message };
  }
}
