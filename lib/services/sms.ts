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

const TWILIO_FAIL_STATUSES = new Set(["failed", "undelivered", "canceled"]);
const TWILIO_SENT_STATUSES = new Set(["sent", "delivered", "receiving", "read"]);

function twilioAuthHeader(accountSid: string, authToken: string): string {
  return `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`;
}

async function fetchTwilioMessageStatus(
  accountSid: string,
  authToken: string,
  messageSid: string,
): Promise<{ status: string; errorMessage?: string }> {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages/${messageSid}.json`;
  const response = await fetch(url, {
    headers: { Authorization: twilioAuthHeader(accountSid, authToken) },
  });
  if (!response.ok) {
    const detail = await response.text();
    console.error("[sms:twilio:status]", response.status, detail);
    return { status: "unknown" };
  }
  const payload = (await response.json()) as { status?: string; error_message?: string };
  return { status: payload.status ?? "unknown", errorMessage: payload.error_message };
}

function twilioDeliveryFailureMessage(errorMessage?: string): string {
  if (errorMessage?.trim()) {
    if (/compliance profile|trust hub|kyc|campaign|a2p|10dlc/i.test(errorMessage)) {
      return `${errorMessage.trim()} Finish Trust Hub and US A2P registration in the Twilio console if you have not already.`;
    }
    return errorMessage.trim();
  }
  return "Twilio could not deliver this text. US A2P / Trust Hub registration may still be pending.";
}

async function sendTwilio(message: SmsMessage): Promise<{ confirmed: boolean }> {
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
      Authorization: twilioAuthHeader(accountSid, authToken),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ To: to, From: from, Body: message.body }),
  });

  const detail = await response.text();
  if (!response.ok) {
    console.error("[sms:twilio]", response.status, detail);
    throw new SmsDeliveryError(twilioUserMessage(detail), detail);
  }

  let created: { sid?: string; status?: string; error_message?: string };
  try {
    created = JSON.parse(detail) as { sid?: string; status?: string; error_message?: string };
  } catch {
    return { confirmed: false };
  }

  if (created.status && TWILIO_FAIL_STATUSES.has(created.status)) {
    throw new SmsDeliveryError(twilioDeliveryFailureMessage(created.error_message), detail);
  }

  const sid = created.sid;
  if (!sid) return { confirmed: false };

  const pollDelaysMs = [0, 500, 1000, 2000];
  for (const delay of pollDelaysMs) {
    if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
    const { status, errorMessage } = await fetchTwilioMessageStatus(accountSid, authToken, sid);
    if (TWILIO_FAIL_STATUSES.has(status)) {
      throw new SmsDeliveryError(twilioDeliveryFailureMessage(errorMessage), detail);
    }
    if (TWILIO_SENT_STATUSES.has(status)) return { confirmed: true };
  }

  return { confirmed: false };
}

export type SmsSendResult = {
  provider: "mock" | "twilio";
  /** True only when Twilio reports the message as sent/delivered (not merely queued). */
  confirmed?: boolean;
};

/**
 * Server-only SMS. Use SMS_PROVIDER=mock to log without sending.
 */
export async function sendSms(message: SmsMessage): Promise<SmsSendResult> {
  const provider = (process.env.SMS_PROVIDER ?? "mock").trim().toLowerCase();
  if (provider === "mock") {
    console.info(`[sms:mock] to=${message.to} ${message.body}`);
    return { provider: "mock" };
  }
  if (provider === "twilio") {
    const outcome = await sendTwilio(message);
    return { provider: "twilio", confirmed: outcome.confirmed };
  }
  throw new SmsDeliveryError(`Unknown SMS_PROVIDER: ${provider}`);
}
