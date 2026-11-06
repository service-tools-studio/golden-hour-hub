export type SmsSendResult = {
  provider: "mock" | "twilio";
  /** True only when Twilio reports the message as sent/delivered (not merely queued). */
  confirmed?: boolean;
  messageSid?: string;
  twilioStatus?: string;
};
