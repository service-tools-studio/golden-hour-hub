import { cleanerWithMobilePhone } from "@/lib/cleaner/sms-consent";
import { SMS_SCHEDULING_DISCLOSURE_VERSION } from "@/lib/cleaner/sms-disclosure";
import { normalizePhone } from "@/lib/domain/customers";
import type { CleanerProfile } from "@/lib/domain/types";

export function applySchedulingSmsEnrollment(
  cleaner: CleanerProfile,
  input: {
    optIn: boolean;
    mobilePhone: string;
    recordedAt: string;
    updatedBy: string;
    consentMethod?: string;
  },
): CleanerProfile {
  const mobilePhone = normalizePhone(input.mobilePhone);
  if (!mobilePhone) return cleaner;

  let next = cleanerWithMobilePhone(cleaner, mobilePhone);
  next = {
    ...next,
    mobilePhone,
    smsSchedulingOptIn: input.optIn,
    smsOptInRecordedAt: input.recordedAt,
    updatedAt: input.recordedAt,
    updatedBy: input.updatedBy,
  };

  if (input.optIn) {
    next = {
      ...next,
      smsConsentPhone: mobilePhone,
      smsConsentRecordedAt: input.recordedAt,
      smsConsentDisclosureVersion: SMS_SCHEDULING_DISCLOSURE_VERSION,
      smsConsentMethod: input.consentMethod ?? "hub_web",
    };
  } else {
    next = {
      ...next,
      smsConsentPhone: undefined,
      smsConsentRecordedAt: undefined,
      smsConsentDisclosureVersion: undefined,
      smsConsentMethod: undefined,
    };
  }

  return next;
}
