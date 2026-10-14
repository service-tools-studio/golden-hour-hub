"use server";

import { sendSms } from "@/lib/services/sms";

export async function sendCleanerText(to: string, body: string): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!/^\d{10}$/.test(to)) return { ok: false, message: "This cleaner has no mobile number on file." };
  try {
    await sendSms({ to, body });
    return { ok: true };
  } catch (error) {
    console.error(error);
    return { ok: false, message: "The text could not be sent. Please try again." };
  }
}
