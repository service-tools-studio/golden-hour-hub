import { normalizePhone } from "../domain/customers.ts";
import type { CleanerProfile } from "../domain/types.ts";
import { SMS_SCHEDULING_DISCLOSURE_VERSION } from "./sms-disclosure.ts";

function normalizedProfilePhone(cleaner: CleanerProfile): string | null {
  return normalizePhone(cleaner.mobilePhone);
}

/** True when automated scheduling texts may be sent to the cleaner's current mobile number. */
export function cleanerAllowsSchedulingSms(cleaner: CleanerProfile): boolean {
  if (cleaner.smsSchedulingOptIn !== true) return false;
  return schedulingSmsConsentIsCurrent(cleaner);
}

/** Opt-in consent matches profile phone and current disclosure version. */
export function schedulingSmsConsentIsCurrent(cleaner: CleanerProfile): boolean {
  if (!cleaner.smsConsentPhone || !cleaner.smsConsentRecordedAt || !cleaner.smsConsentDisclosureVersion) {
    return false;
  }
  const profilePhone = normalizedProfilePhone(cleaner);
  if (!profilePhone || cleaner.smsConsentPhone !== profilePhone) return false;
  return cleaner.smsConsentDisclosureVersion === SMS_SCHEDULING_DISCLOSURE_VERSION;
}

/** Cleaner must complete (or re-complete) the SMS enrollment screen. */
export function cleanerNeedsSmsOnboarding(cleaner: CleanerProfile): boolean {
  if (cleaner.smsOptInRecordedAt === undefined || cleaner.smsOptInRecordedAt === "") return true;
  const profilePhone = normalizedProfilePhone(cleaner);
  if (cleaner.smsConsentPhone && profilePhone && cleaner.smsConsentPhone !== profilePhone) return true;
  if (cleaner.smsSchedulingOptIn === true && !schedulingSmsConsentIsCurrent(cleaner)) return true;
  return false;
}

/** Enrollment is complete and re-consent is not required (opt-out or current opt-in consent). */
export function cleanerSmsEnrollmentUpToDate(cleaner: CleanerProfile): boolean {
  return !cleanerNeedsSmsOnboarding(cleaner);
}

/**
 * Apply a new mobile number on the profile. When the number changes, scheduling SMS consent
 * for the previous number is cleared so fresh consent is required before texts resume.
 */
export function cleanerWithMobilePhone(cleaner: CleanerProfile, mobilePhone: string): CleanerProfile {
  const profilePhone = normalizePhone(mobilePhone);
  if (!profilePhone) return cleaner;
  if (profilePhone === normalizedProfilePhone(cleaner)) return cleaner;
  return {
    ...cleaner,
    mobilePhone: profilePhone,
    smsSchedulingOptIn: false,
  };
}
