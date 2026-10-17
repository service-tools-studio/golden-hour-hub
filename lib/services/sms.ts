export type SmsMessage = {
  /** US mobile: 10 digits (preferred) or E.164 (+1…). */
  to: string;
  body: string;
};

/** Shown in the app when Twilio (or config) rejects a send. */
export class SmsDeliveryError extends Error {
  readonly userMessage: string;

  constructor(userMessage: string, detail?: string) {
    super(detail ?? userMessage);
    this.name = "SmsDeliveryError";
    this.userMessage = userMessage;
  }
}

function twilioUserMessage(responseBody: string): string {
  try {
    const parsed = JSON.parse(responseBody) as { code?: number; message?: string };
    if (parsed.code === 572006) {
      return "Twilio trial accounts cannot send custom texts. Upgrade your Twilio account to send these messages.";
    }
    if (parsed.code === 21610) {
      return "That number is not verified on your Twilio trial account. Verify it in the Twilio console or upgrade your account.";
    }
    if (parsed.code === 21606 || parsed.code === 21607) {
      return "TWILIO_FROM_NUMBER is not a valid SMS sender for this Twilio account. Use the exact number from Phone Numbers in Twilio.";
    }
    const text = parsed.message ?? "";
    if (/compliance profile|trust hub|kyc/i.test(text)) {
      return `${text} Complete it under Twilio Console → Trust Hub → Profiles (primary business profile), then finish any Messaging registration (e.g. US A2P 10DLC) if prompted.`;
    }
    if (text) return text;
  } catch {
    // not JSON
  }
  return "The text could not be sent. Please try again.";
}

/** App storage uses 10-digit US numbers; Twilio expects E.164. */
export function smsToE164(to: string): string {
  const trimmed = to.trim();
  if (trimmed.startsWith("+")) return trimmed;
  const digits = trimmed.replace(/\D/g, "");
  const national = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  if (national.length !== 10) {
    throw new SmsDeliveryError("SMS recipient must be a 10-digit US number.");
  }
  return `+1${national}`;
}

async function sendTwilio(message: SmsMessage): Promise<void> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  const from = process.env.TWILIO_FROM_NUMBER?.trim();
  if (!accountSid || !authToken || !from) {
    throw new SmsDeliveryError(
      "Twilio is not configured on the server (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER).",
    );
  }

  const to = smsToE164(message.to);
  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ To: to, From: from, Body: message.body }),
  });

  if (!response.ok) {
    const detail = await response.text();
    console.error("[sms:twilio]", response.status, detail);
    throw new SmsDeliveryError(twilioUserMessage(detail), detail);
  }
}

/**
 * Server-only SMS. Use SMS_PROVIDER=mock to log without sending.
 */
export async function sendSms(message: SmsMessage): Promise<void> {
  const provider = (process.env.SMS_PROVIDER ?? "mock").trim().toLowerCase();
  if (provider === "mock") {
    console.info(`[sms:mock] to=${message.to} ${message.body}`);
    return;
  }
  if (provider === "twilio") {
    await sendTwilio(message);
    return;
  }
  throw new SmsDeliveryError(`Unknown SMS_PROVIDER: ${provider}`);
}
