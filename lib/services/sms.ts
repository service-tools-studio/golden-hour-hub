export type SmsMessage = {
  to: string;
  body: string;
};

/**
 * Local development logs messages.
 * A live provider can replace this module without changing callers.
 */
export async function sendSms(message: SmsMessage): Promise<void> {
  const provider = process.env.SMS_PROVIDER ?? "mock";
  if (provider === "mock") {
    console.info(`[sms:mock] to=${message.to} ${message.body}`);
    return;
  }
  console.error("[sms] SMS_PROVIDER is set, but no live provider is configured.");
  throw new Error("SMS provider is not configured.");
}
