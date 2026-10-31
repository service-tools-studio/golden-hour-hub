import { NextResponse } from "next/server";
import { mergeInboundCleanerUpdates, planInboundSmsReply } from "@/lib/cleaner/sms-inbound";
import { dynamoConfigured, loadHub, saveHub } from "@/lib/data/repository";
import {
  formDataToParamRecord,
  inboundWebhookSignatureUrls,
  twilioRequestSignatureValid,
  twimlMessage,
} from "@/lib/services/twilio-inbound";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const form = await request.formData();
  const params = formDataToParamRecord(form);
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  const signature = request.headers.get("x-twilio-signature") ?? "";

  if (authToken) {
    if (!twilioRequestSignatureValid(authToken, signature, request, params)) {
      console.error("[twilio:inbound] invalid signature", {
        urls: inboundWebhookSignatureUrls(request),
      });
      return new NextResponse("Forbidden", { status: 403 });
    }
  } else {
    console.warn("[twilio:inbound] TWILIO_AUTH_TOKEN unset; skipping signature validation");
  }

  const from = params.From ?? "";
  const body = params.Body ?? "";
  if (!from || !body.trim()) {
    return new NextResponse("<Response></Response>", {
      status: 200,
      headers: { "Content-Type": "text/xml" },
    });
  }

  if (!dynamoConfigured()) {
    console.error("[twilio:inbound] hub database not configured");
    return new NextResponse(twimlMessage("Golden Hour Hub is temporarily unavailable. Please try again later."), {
      status: 200,
      headers: { "Content-Type": "text/xml" },
    });
  }

  try {
    const hub = await loadHub();
    const plan = planInboundSmsReply(hub, from, body);

    if (plan.action === "opt_in" || plan.action === "opt_out") {
      const next = mergeInboundCleanerUpdates(hub, plan.cleaners);
      await saveHub(next);
      console.info(`[twilio:inbound] ${plan.action} from=${from} cleaners=${plan.cleaners.map((c) => c.cleanerId).join(",")}`);
    }

    if (plan.action === "message" || plan.action === "opt_in" || plan.action === "opt_out") {
      console.info(`[twilio:inbound] reply action=${plan.action} from=${from}`);
      return new NextResponse(twimlMessage(plan.body), {
        status: 200,
        headers: { "Content-Type": "text/xml" },
      });
    }

    return new NextResponse("<Response></Response>", {
      status: 200,
      headers: { "Content-Type": "text/xml" },
    });
  } catch (error) {
    console.error("[twilio:inbound] handler failed", error);
    return new NextResponse(twimlMessage("Something went wrong. Please try again or contact Jasmin for help."), {
      status: 200,
      headers: { "Content-Type": "text/xml" },
    });
  }
}
