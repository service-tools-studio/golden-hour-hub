import type { CleanerProfile } from "@/lib/domain/types";

export function cleanerNeedsSmsOnboarding(cleaner: CleanerProfile): boolean {
  return cleaner.smsOptInRecordedAt === undefined || cleaner.smsOptInRecordedAt === "";
}

export function cleanerAllowsSchedulingSms(cleaner: CleanerProfile): boolean {
  return cleaner.smsSchedulingOptIn === true;
}
