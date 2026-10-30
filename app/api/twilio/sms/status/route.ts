import { NextResponse } from "next/server";
import { applyTwilioDeliveryStatusUpdate } from "@/lib/cleaner/assignment-sms-log";
import {
  formDataToParamRecord,
  twilioInboundWebhookUrl,
  validateTwilioSignature,
} from "@/lib/services/twilio-inbound";

export const dynamic = "force-dynamic";

function statusCallbackUrl(request: Request): string {
  const configured = process.env.TWILIO_STATUS_CALLBACK_URL?.trim();
  if (configured) return configured;
  return twilioInboundWebhookUrl(request).replace(/\/inbound\/?$/, "/status");
}

export async function POST(request: Request) {
  const form = await request.formData();
  const params = formDataToParamRecord(form);
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  const signature = request.headers.get("x-twilio-signature") ?? "";

  if (authToken) {
    const url = statusCallbackUrl(request);
    if (!validateTwilioSignature(authToken, signature, url, params)) {
      console.error("[twilio:status] invalid signature");
      return new NextResponse("Forbidden", { status: 403 });
    }
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
    }
  } catch (error) {
    console.error("[twilio:status] update failed", error);
  }

  return new NextResponse("OK", { status: 200 });
}
