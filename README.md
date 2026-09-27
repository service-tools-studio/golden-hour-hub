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

Sign-in, DynamoDB, and live SMS are not connected yet. The proposed database design is in [docs/data-model.md](docs/data-model.md). Scheduling behavior is in [docs/scheduling-rules.md](docs/scheduling-rules.md).

## Local setup

Use Node 24.

```bash
nvm use 24
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Choose Admin, Claudia (approved to bring a helper), or Maria (works alone).

```bash
npm test
```

SMS reminders log on the server. No SMS account is required. Google Calendar sync is a no-op unless `GOOGLE_CALENDAR_ENABLED=true`, and it must never block a scheduling save.

## AWS setup

Planned, not wired up yet.

1. Create a DynamoDB table named `GoldenHourHub` in `us-west-2` with the keys in [docs/data-model.md](docs/data-model.md).
2. Create a Cognito user pool with groups `ADMIN` and `CLEANER`. Do not allow public sign-up.
3. Put the ids in `.env.local` using [.env.example](.env.example).
4. Give the Next.js server permission to read and write the table and to manage cleaner users. The browser must not hold those credentials.

## First admin

After Cognito is connected, create Jasmin and Kelsey in the `ADMIN` group and set a temporary password. Cognito should require a new password at first sign-in. Passwords are never stored in DynamoDB.

## Cleaner accounts

An admin will create the cleaner in Cognito and the cleaner profile in DynamoDB. The cleaner gets the temporary password, sets their own password, and signs in after that. Only an admin can change `helpersApproved`, `typicalHelperCount`, and `typicalCrewSize`.

## Environment variables

See [.env.example](.env.example).

| Variable | Purpose |
| --- | --- |
| `AWS_REGION` | DynamoDB region |
| `DYNAMODB_TABLE_NAME` | Application table |
| `COGNITO_USER_POOL_ID` | User pool |
| `COGNITO_CLIENT_ID` | App client |
| `COGNITO_REGION` | Usually `us-west-2` |
| `SMS_PROVIDER` | `mock` locally |
| `NEXT_PUBLIC_APP_URL` | Link included in reminders |
| `GOOGLE_CALENDAR_ENABLED` | Leave `false` until sync is built |
| `GOOGLE_CALENDAR_ID` | Target calendar, later |
