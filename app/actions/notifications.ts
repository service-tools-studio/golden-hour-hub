"use server";

import { AuthError } from "@/lib/auth/guards";
import { requireAdmin } from "@/lib/auth/guards";
import type { CleanerTextResult } from "@/lib/sms-notify";
import { SmsDeliveryError, sendSms } from "@/lib/services/sms";

export async function sendCleanerText(to: string, body: string): Promise<CleanerTextResult> {
  try {
    await requireAdmin();
  } catch (error) {
    if (error instanceof AuthError) return { ok: false, message: error.message };
    return { ok: false, message: "You do not have access to send texts." };
  }
  if (!/^\d{10}$/.test(to)) return { ok: false, message: "This cleaner has no mobile number on file." };
  try {
    const result = await sendSms({ to, body });
    return {
      ok: true,
      provider: result.provider,
      confirmed: result.provider === "twilio" && result.confirmed === true,
    };
  } catch (error) {
    console.error(error);
    const message =
      error instanceof SmsDeliveryError ? error.userMessage : "The text could not be sent. Please try again.";
    return { ok: false, message };
  }
}
