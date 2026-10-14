export type CalendarEvent = {
  uid: string;
  title: string;
  start: Date;
  end: Date;
  location: string;
  notes: string;
};

function utcStamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function escapeText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** RFC 5545 limits content lines to 75 octets; longer lines continue on the next line after a space. */
function fold(line: string): string {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const parts: string[] = [];
  let current = "";
  let size = 0;
  for (const char of line) {
    const width = new TextEncoder().encode(char).length;
    if (size + width > (parts.length === 0 ? 75 : 74)) {
      parts.push(current);
      current = "";
      size = 0;
    }
    current += char;
    size += width;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

export function buildIcs(event: CalendarEvent, now: Date = new Date()): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Golden Hour Cleaning Co//Golden Hour Hub//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${escapeText(event.uid)}`,
    `DTSTAMP:${utcStamp(now)}`,
    `DTSTART:${utcStamp(event.start)}`,
    `DTEND:${utcStamp(event.end)}`,
    `SUMMARY:${escapeText(event.title)}`,
    `LOCATION:${escapeText(event.location)}`,
    `DESCRIPTION:${escapeText(event.notes)}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return `${lines.map(fold).join("\r\n")}\r\n`;
}

export function icsDownloadPath(event: CalendarEvent): string {
  const params = new URLSearchParams({
    uid: event.uid,
    title: event.title,
    start: event.start.toISOString(),
    end: event.end.toISOString(),
    location: event.location,
    notes: event.notes,
  });
  return `/api/calendar?${params}`;
}

export function eventFromSearchParams(params: URLSearchParams): CalendarEvent | null {
  const start = new Date(params.get("start") ?? "");
  const end = new Date(params.get("end") ?? "");
  const title = params.get("title")?.trim() ?? "";
  if (!title || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return null;
  return {
    uid: params.get("uid")?.trim() || `${start.getTime()}@goldenhourhub`,
    title: title.slice(0, 200),
    start,
    end,
    location: (params.get("location") ?? "").slice(0, 300),
    notes: (params.get("notes") ?? "").slice(0, 2000),
  };
}

export function googleCalendarUrl(event: CalendarEvent): string {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title,
    dates: `${utcStamp(event.start)}/${utcStamp(event.end)}`,
    location: event.location,
    details: event.notes,
  });
  return `https://calendar.google.com/calendar/render?${params}`;
}

export function outlookCalendarUrl(event: CalendarEvent): string {
  const params = new URLSearchParams({
    path: "/calendar/action/compose",
    rru: "addevent",
    subject: event.title,
    startdt: event.start.toISOString(),
    enddt: event.end.toISOString(),
    location: event.location,
    body: event.notes,
  });
  return `https://outlook.live.com/calendar/0/deeplink/compose?${params}`;
}
