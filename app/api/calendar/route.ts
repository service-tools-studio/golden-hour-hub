import { buildIcs, eventFromSearchParams } from "@/lib/calendar";

export function GET(request: Request) {
  const event = eventFromSearchParams(new URL(request.url).searchParams);
  if (!event) return new Response("That calendar event is missing a title or time.", { status: 400 });
  return new Response(buildIcs(event), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="golden-hour-cleaning.ics"',
      "Cache-Control": "no-store",
    },
  });
}
