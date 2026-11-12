import { NextResponse } from "next/server";
import { applyTwilioDeliveryStatusUpdate } from "@/lib/cleaner/assignment-sms-log";
import {
  formDataToParamRecord,
  statusWebhookSignatureUrls,
  twilioStatusWebhookSignatureValid,
} from "@/lib/services/twilio-inbound";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const form = await request.formData();
  const params = formDataToParamRecord(form);
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  const signature = request.headers.get("x-twilio-signature") ?? "";

  if (authToken) {
    if (!twilioStatusWebhookSignatureValid(authToken, signature, request, params)) {
      console.error("[twilio:status] invalid signature", {
        urls: statusWebhookSignatureUrls(request),
      });
      return new NextResponse("Forbidden", { status: 403 });
    }
  } else {
    console.warn("[twilio:status] TWILIO_AUTH_TOKEN unset; skipping signature validation");
  }

  const messageSid = params.MessageSid ?? params.SmsSid ?? "";
  const messageStatus = params.MessageStatus ?? params.SmsStatus ?? "";
  if (!messageSid || !messageStatus) {
    return new NextResponse("OK", { status: 200 });
  }

  const errorMessage = params.ErrorMessage?.trim() || undefined;
  try {
    const updated = await applyTwilioDeliveryStatusUpdate({
      twilioMessageSid: messageSid,
      twilioStatus: messageStatus,
      errorMessage,
    });
    if (updated) {
      console.info(`[twilio:status] ${messageSid} ${messageStatus}`);
    } else {
      console.warn(`[twilio:status] no log row for sid ${messageSid} (${messageStatus})`);
    }
  } catch (error) {
    console.error("[twilio:status] update failed", error);
  }

  return new NextResponse("OK", { status: 200 });
}
