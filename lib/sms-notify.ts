export type CleanerTextResult =
  | { ok: true; provider: "mock" | "twilio"; confirmed: boolean }
  | { ok: false; message: string };

/** One toast after assign/invite: assignment saved, then honest SMS outcome. */
export function assignmentSmsToast(
  cleanerFirstName: string,
  assignmentMessage: string | undefined,
  sms: CleanerTextResult,
): string {
  const base = assignmentMessage?.trim() || "Saved.";
  if (!sms.ok) {
    return `${base} Text not sent to ${cleanerFirstName}. ${sms.message}`;
  }
  if (sms.confirmed) {
    return `${base} Text sent to ${cleanerFirstName}.`;
  }
  if (sms.provider === "mock") {
    return `${base} SMS was not sent (mock mode — set SMS_PROVIDER=twilio to deliver).`;
  }
  return `${base} Text not confirmed for ${cleanerFirstName} — Twilio has not reported delivery yet (common while A2P / Trust Hub is pending).`;
}

export function followUpSmsToast(cleanerFirstName: string, sms: CleanerTextResult): string {
  if (!sms.ok) return `Text not sent to ${cleanerFirstName}. ${sms.message}`;
  if (sms.confirmed) return `Text sent to ${cleanerFirstName}.`;
  if (sms.provider === "mock") return `SMS was not sent (mock mode).`;
  return `Text not confirmed for ${cleanerFirstName} — Twilio has not reported delivery yet (common while A2P / Trust Hub is pending).`;
}
