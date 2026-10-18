import { smsHref } from "@/lib/format";

export function kelseyPhoneDigitsFromEnv(raw: string | undefined): string {
  return (raw ?? "").replace(/\D/g, "");
}

export function kelseyContactLinks(
  digits: string,
  smsBody?: string,
): { telHref: string; smsHref: string } | null {
  const normalized = kelseyPhoneDigitsFromEnv(digits);
  if (!normalized) return null;
  return {
    telHref: `tel:+1${normalized}`,
    smsHref: smsBody ? smsHref(normalized, smsBody) : `sms:+1${normalized}`,
  };
}
