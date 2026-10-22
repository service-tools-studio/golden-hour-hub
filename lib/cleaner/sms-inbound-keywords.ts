export type SmsOptInKeyword = "START" | "YES" | "UNSTOP";

export type InboundSmsKeyword =
  | { type: "opt_in"; keyword: SmsOptInKeyword }
  | { type: "opt_out"; keyword: "STOP" }
  | { type: "help"; keyword: "HELP" }
  | { type: "none" };

const OPT_IN_KEYWORDS = new Set<SmsOptInKeyword>(["START", "YES", "UNSTOP"]);
const OPT_OUT_KEYWORDS = new Set(["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT"]);

/** First word of the body, CTIA-style (case-insensitive, punctuation stripped). */
export function parseInboundSmsKeyword(body: string): InboundSmsKeyword {
  const raw = body.trim().split(/\s+/)[0] ?? "";
  const token = raw.replace(/[^\w]/g, "").toUpperCase();
  if (!token) return { type: "none" };
  if (OPT_IN_KEYWORDS.has(token as SmsOptInKeyword)) {
    return { type: "opt_in", keyword: token as SmsOptInKeyword };
  }
  if (OPT_OUT_KEYWORDS.has(token)) {
    return { type: "opt_out", keyword: "STOP" };
  }
  if (token === "HELP" || token === "INFO") {
    return { type: "help", keyword: "HELP" };
  }
  return { type: "none" };
}

export function smsConsentMethodForOptInKeyword(keyword: SmsOptInKeyword): string {
  return `sms_${keyword.toLowerCase()}`;
}
