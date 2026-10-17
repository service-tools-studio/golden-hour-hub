"use server";

import type { CleanerTextResult } from "@/lib/sms-notify";
import { SmsDeliveryError, sendSms } from "@/lib/services/sms";

export async function sendCleanerText(to: string, body: string): Promise<CleanerTextResult> {
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
