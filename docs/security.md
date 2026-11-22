# Security posture (Golden Hour Hub)

This doc maps how Hub meets common production expectations for **API authorization**, **input validation**, and **safe rendering**. Use it for reviews and onboarding—not as a formal compliance attestation.

## API authorization

### Cognito sessions

- Sign-in uses Cognito (`lib/auth/cognito.ts`, `app/api/auth/*`). The app session cookie is validated server-side (`lib/auth/session.ts`, `lib/auth/cookie-edge.ts` on the edge).
- **Middleware** (`middleware.ts`) enforces role on UI routes when Cognito is configured: `/admin/*` → `ADMIN`, `/cleaner/*` and `/onboarding/*` → `CLEANER`.

### Server actions

All mutation and sensitive read paths under `app/actions/` call **`requireAdmin()`**, **`requireCleaner()`**, or **`requireSession()`** via `lib/auth/guards.ts` before touching DynamoDB or sending ops messages.

- **Admin** — customers, jobs, assignments, calendar import, notifications, SMS logs, hub persist, etc. (`admin-hub.ts`, `admin-jobs.ts`, `calendar-import.ts`, …).
- **Cleaner** — accept/decline invite, availability, SMS onboarding, questionnaire submit (`cleaner-hub.ts`, `sms-onboarding.ts`, `contractor-questionnaire.ts`).
- **Cleaner-scoped data** — `hubDataForCleaner()` strips other cleaners’ pay, customer PII beyond job context, admin-only slices (`lib/auth/hub-scope.ts`). Mutations pass `session.cleanerId` so one cleaner cannot act on another’s rows.

### HTTP API routes

| Route | Auth |
| --- | --- |
| `GET /api/hub/sync`, `GET /api/hub/version` | Cognito (or preview rules); returns **401** when unauthorized; admin vs cleaner loads different hub slices (`loadRemoteHubSync`). |
| `GET /api/places/*` | Cognito session required when pool is configured. |
| `GET /api/admin/.../pdf` | `requireAdmin()`. |
| `POST /api/twilio/sms/inbound` | Twilio **request signature** when `TWILIO_AUTH_TOKEN` is set. |
| `GET /api/cron/*` | `Authorization: Bearer $CRON_SECRET` in production. |
| `POST /api/google-calendar/webhook` | Channel token + watch state (`googleCalendarWebhookAuthorized`). |
| `GET /api/calendar` | **No session** — builds an `.ics` from **query parameters only** (no DB read). Used for “Add to calendar” download links; event content is whatever the client places in the URL. |
| `POST /api/auth/*` | Login/password flows (public by design). |

### Exceptions / dev

- **Preview auth** (`PREVIEW_AUTH`, mock hub): relaxed rules so local/demo can run without Cognito; do not enable preview admin against production DynamoDB without understanding `remoteHubAccess()` in `lib/hub/bootstrap-remote.ts`.
- **`purgeAssignmentSmsLogsOnCleanerRemoval`** skips `requireAdmin()` when preview auth is enabled (local cleanup helper only).

## Input validation

Validation runs **server-side** in domain/hub layers, not only in the browser.

| Area | Where |
| --- | --- |
| Customers, properties, addresses, phone, email | `validateCustomerInput()` / `validateProperty()` — `lib/domain/customers.ts` |
| Visit arrival windows | `validateArrivalWindow`, `validateOptionalVisitArrival` — `lib/domain/arrival.ts` |
| Duration | `validateOptionalDurationMinutes` — `lib/domain/duration.ts` |
| Contractor questionnaire | `validateQuestionnaireInput` — `lib/domain/contractor-questionnaire.ts` |
| Create cleaner (Cognito) | `validateCreateCleanerAccountInput` — `lib/hub/create-cleaner-account.ts` |
| Calendar import approve | `validateOptionalVisitArrival`, crew/pay checks — hub + domain |

Customer **notes**, property **preferences**, and job **special instructions** are trimmed and rendered as plain text (see below). There is no `dangerouslySetInnerHTML` on stored content. Optional hardening: add max-length caps on long text fields if you need abuse/storage limits.

## Safe rendering (XSS)

- Repository search: **no `dangerouslySetInnerHTML`** in the app.
- Customer/cleaner-facing notes use normal React text nodes (e.g. `JobNoteBlock` in `components/jobs/job-detail.tsx` — `whitespace-pre-line` on `{text}`).
- ICS output escapes calendar text fields (`escapeText` in `lib/calendar.ts`).

## Related code entry points

- Guards: `lib/auth/guards.ts`
- Hub load authorization: `lib/hub/bootstrap-remote.ts`
- Role middleware: `middleware.ts`