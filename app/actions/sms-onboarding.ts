"use server";

import { AuthError, requireCleaner } from "@/lib/auth/guards";
import { normalizePhone } from "@/lib/domain/customers";
import { dynamoConfigured, loadHub, saveHub } from "@/lib/data/repository";

export async function recordSmsOnboardingChoice(
  optIn: boolean,
  mobilePhoneInput: string,
): Promise<
  | { ok: true; smsSchedulingOptIn: boolean; smsOptInRecordedAt: string; mobilePhone: string }
  | { ok: false; message: string }
> {
  try {
    const session = await requireCleaner();
    if (!session.cleanerId) return { ok: false, message: "Your cleaner profile is not linked in Hub." };
    if (!dynamoConfigured()) return { ok: false, message: "Hub database is not configured." };
    const hub = await loadHub();
    const cleaner = hub.cleaners.find((item) => item.cleanerId === session.cleanerId);
    if (!cleaner) return { ok: false, message: "Your cleaner profile could not be found." };
    const mobilePhone = normalizePhone(mobilePhoneInput);
    if (!mobilePhone) {
      return { ok: false, message: "Enter a 10-digit mobile number." };
    }
    const now = new Date().toISOString();
    const next = {
      ...cleaner,
      mobilePhone,
      smsSchedulingOptIn: optIn,
      smsOptInRecordedAt: cleaner.smsOptInRecordedAt ?? now,
      updatedAt: now,
      updatedBy: session.email,
    };
    await saveHub({
      ...hub,
      cleaners: hub.cleaners.map((item) => (item.cleanerId === session.cleanerId ? next : item)),
    });
    return {
      ok: true,
      smsSchedulingOptIn: optIn,
      smsOptInRecordedAt: next.smsOptInRecordedAt ?? now,
      mobilePhone,
    };
  } catch (error) {
    if (error instanceof AuthError) return { ok: false, message: error.message };
    console.error("recordSmsOnboardingChoice failed.", error);
    return { ok: false, message: "Could not save your preference." };
  }
}
