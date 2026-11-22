import "server-only";

export type GoogleCalendarEvent = {
  id: string;
  status?: string;
  summary?: string;
  description?: string;
  location?: string;
  htmlLink?: string;
  iCalUID?: string;
  attendees?: { email?: string; organizer?: boolean; self?: boolean; responseStatus?: string }[];
  start?: { date?: string; dateTime?: string; timeZone?: string };
  end?: { date?: string; dateTime?: string; timeZone?: string };
};

export function googleCalendarImportConfigured(): boolean {
  if (process.env.GOOGLE_CALENDAR_ENABLED !== "true") return false;
  const calendarId = process.env.GOOGLE_CALENDAR_ID?.trim();
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  const refreshToken = process.env.GOOGLE_CALENDAR_REFRESH_TOKEN?.trim();
  return Boolean(calendarId && clientId && clientSecret && refreshToken);
}

async function fetchAccessToken(): Promise<string> {
  const clientId = process.env.GOOGLE_CLIENT_ID!.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET!.trim();
  const refreshToken = process.env.GOOGLE_CALENDAR_REFRESH_TOKEN!.trim();
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Google OAuth token failed (${response.status}): ${text.slice(0, 200)}`);
  }
  const data = (await response.json()) as { access_token?: string };
  if (!data.access_token) throw new Error("Google OAuth returned no access_token.");
  return data.access_token;
}

export function googleCalendarWebhookUrl(): string | null {
  const base = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "").trim();
  if (!base) return null;
  return `${base}/api/google-calendar/webhook`;
}

export function googleCalendarWatchChannelToken(): string {
  return process.env.GOOGLE_CALENDAR_WEBHOOK_TOKEN?.trim() ?? "";
}

export type GoogleCalendarWatchChannel = {
  channelId: string;
  resourceId: string;
  expirationMs: number;
};

/** Register push notifications for calendar event changes (expires in ~7 days). */
export async function watchGoogleCalendarEvents(input: {
  webhookUrl: string;
  channelId: string;
  channelToken?: string;
  ttlSeconds?: number;
}): Promise<GoogleCalendarWatchChannel> {
  if (!googleCalendarImportConfigured()) {
    throw new Error("Google Calendar import is not configured.");
  }
  const calendarId = encodeURIComponent(process.env.GOOGLE_CALENDAR_ID!.trim());
  const accessToken = await fetchAccessToken();
  const ttl = Math.min(Math.max(input.ttlSeconds ?? 604800, 3600), 604800);
  const body: Record<string, unknown> = {
    id: input.channelId,
    type: "web_hook",
    address: input.webhookUrl,
    params: { ttl: String(ttl) },
  };
  if (input.channelToken) body.token = input.channelToken;

  const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/watch`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Google Calendar watch failed (${response.status}): ${text.slice(0, 200)}`);
  }
  const payload = (await response.json()) as { id?: string; resourceId?: string; expiration?: string };
  const channelId = payload.id ?? input.channelId;
  const resourceId = payload.resourceId ?? "";
  const expirationMs = payload.expiration ? Number(payload.expiration) : Date.now() + ttl * 1000;
  if (!resourceId) throw new Error("Google Calendar watch returned no resourceId.");
  return { channelId, resourceId, expirationMs };
}

export async function stopGoogleCalendarWatchChannel(input: { channelId: string; resourceId: string }): Promise<void> {
  const accessToken = await fetchAccessToken();
  const response = await fetch("https://www.googleapis.com/calendar/v3/channels/stop", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ id: input.channelId, resourceId: input.resourceId }),
  });
  if (!response.ok && response.status !== 404) {
    const text = await response.text().catch(() => "");
    console.warn("[gcal:watch] stop channel failed", response.status, text.slice(0, 120));
  }
}

export async function listGoogleCalendarEventsInRange(input: {
  timeMinIso: string;
  timeMaxIso: string;
}): Promise<GoogleCalendarEvent[]> {
  if (!googleCalendarImportConfigured()) return [];
  const calendarId = encodeURIComponent(process.env.GOOGLE_CALENDAR_ID!.trim());
  const accessToken = await fetchAccessToken();
  const events: GoogleCalendarEvent[] = [];
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({
      timeMin: input.timeMinIso,
      timeMax: input.timeMaxIso,
      singleEvents: "true",
      showDeleted: "true",
      orderBy: "startTime",
      maxResults: "250",
      fields:
        "items(id,status,summary,description,location,htmlLink,iCalUID,attendees(email,organizer,self,responseStatus),start,end),nextPageToken",
    });
    if (pageToken) params.set("pageToken", pageToken);
    const url = `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events?${params}`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`Google Calendar list failed (${response.status}): ${text.slice(0, 200)}`);
    }
    const payload = (await response.json()) as { items?: GoogleCalendarEvent[]; nextPageToken?: string };
    events.push(...(payload.items ?? []));
    pageToken = payload.nextPageToken;
  } while (pageToken);
  return events;
}

const EVENT_FIELDS =
  "id,status,summary,description,location,htmlLink,iCalUID,attendees(email,organizer,self,responseStatus),start,end";

async function fetchGoogleCalendarEventByPath(eventPathSegment: string): Promise<GoogleCalendarEvent | null> {
  const calendarId = encodeURIComponent(process.env.GOOGLE_CALENDAR_ID!.trim());
  const accessToken = await fetchAccessToken();
  const url = `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/${eventPathSegment}?fields=${EVENT_FIELDS}`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (response.status === 404) return null;
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Google Calendar get failed (${response.status}): ${text.slice(0, 200)}`);
  }
  return (await response.json()) as GoogleCalendarEvent;
}

/** Fetch one calendar event by id (works even when it falls outside a list window). */
export async function getGoogleCalendarEvent(eventId: string): Promise<GoogleCalendarEvent | null> {
  if (!googleCalendarImportConfigured()) return null;
  const trimmed = eventId.trim();
  if (!trimmed) return null;
  const encoded = encodeURIComponent(trimmed);
  const fetched = await fetchGoogleCalendarEventByPath(encoded);
  if (fetched) return fetched;
  if (encoded !== trimmed) {
    return fetchGoogleCalendarEventByPath(trimmed);
  }
  return null;
}