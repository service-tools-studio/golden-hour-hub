import { cleanerWithMobilePhone } from "./sms-consent.ts";
import { SMS_SCHEDULING_DISCLOSURE_VERSION } from "./sms-disclosure.ts";
import { normalizePhone } from "../domain/customers.ts";
import type { CleanerProfile } from "../domain/types.ts";

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
