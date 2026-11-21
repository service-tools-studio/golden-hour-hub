import { jasminNotifyPhoneDigitsFromEnv } from "../contact.ts";
import type { MarketId } from "../domain/markets.ts";
import { sendSms, SmsDeliveryError } from "../services/sms.ts";
import { adminNewCalendarImportSms } from "./calendar-import-notify-sms.ts";

export async function notifyJasminNewCalendarImports(input: {
  count: number;
  marketIds: MarketId[];
}): Promise<void> {
  if (input.count < 1) return;

  const to = jasminNotifyPhoneDigitsFromEnv();
  if (!to) {
    console.warn("[calendar-import:notify] no JASMIN_PHONE");
    return;
  }

  const base = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "").trim();
  const body = adminNewCalendarImportSms({
    count: input.count,
    marketIds: input.marketIds,
    dashboardUrl: base ? `${base}/admin` : undefined,
  });

  try {
    const result = await sendSms({ to, body }, { staff: true });
    console.info("[calendar-import:notify] sent", {
      to,
      created: input.count,
      marketIds: input.marketIds,
      provider: result.provider,
      confirmed: result.confirmed,
    });
  } catch (error) {
    const detail = error instanceof SmsDeliveryError ? error.userMessage : error;
    console.error("[calendar-import:notify] sms failed", { to, created: input.count, detail });
  }
}