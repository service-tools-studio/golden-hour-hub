function smsHref(phone: string, body: string): string {
  return `sms:+1${phone}?&body=${encodeURIComponent(body)}`;
}

export function kelseyPhoneDigitsFromEnv(raw: string | undefined): string {
  const digits = (raw ?? "").replace(/\D/g, "");
  const national = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  return national.length === 10 ? national : "";
}

/** Unique 10-digit US numbers from KELSEY_PHONE and JASMIN_PHONE (server notifications). */
export function adminNotifyPhoneDigitsFromEnv(
  env: { KELSEY_PHONE?: string; JASMIN_PHONE?: string } = process.env as {
    KELSEY_PHONE?: string;
    JASMIN_PHONE?: string;
  },
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of [env.KELSEY_PHONE, env.JASMIN_PHONE]) {
    const digits = kelseyPhoneDigitsFromEnv(raw);
    if (!digits || seen.has(digits)) continue;
    seen.add(digits);
    out.push(digits);
  }
  return out;
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
