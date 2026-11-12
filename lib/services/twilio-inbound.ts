import crypto from "node:crypto";

export function twilioInboundWebhookUrl(request: Request): string {
  const configured = process.env.TWILIO_INBOUND_WEBHOOK_URL?.trim();
  if (configured) return configured;
  return requestWebhookUrl(request);
}

/** URL Twilio actually POSTed to (respects Vercel/proxy forwarded host). */
export function requestWebhookUrl(request: Request): string {
  const pathname = new URL(request.url).pathname;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto") ?? new URL(request.url).protocol.replace(":", "");
  if (host) return `${proto}://${host}${pathname}`;
  const url = new URL(request.url);
  return `${url.origin}${pathname}`;
}

function urlSignatureVariants(url: string): string[] {
  const trimmed = url.trim();
  if (!trimmed) return [];
  const variants = new Set<string>([trimmed]);
  if (trimmed.endsWith("/")) variants.add(trimmed.replace(/\/+$/, ""));
  else variants.add(`${trimmed}/`);
  return [...variants];
}

/** Twilio signs the webhook URL configured on the number; try env + live request variants. */
export function inboundWebhookSignatureUrls(request: Request): string[] {
  const urls = new Set<string>();
  for (const base of [
    process.env.TWILIO_INBOUND_WEBHOOK_URL?.trim(),
    requestWebhookUrl(request),
    twilioInboundWebhookUrl(request),
  ]) {
    if (!base) continue;
    for (const variant of urlSignatureVariants(base)) urls.add(variant);
  }
  return [...urls];
}

export function twilioRequestSignatureValid(
  authToken: string,
  signature: string,
  request: Request,
  params: Record<string, string>,
): boolean {
  if (!signature) return false;
  return inboundWebhookSignatureUrls(request).some((url) =>
    validateTwilioSignature(authToken, signature, url, params),
  );
}

/** Must include every URL we pass to Twilio as `StatusCallback` (see `twilioStatusCallbackUrl` in sms.ts). */
export function statusWebhookSignatureUrls(request: Request): string[] {
  const urls = new Set<string>();
  const add = (base: string | undefined) => {
    if (!base) return;
    for (const variant of urlSignatureVariants(base)) urls.add(variant);
  };
  add(process.env.TWILIO_STATUS_CALLBACK_URL?.trim());
  add(requestWebhookUrl(request));
  const appBase = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (appBase) add(`${appBase}/api/twilio/sms/status`);
  const inboundConfigured = process.env.TWILIO_INBOUND_WEBHOOK_URL?.trim();
  if (inboundConfigured) {
    add(inboundConfigured.replace(/\/inbound\/?$/, "/status"));
  } else {
    add(twilioInboundWebhookUrl(request).replace(/\/inbound\/?$/, "/status"));
  }
  return [...urls];
}

export function twilioStatusWebhookSignatureValid(
  authToken: string,
  signature: string,
  request: Request,
  params: Record<string, string>,
): boolean {
  if (!signature) return false;
  return statusWebhookSignatureUrls(request).some((url) =>
    validateTwilioSignature(authToken, signature, url, params),
  );
}

export function formDataToParamRecord(form: FormData): Record<string, string> {
  const params: Record<string, string> = {};
  form.forEach((value, key) => {
    if (typeof value === "string") params[key] = value;
  });
  return params;
}

/** @see https://www.twilio.com/docs/usage/security#validating-requests */
export function validateTwilioSignature(
  authToken: string,
  signature: string,
  url: string,
  params: Record<string, string>,
): boolean {
  if (!signature) return false;
  const sortedKeys = Object.keys(params).sort();
  let data = url;
  for (const key of sortedKeys) {
    data += key + params[key];
  }
  const expected = crypto.createHmac("sha1", authToken).update(data, "utf8").digest("base64");
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

export function twimlMessage(body: string): string {
  const escaped = body
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escaped}</Message></Response>`;
}
