# Google Calendar sync

## Phase 1 (import)

When `GOOGLE_CALENDAR_ENABLED=true` and OAuth env vars are set, Hub imports events from `GOOGLE_CALENDAR_ID` for **today through +90 days**, upserts `calendar_import` rows in Dynamo, and surfaces **Pending** imports on the admin dashboard under **Jobs imported from Gmail**.

Admins review at `/admin/calendar-imports/[importId]`, match or create a customer, edit visit details, then **Approve** (creates a draft Hub job with `googleCalendarEventId`) or **Dismiss**.

**Check Gmail** (and the import cron/webhook) re-fetches Google Calendar for the same 90-day window. Hub then:

- Updates pending import rows when an event’s date or arrival changes (reschedule).
- Marks pending imports **withdrawn** when an event is cancelled or deleted from Google.
- Treats Calendly-style **`Canceled:`** / **`Cancelled:`** event titles as cancellations even when Google still returns `status: confirmed`.
- Loads **approved** import rows from Dynamo during sync (they are not kept in the admin hub slice) so deleted events still cancel linked jobs.
- For **approved** imports, moves the linked Hub job to the new date/time or **cancels** it when the calendar event is removed or cancelled; sets import status to **`CALENDAR_CANCELED`** for dashboard follow-up (notify cleaners, then dismiss).

### Near-real-time push

1. **Watch registration** — Daily cron `GET /api/cron/calendar-import-watch` (Vercel `0 7 * * *`) calls Google `events.watch` with webhook URL `{NEXT_PUBLIC_APP_URL}/api/google-calendar/webhook`. Channel state is stored on Dynamo `HUB` / `GCAL_WATCH`. Channels expire in ~7 days; the cron renews when expiry is within 48 hours.
2. **Webhook** — `POST /api/google-calendar/webhook` validates `X-Goog-Channel-ID` / `X-Goog-Resource-ID` (and optional `GOOGLE_CALENDAR_WEBHOOK_TOKEN` via `X-Goog-Channel-Token`), then runs the same import pass as the daily cron.
3. **Daily backstop** — `GET /api/cron/calendar-import` (`0 9 * * *`) still runs a full range import if a push was missed.

When **automated** sync (daily cron or Google push webhook) **persists one or more new** `PENDING_REVIEW` imports, Hub texts **`JASMIN_PHONE`** (Twilio staff SMS) with the count and a link to `/admin` (`NEXT_PUBLIC_APP_URL`). Dashboard **Check Gmail** does not send that text. Updates to existing import rows do not trigger it.

Production needs:

- Public `NEXT_PUBLIC_APP_URL` (HTTPS)
- `CRON_SECRET` on both cron routes
- Optional `GOOGLE_CALENDAR_WEBHOOK_TOKEN` (recommended) — shared secret on the watch channel

Local dev: push notifications need a tunnel to your machine; use the daily cron or call the import cron manually otherwise.

## Phase 2 (outbound — later)

`lib/services/google-calendar.ts` remains the integration point for Hub → Calendar. After approve/create/update visit, call `syncJobToGoogleCalendar` asynchronously using `Job.googleCalendarEventId` for idempotent `events.insert` / `events.patch`. Failures must never block scheduling saves.