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

Sign-in and live SMS are not connected yet. With `DYNAMODB_TABLE_NAME` set, data lives in DynamoDB; without it, the preview store in the browser starts empty (no mock seed on load). Load cleaners with `npm run seed:cleaners`. The table design is in [docs/data-model.md](docs/data-model.md). Scheduling behavior is in [docs/scheduling-rules.md](docs/scheduling-rules.md).

## Local setup

Use Node 24.

```bash
nvm use 24
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). With `AUTH_SESSION_SECRET` unset, choose Admin or a cleaner (preview). With Cognito and `AUTH_SESSION_SECRET` set, `/` sends you to `/login`.

```bash
npm test
```

With `SMS_PROVIDER=mock`, SMS is logged in the server console. Set `SMS_PROVIDER=twilio` and the Twilio variables to send for real (invite/direct assign and availability reminders). After upgrade, US SMS usually requires an **approved primary compliance profile** in [Twilio Trust Hub](https://console.twilio.com/us1/account/trust-hub) and often **A2P 10DLC** brand/campaign registration before messages deliver. Google Calendar sync is a no-op unless `GOOGLE_CALENDAR_ENABLED=true`, and it must never block a scheduling save.

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
6. **`.env.local`**: set `COGNITO_USER_POOL_ID`, `COGNITO_CLIENT_ID`, `COGNITO_REGION`, and `AUTH_SESSION_SECRET` (run `openssl rand -base64 32`). Leave `AUTH_SESSION_SECRET` empty for local preview (role picker at `/`). When it is set, `/` redirects to `/login` until you sign in.
7. **Cleaners**: the Cognito user’s **email** must match the `email` on their cleaner row in DynamoDB (`npm run seed:cleaners` or the admin team screen). Admins only need the `ADMIN` group.

Restart `npm run dev` after changing env. Sign in at [http://localhost:3000/login](http://localhost:3000/login).

## First admin

Create Jasmin and Kelsey in Cognito in the `ADMIN` group with temporary passwords. They set a new password on first sign-in at `/login`. Passwords are never stored in DynamoDB.

## Cleaner accounts

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
| `NEXT_PUBLIC_APP_URL` | Link included in reminders |
| `GOOGLE_MAPS_API_KEY` | Server-only key for address typeahead (**Places API (New)**; restrict by API, not HTTP referrer) |
| `GOOGLE_CALENDAR_ENABLED` | Leave `false` until sync is built |
| `GOOGLE_CALENDAR_ID` | Target calendar, later |
