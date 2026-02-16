# Gym Routine

Single-user Next.js training planner with auth gate, deterministic block generation, workout logging, weekly rollups, and adaptive body-stat inputs.

## Local Development

1. Install dependencies.

```bash
npm ci
```

2. Configure environment.

```bash
cp .env.local.example .env.local
```

Required variables in `.env.local`:

- `SUPABASE_DB_URL`
- `SINGLE_USER_ID`
- `APP_PASSCODE_HASH` (escape `$` as `\$` in `.env.local`)
- `COOKIE_SIGNING_SECRET`
- `ADMIN_SECRET`
- `NODE_OPTIONS=--dns-result-order=ipv4first`

3. Run the app.

```bash
npm run dev
```

## Tests

Run unit tests:

```bash
npm test
```

## Render Smoke Test (Existing Deployment)

This repo includes an end-to-end smoke test for a deployed Render instance.

Required runtime env when executing the smoke test:

- `BASE_URL` (for example `https://your-app.onrender.com`)
- `APP_PASSCODE` (plain unlock passcode)
- `ADMIN_SECRET`

Run smoke tests:

```bash
BASE_URL=https://your-app.onrender.com \
APP_PASSCODE='your-passcode' \
ADMIN_SECRET='your-admin-secret' \
npm run smoke:render
```

Optional retention check (mutating):

```bash
BASE_URL=https://your-app.onrender.com \
APP_PASSCODE='your-passcode' \
ADMIN_SECRET='your-admin-secret' \
RUN_RETENTION=true \
npm run smoke:render
```

The smoke test verifies:

- unauthenticated redirect and API lock
- unlock flow and session cookie issuance
- idempotent `/api/plan/init` (called twice)
- `/api/plan/today`, `/api/plan/week`, `/api/dashboard`
- `/api/admin/health` including current-block counts
- optional `/api/admin/retention`

## Retention Cron on Render

If your Render deployment already exists, configure a daily cron job that calls:

- `POST /api/admin/retention`
- header: `x-admin-secret: <ADMIN_SECRET>`

Suggested schedule: daily in UTC during low-traffic hours.
