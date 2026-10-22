"use server";

import { AuthError, requireCleaner } from "@/lib/auth/guards";
import { applySchedulingSmsEnrollment } from "@/lib/cleaner/sms-consent-record";
import { SMS_SCHEDULING_DISCLOSURE_VERSION } from "@/lib/cleaner/sms-disclosure";
import { normalizePhone } from "@/lib/domain/customers";
import { dynamoConfigured, loadHub, saveHub } from "@/lib/data/repository";

export type SmsOnboardingSuccess = {
  smsSchedulingOptIn: boolean;
  smsOptInRecordedAt: string;
  mobilePhone: string;
  smsConsentPhone?: string;
  smsConsentRecordedAt?: string;
  smsConsentDisclosureVersion?: string;
  smsConsentMethod?: string;
};

export async function recordSmsOnboardingChoice(
  optIn: boolean,
  mobilePhoneInput: string,
  disclosureVersion: string,
): Promise<({ ok: true } & SmsOnboardingSuccess) | { ok: false; message: string }> {
  try {
    const session = await requireCleaner();
    if (!session.cleanerId) return { ok: false, message: "Your cleaner profile is not linked in Hub." };
    if (!dynamoConfigured()) return { ok: false, message: "Hub database is not configured." };
    if (disclosureVersion !== SMS_SCHEDULING_DISCLOSURE_VERSION) {
      return { ok: false, message: "This consent form is out of date. Refresh the page and try again." };
    }
    const hub = await loadHub();
    const cleaner = hub.cleaners.find((item) => item.cleanerId === session.cleanerId);
    if (!cleaner) return { ok: false, message: "Your cleaner profile could not be found." };
    const mobilePhone = normalizePhone(mobilePhoneInput);
    if (!mobilePhone) {
      return { ok: false, message: "Enter a 10-digit mobile number." };
    }
    const now = new Date().toISOString();
    const next = applySchedulingSmsEnrollment(cleaner, {
      optIn,
      mobilePhone,
      recordedAt: now,
      updatedBy: session.email,
      consentMethod: "hub_web",
    });
    await saveHub({
      ...hub,
      cleaners: hub.cleaners.map((item) => (item.cleanerId === session.cleanerId ? next : item)),
    });
    return {
      ok: true,
      smsSchedulingOptIn: optIn,
      smsOptInRecordedAt: now,
      mobilePhone,
      smsConsentPhone: next.smsConsentPhone,
      smsConsentRecordedAt: next.smsConsentRecordedAt,
      smsConsentDisclosureVersion: next.smsConsentDisclosureVersion,
      smsConsentMethod: next.smsConsentMethod,
    };
  } catch (error) {
    if (error instanceof AuthError) return { ok: false, message: error.message };
    console.error("recordSmsOnboardingChoice failed.", error);
    return { ok: false, message: "Could not save your preference." };
  }
}
