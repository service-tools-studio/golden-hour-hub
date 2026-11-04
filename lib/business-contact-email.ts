function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/** Golden Hour COI / business inbox; override in production with env vars when needed. */
export const GOLDEN_HOUR_BUSINESS_CONTACT_EMAIL = "golden.hour.cleaning.company@gmail.com";

/** Required additional insured on contractor certificates of insurance. */
export const COI_ADDITIONAL_INSURED_LEGAL_NAME = "Heart Aligned Wellness LLC dba Golden Hour Cleaning Co";
export const COI_ADDITIONAL_INSURED_ADDRESS = "5441 S Macadam Ave., #4907, Portland, OR 97239";

type BusinessContactEnv = {
  NEXT_PUBLIC_BUSINESS_CONTACT_EMAIL?: string;
  BUSINESS_CONTACT_EMAIL?: string;
};

/** Configured inbox only (no default). */
export function businessContactEmailFromEnv(
  env: BusinessContactEnv = process.env as BusinessContactEnv,
): string | null {
  const raw = env.NEXT_PUBLIC_BUSINESS_CONTACT_EMAIL?.trim() || env.BUSINESS_CONTACT_EMAIL?.trim();
  if (!raw || !isEmail(raw)) return null;
  return raw;
}

/** Inbox shown to cleaners (env override, then {@link GOLDEN_HOUR_BUSINESS_CONTACT_EMAIL}). */
export function businessContactEmail(
  env: BusinessContactEnv = process.env as BusinessContactEnv,
): string {
  return businessContactEmailFromEnv(env) ?? GOLDEN_HOUR_BUSINESS_CONTACT_EMAIL;
}
