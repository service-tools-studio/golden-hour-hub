# Google Calendar sync

## Phase 1 (import)

When `GOOGLE_CALENDAR_ENABLED=true` and OAuth env vars are set, Hub imports events from `GOOGLE_CALENDAR_ID` for **today through +60 days**, upserts `calendar_import` rows in Dynamo, and surfaces **Pending** imports on the admin dashboard under **Jobs imported from Gmail**.

Admins review at `/admin/calendar-imports/[importId]`, match or create a customer, edit visit details, then **Approve** (creates a draft Hub job with `googleCalendarEventId`) or **Dismiss**. Dismissed imports appear under **Recently dismissed**; sync-withdrawn rows appear under **Removed by sync** (listed first). Both are recoverable for 14 days. **Reopen for review** returns them to the pending queue; sync-removed rows also run **Check Gmail** to refresh parsed details. When any imports were withdrawn by sync, the dashboard shows a badge next to **Check Gmail** (e.g. “2 imports removed by sync — review”).

**Check Gmail** (and the import cron/webhook) re-fetches Google Calendar for the same 60-day window. Hub then:

- Updates pending import rows when an event’s date or arrival changes (reschedule).
- When an **approved** import’s date or arrival changes and the linked job still has **invited or confirmed** cleaners, Hub updates assignment dates, sets **needs re-invite** on those rows, and the linked job shows under **Jobs needing attention** on the dashboard (re-invite cleaners flag) until you text staff from the job.
- Marks pending imports **withdrawn** when an event is cancelled or deleted from Google.
- Treats Calendly-style **`Canceled:`** / **`Cancelled:`** event titles as cancellations even when Google still returns `status: confirmed`.
- Loads **approved** import rows from Dynamo during sync (they are not kept in the admin hub slice) so deleted events still cancel linked jobs.
- For **approved** imports, moves the linked Hub job to the new date/time or **cancels** it when the calendar event is removed or cancelled; sets import status to **`CALENDAR_CANCELED`** for dashboard follow-up (notify cleaners, then dismiss).
- **Reschedule** (same linked job, new date) must not show a cancel card on the **old** import date — stale `CALENDAR_CANCELED` / pending rows are withdrawn quietly when the hub job is still scheduled on a different day.

### Near-real-time push

1. **Watch registration** — Daily cron `GET /api/cron/calendar-import-watch` (Vercel `0 7 * * *`) calls Google `events.watch` with webhook URL `{NEXT_PUBLIC_APP_URL}/api/google-calendar/webhook`. Channel state is stored on Dynamo `HUB` / `GCAL_WATCH`. Channels expire in ~7 days; the cron renews when expiry is within 48 hours.
2. **Webhook** — `POST /api/google-calendar/webhook` validates `X-Goog-Channel-ID` / `X-Goog-Resource-ID` (and optional `GOOGLE_CALENDAR_WEBHOOK_TOKEN` via `X-Goog-Channel-Token`), then runs the same import pass as the daily cron.
3. **Daily backstop** — `GET /api/cron/calendar-import` (`0 9 * * *`) still runs a full range import if a push was missed.

When **automated** sync (daily cron or Google push webhook) **persists one or more new** `PENDING_REVIEW` imports, Hub texts **`JASMIN_PHONE`** (Twilio staff SMS) with the count, which market(s) they are in, and a link to `/admin` (`NEXT_PUBLIC_APP_URL`). Dashboard **Check Gmail** does not send that text. Updates to existing import rows do not trigger it.

Production needs:

- Public `NEXT_PUBLIC_APP_URL` (HTTPS)
- `CRON_SECRET` on both cron routes
- Optional `GOOGLE_CALENDAR_WEBHOOK_TOKEN` (recommended) — shared secret on the watch channel

Local dev: push notifications need a tunnel to your machine; use the daily cron or call the import cron manually otherwise.

### Reset import staging (Dynamo)

To wipe import rows and watch state without touching customers, jobs, or cleaners:

```bash
npm run dynamo:clear-calendar-sync -- --dry-run   # preview counts
npm run dynamo:clear-calendar-sync              # delete imports + GCAL_WATCH; clear job Gmail links
npm run dynamo:clear-calendar-sync -- --keep-job-links   # imports/watch only
```

Then use **Check Gmail** on the admin dashboard to pull events again.

### Link existing cleanings (`/admin/sync-link`)

When a Hub job was created manually (or an import was dismissed) but the Gmail event still exists, use **Link Gmail ↔ Hub** on the dashboard. The page lists suggested matches, unlinked Gmail events, and unlinked cleanings; **Link** sets `googleCalendarEventId` and marks the import **APPROVED** so future syncs move/cancel the job. Optionally **align hub date/time from Gmail** when linking.

## Phase 2 (outbound — later)

`lib/services/google-calendar.ts` remains the integration point for Hub → Calendar. After approve/create/update visit, call `syncJobToGoogleCalendar` asynchronously using `Job.googleCalendarEventId` for idempotent `events.insert` / `events.patch`. Failures must never block scheduling saves.