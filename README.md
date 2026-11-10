# Golden Hour Hub

Scheduling and cleaner availability for Golden Hour Cleaning Co. Admins staff jobs from a phone. Cleaners submit weekly availability and accept or decline each cleaning.

The business timezone is `America/Los_Angeles`.

## What works now

The app is a mobile-first preview on sample data, plus the scheduling rules as tested TypeScript.

- Admin dashboard for missing availability and job headcount
- Admin schedule (day, week, and month)
- Customers: search, create, edit, and history
- Team profiles, including who is approved to bring helpers
- Cleaner home, confirmed schedule, and weekly availability
- Invitations, crew size, and pay checks for helper-approved and solo cleaners

Sign-in and live SMS are not connected yet. With `DYNAMODB_TABLE_NAME` set, data lives in DynamoDB; without it, the preview store in the browser starts empty (no mock seed on load). Load cleaners with `npm run seed:cleaners`. The table design is in [docs/data-model.md](docs/data-model.md). Scheduling behavior is in [docs/scheduling-rules.md](docs/scheduling-rules.md). SMS message bodies are listed in [docs/sms-audit.md](docs/sms-audit.md).

## Local setup

Use Node 24.

```bash
nvm use 24
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). With `AUTH_SESSION_SECRET` unset, choose Admin or a cleaner (preview). When `DYNAMODB_TABLE_NAME` is set, preview saves still go to that table (use a dedicated test table). With Cognito and `AUTH_SESSION_SECRET` set, `/` sends you to `/login`.

```bash
npm test
```

### End-to-end tests (Playwright)

Uses a **dedicated** DynamoDB table (default `GoldenHourHub-e2e`). `globalSetup` clears and reseeds that table before the suite.

1. AWS credentials in `.env.local` are enough, or copy [e2e/env.example](e2e/env.example) to `e2e/.env` to override the table name. Prepare/tests always target **`GoldenHourHub-e2e`** (override with `E2E_DYNAMODB_TABLE_NAME`).
2. `npm install` then **`npm run playwright:install`** (downloads Chromium; required once per machine after `@playwright/test` updates)
3. `npm run test:e2e` (starts Next on port **3099** with `E2E_PREVIEW_AUTH=true` so Cognito is not required; stop an existing `npm run dev` if the e2e server cannot acquire the Next dev lock)

```bash
npm run e2e:prepare   # clear + seed only
npm run test:e2e:ui   # Playwright UI (headed Chrome + step-through)
```

In **UI mode**, the preview stays empty until you **run** a test: that starts Next on [http://localhost:3099](http://localhost:3099) (not your usual `npm run dev` port). You are not meant to browse the app inside the UI like a normal tab—either watch the headed window while tests run, or open port 3099 yourself while the UI session is running after a test has started the server.

### CI and deployment gates

E2E tests are **not** run on Vercel’s build image (they need DynamoDB, Chromium, and `next dev` on port 3099). Use **GitHub Actions** as the gate; block merges and production deploys when CI is red.

1. **Workflow:** [.github/workflows/ci.yml](.github/workflows/ci.yml) runs `npm test`, `npm run build`, and `npm run test:e2e` on every PR and push to `main`.
2. **GitHub OIDC → IAM role** (recommended): Add identity provider `token.actions.githubusercontent.com` (audience `sts.amazonaws.com`), create a role trusted by `repo:service-tools-studio/golden-hour-hub:*` with DynamoDB access **only** on `GoldenHourHub-e2e`. Set repo secret **`AWS_ROLE_ARN`** to that role’s ARN. The workflow uses `aws-actions/configure-aws-credentials` (no long-lived access keys).
3. **Optional GitHub secret:** `E2E_AUTH_SESSION_SECRET` — strong value (e.g. `openssl rand -base64 32`); if unset, CI uses a built-in placeholder for preview Dynamo saves.
4. **Block bad merges:** GitHub → Settings → Branches → branch protection on `main` → require status checks **Unit tests**, **Production build**, and **Playwright E2E**.
5. **Block bad production deploys (Vercel):** Project → Settings → Git → enable waiting for GitHub checks before promoting production (wording varies by plan), or rely on “never merge until CI is green” so `main` only moves when all three jobs pass.

Failed E2E runs upload `playwright-report/` as a workflow artifact for debugging.

With `SMS_PROVIDER=mock`, SMS is logged in the server console. Set `SMS_PROVIDER=twilio` and the Twilio variables to send for real (cleaner invite/assign, reminders, and removal notices only — customer texts are always manual from the admin UI). Point your Twilio number’s **incoming message webhook** at `https://<your-host>/api/twilio/sms/inbound` (POST) so replies **START**, **YES**, and **UNSTOP** re-enable scheduling texts, **STOP** / **HELP** stay in sync with Hub, and other inbound texts get a short “not monitored” auto-reply. After upgrade, US SMS usually requires an **approved primary compliance profile** in [Twilio Trust Hub](https://console.twilio.com/us1/account/trust-hub) and often **A2P 10DLC** brand/campaign registration before messages deliver. Google Calendar sync is a no-op unless `GOOGLE_CALENDAR_ENABLED=true`, and it must never block a scheduling save.

## AWS setup

The DynamoDB repository is wired. Cognito is not.

1. Create a DynamoDB table named `GoldenHourHub` in `us-west-2` with `pk` and `sk`, plus GSI1 (`gsi1pk`, `gsi1sk`) and GSI2 (`gsi2pk`, `gsi2sk`), as in [docs/data-model.md](docs/data-model.md).
2. Put `AWS_REGION` and `DYNAMODB_TABLE_NAME` in `.env.local` using [.env.example](.env.example). Leave the table name empty to stay on the preview store.
3. Give the Next.js server permission to read and write the table. The browser must not hold those credentials.
4. To start from real cleaner profiles only: `npm run dynamo:clear` (wipes the table), then `npm run seed:cleaners`, then open the app. The seed script does not create jobs; if you opened the app earlier on an empty table, an older build may have written the full mock dataset—clear and seed again. Edit `scripts/seed-cleaners.ts` to change names, rates, or crew limits.
5. Finish **Cognito setup** below and add the env vars from [.env.example](.env.example).

## Cognito setup

1. **App client** (User pool → App integration → Create app client). Name it e.g. `golden-hour-hub-web`. Do **not** use the hosted UI for login.
2. **Authentication flows** (edit the app client): enable **ALLOW_USER_PASSWORD_AUTH** and **ALLOW_REFRESH_TOKEN_AUTH**.
3. **Client secret**: either create a client **without** a secret (simpler for local dev) or with a secret and set `COGNITO_CLIENT_SECRET` in `.env.local`.
4. **Groups**: `ADMIN` and `CLEANER` (names are case-insensitive in the app).
5. **Users**: create each person in the pool (no public sign-up). Add them to the right group. Use a **temporary password** if you want the first sign-in to force a new password.
6. **`.env.local`**: set `COGNITO_USER_POOL_ID`, `COGNITO_CLIENT_ID`, `COGNITO_REGION`, and `AUTH_SESSION_SECRET` (run `openssl rand -base64 32`). Leave `AUTH_SESSION_SECRET` empty for local preview (role picker at `/`); with `DYNAMODB_TABLE_NAME` set, preview still loads real Dynamo data. When `AUTH_SESSION_SECRET` is set, `/` redirects to `/login` until you sign in.
7. **Cleaners**: link the Cognito user to DynamoDB by setting `cognitoSub` on the cleaner profile (preferred), or match **email** on the cleaner row (`npm run seed:cleaners` or the admin team screen). In the user pool, do not let users change their own `email` attribute unless you rely on `cognitoSub`. Admins only need the `ADMIN` group.
8. **Production**: `AUTH_SESSION_SECRET`, `COGNITO_USER_POOL_ID`, and `COGNITO_CLIENT_ID` are required; preview mode is disabled when `NODE_ENV=production`.
9. **Login password hints**: Hub reads your pool’s password policy via `cognito-idp:DescribeUserPool` on the user pool. Grant that action to the IAM user/role that runs the app, **or** set the optional `COGNITO_PASSWORD_*` variables in `.env.local` to match what you configured in the Cognito console (see `.env.example`).
10. **Disabled users**: Disabling someone in Cognito does **not** revoke their refresh token. Hub calls `AdminGetUser` only when a live session refresh runs (about every 15 minutes of active use on protected routes/actions), so a disabled account is signed out on that next refresh—not on a separate polling schedule. Grant `AdminGetUser` on your user pool to the app’s IAM principal.
11. **Staying signed in**: Hub keeps a signed HttpOnly session cookie for **60 days** (sliding on each app open via `/api/auth/session`). Users can close the browser and return within that window without signing in again. In the Cognito app client, set **Refresh token expiration** to **60 days** or longer so token refresh still works when they come back after long idle periods.
12. **Creating cleaners from Hub**: Grant `AdminCreateUser`, `AdminAddUserToGroup`, and `AdminDeleteUser` on the same user pool so admins can use **Team → Add cleaner**. Ensure the pool can send email (SES or Cognito default) for temporary passwords.

Restart `npm run dev` after changing env. Sign in at [http://localhost:3000/login](http://localhost:3000/login).

## First admin

Create Jasmin and Kelsey in Cognito in the `ADMIN` group with temporary passwords. They set a new password on first sign-in at `/login`. Passwords are never stored in DynamoDB.

## Cleaner accounts

Admins can add cleaners from **Team → Add cleaner** when DynamoDB and Cognito are configured. Hub saves the cleaner profile first, then creates the Cognito user in the `CLEANER` group; Cognito emails the temporary password. The app server needs `cognito-idp:AdminCreateUser`, `AdminAddUserToGroup`, and `AdminDeleteUser` (rollback) on the user pool, in addition to existing `AdminGetUser`.

For seed data only, `npm run seed:cleaners` still upserts PROFILE rows (no Cognito). Linking rules:

Create the cleaner in Cognito (`CLEANER` group) and ensure their profile exists in DynamoDB with the same email. They sign in at `/login` after setting their password. Only an admin can change `typicalHelperCount` and `maxHelperCount`. Helper approval is `maxHelperCount > 0`.

## Environment variables

See [.env.example](.env.example).

| Variable | Purpose |
| --- | --- |
| `AWS_REGION` | DynamoDB region |
| `DYNAMODB_TABLE_NAME` | Application table |
| `COGNITO_USER_POOL_ID` | User pool |
| `COGNITO_CLIENT_ID` | App client |
| `COGNITO_CLIENT_SECRET` | Only if the app client has a secret |
| `COGNITO_REGION` | Usually `us-west-2` |
| `AUTH_SESSION_SECRET` | Signs the HttpOnly session cookie |
| `SMS_PROVIDER` | `mock` (log only) or `twilio` |
| `TWILIO_ACCOUNT_SID` | Twilio account SID (server only) |
| `TWILIO_AUTH_TOKEN` | Twilio auth token (server only) |
| `TWILIO_FROM_NUMBER` | Twilio sender in E.164, e.g. `+15035551234` |
| `TWILIO_INBOUND_WEBHOOK_URL` | Optional. Full public URL for inbound SMS (e.g. `https://hub.example.com/api/twilio/sms/inbound`). Set this if your app sits behind a proxy so Twilio signature validation uses the same URL configured in the console. |
| `TWILIO_STATUS_CALLBACK_URL` | Optional. Delivery status webhook (defaults to `{NEXT_PUBLIC_APP_URL}/api/twilio/sms/status`). Used to update assignment text logs when Twilio reports delivered/failed. |
| `CRON_SECRET` | Optional. Bearer token for `/api/cron/assignment-sms-log-retention` and `/api/cron/availability-week-open` (required in production unless you rely only on admin saves). Vercel Cron sends `Authorization: Bearer …` when this is set. |
| `NEXT_PUBLIC_APP_URL` | Link included in reminders |
| `KELSEY_PHONE` | Digits or formatted US number for cleaner Call/Text Kelsey links and admin ops texts |
| `JASMIN_PHONE` | Same format as `KELSEY_PHONE`; with Kelsey, receives invite-accepted and availability ops texts; also receives business-information submitted/updated texts (Kelsey does not). Set on Vercel/hosting too, not only `.env.local` |
| `BUSINESS_CONTACT_EMAIL` | Optional. Server-side inbox for Certificate of Insurance emails referenced in the business questionnaire |
| `NEXT_PUBLIC_BUSINESS_CONTACT_EMAIL` | Optional. Same address exposed to the cleaner business form for COI instructions (falls back to `BUSINESS_CONTACT_EMAIL` on the server helper) |
| `GOOGLE_MAPS_API_KEY` | Server-only key for customer address typeahead (**Places API (New)** only). Hub calls Autocomplete on keystrokes and **Place Details once per selection** with an Essentials field mask (`addressComponents`, `formattedAddress` only—no reviews/ratings/`generativeSummary`). Use **session tokens** so Google bills autocomplete + details as one session. Restrict the key to Places API (New) + your server IPs/domains; disable unused Maps client SDKs so nothing else can trigger Enterprise SKUs. |
| `GOOGLE_CALENDAR_ENABLED` | Leave `false` until sync is built |
| `GOOGLE_CALENDAR_ID` | Target calendar, later |
