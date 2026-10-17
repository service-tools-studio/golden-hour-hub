import type { AppRole } from "@/lib/domain/types";
import type { CleanerProfile } from "@/lib/domain/types";

export function roleFromCognitoGroups(groups: string[]): AppRole | null {
  const normalized = groups.map((group) => group.toUpperCase());
  if (normalized.includes("ADMIN")) return "ADMIN";
  if (normalized.includes("CLEANER")) return "CLEANER";
  return null;
}

export function cleanerIdForEmail(cleaners: CleanerProfile[], email: string): string | null {
  const needle = email.trim().toLowerCase();
  const match = cleaners.find((cleaner) => cleaner.email.trim().toLowerCase() === needle);
  return match?.cleanerId ?? null;
}

export function cleanerIdForCognitoUser(
  cleaners: CleanerProfile[],
  sub: string,
  email: string,
): string | null {
  const bySub = cleaners.find((cleaner) => cleaner.cognitoSub && cleaner.cognitoSub === sub);
  if (bySub) return bySub.cleanerId;
  return cleanerIdForEmail(cleaners, email);
}
