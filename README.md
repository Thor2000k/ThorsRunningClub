# Thor’s Running Club

Thor’s Running Club is a Next.js App Router application for publishing and joining running workouts. The interface keeps the dark calendar layout, Danish/English localization, expandable Google Maps cards, aliases, attendance, and glossary.

## Stack

- Next.js App Router and TypeScript
- TanStack Query for server state
- Drizzle ORM with PostgreSQL
- Neon PostgreSQL through the Vercel integration
- Auth.js with Google OAuth
- Protected stateless MCP endpoint for ChatGPT workout publishing

## Local setup

Use Node.js 20 or newer, then install dependencies:

```bash
npm install
cp .env.example .env.local
```

Set `DATABASE_URL` to a Neon/Vercel Postgres connection string and provide an `AUTH_SECRET`. Apply the schema with:

```bash
npm run db:migrate
npm run dev
```

The app runs at http://localhost:3000.

For Google sign-in, create a Google OAuth web client and set:

```text
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
AUTH_URL=http://localhost:3000
```

The Google callback URL is `/api/auth/callback/google`. In production, set `AUTH_URL` to the deployed Vercel URL and configure the same callback there.

For local-only automated testing, set `ALLOW_TEST_LOGIN=true`. This enables the gated credentials provider and `/api/register` and `/api/login`; keep it disabled in production.

When no `DATABASE_URL` is present in development, the app automatically uses a local JSON store at `data/next-local.json`, seeds demo workouts, and creates this test account:

```text
test@example.com
RunClub-test-2026!
```

## Database

Drizzle schema is in [lib/db/schema.ts](lib/db/schema.ts). Generate and apply migrations with:

```bash
npm run db:generate
npm run db:migrate
```

The database stores Auth.js identities, workouts, bilingual workout text, aliases, and attendance. Workout attendee counts are aggregated server-side and member identities are never returned by the public workout endpoint.

## MCP publishing

The Next.js deployment exposes a protected Streamable HTTP-compatible endpoint at `/api/mcp`. Configure:

```text
WORKOUT_IMPORT_TOKEN=long-random-secret
```

Send `Authorization: Bearer <token>` and JSON-RPC requests. The available tools are:

- `list_workouts`: read the schedule and aggregate attendance counts, optionally filtered by Copenhagen dates.
- `upsert_workouts`: atomically create or update 1–100 workouts. Reuse `external_id` to update a workout without losing attendance.

The existing workout payload shape remains compatible with `examples/workouts.json`, including `translations.da` and `translations.en`.

## API routes

| Route | Purpose |
| --- | --- |
| `GET /api/workouts` | Schedule, attendance counts, and the signed-in user’s joined state |
| `GET /api/me` | Current user or `null` |
| `PATCH /api/me` | Update the signed-in user’s alias |
| `GET /api/profile` | Completed and upcoming workout history for the signed-in user |
| `POST /api/workouts/:id/attendance` | Join an upcoming workout |
| `DELETE /api/workouts/:id/attendance` | Leave a workout |
| `GET/POST /api/workouts/:id/comments` | Read a workout thread or add a comment as the signed-in member |
| `/api/auth/*` | Auth.js Google OAuth and session endpoints |
| `POST /api/mcp` | Protected MCP JSON-RPC endpoint |

## Checks

```bash
npm run typecheck
npm run build
npm test
npm run test:e2e
```

The Python server and Supabase browser client are retained only as historical migration material; the running application now uses Next.js Route Handlers and Drizzle.
