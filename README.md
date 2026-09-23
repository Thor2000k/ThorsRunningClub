# Thor’s Running Club

A React running-club website with a weekly workout calendar, Danish/English localization, accounts, attendance, Google Maps links, an introduction, and a glossary. A Python/SQLite backend serves both the web API and MCP tools for publishing workouts from an assistant.

## Run locally

Requires Node.js 18+ and Python 3.10+ with the Europe/Copenhagen timezone database. No third-party Python dependencies.

```bash
npm install
npm run server
```

In another terminal:

```bash
npm run dev
```

Open the URL Vite prints (normally http://localhost:5173). Vite proxies `/api` to http://127.0.0.1:8000. SQLite is created at `data/club.sqlite3`. An empty database is seeded with three weeks of labeled example runs around the current week. Set `SEED_DEMO=false` before first launch for an empty real schedule. Changing this later does not delete existing data.

### WSL projects under `/mnt/c`

If npm produces corrupted package files or Vite reports a syntax error inside `node_modules`, use:

```bash
npm run setup
npm run dev
```

`setup` installs the locked dependencies in WSL's Linux cache (`~/.cache/thors-running-club` by default) and links the project's `node_modules` to them. It preserves the old directory as an ignored `.node_modules-backup-*` folder. Use `npm run setup` again after changing dependencies. Keep using WSL's Node/npm with this installation; Windows Node cannot use its Linux binaries.

For the built site, run `npm run build`, then `npm run server`, and open http://127.0.0.1:8000. `npm run preview` is only a frontend preview; use the Python server for a working built site.

## Danish and English

The DA / EN switch changes navigation, forms, messages, glossary, workout types, dates, and number formatting. Language is remembered in local storage and otherwise follows the browser. Weeks start on Monday; times always use Europe/Copenhagen, including daylight saving.

Workout titles, notes, pace descriptions, and locations accept `translations.da` and `translations.en`. Missing translations fall back to the base text. Imported content is not automatically machine-translated. MCP descriptions encourage assistants to supply both languages. Stable `kind` values remain English in the database and are translated in the UI.

## Sign-in and aliases

Production sign-in uses Google OpenID Connect. The app stores Google’s stable account subject (`sub`) as the identity key, never a Google password. The Google display name is kept as account metadata; each member can choose a separate club alias that is shown in the app. The OAuth flow uses a server-side authorization code, a short-lived state cookie, a verified email identity, and an HttpOnly session cookie. Google sign-in is disabled until the required server variables are configured.

Create Google OAuth credentials in Google Cloud Console as a Web application, then configure the authorized redirect URI to exactly match `GOOGLE_REDIRECT_URI` (for example `https://club.example.com/api/auth/google/callback`). Set:

```bash
export GOOGLE_CLIENT_ID="your-client-id.apps.googleusercontent.com"
export GOOGLE_CLIENT_SECRET="your-client-secret"
export GOOGLE_REDIRECT_URI="https://club.example.com/api/auth/google/callback"
export SECURE_COOKIES=true
```

The redirect URI must use HTTPS in production. Do not commit the client secret. The callback exchanges the one-time code at Google and calls Google’s OpenID Connect userinfo endpoint; the app does not accept a client-supplied email or user ID as proof of identity.

For local testing only, enable the explicitly gated password test account:

```bash
export ALLOW_TEST_LOGIN=true
export SEED_DEMO=true
npm run server
```

Test account: `test@example.com` / `RunClub-test-2026!`. This account is created only when `ALLOW_TEST_LOGIN=true`, is never created in the default production configuration, and should not be used after local testing. Password registration and login return “not found” when the flag is disabled.

## MCP tools

- `list_workouts`: schedule and attendance counts, optionally filtered by inclusive `from_date` / `to_date` in Copenhagen time. No member identities.
- `upsert_workouts`: publish 1–100 complete workouts atomically. Reuse `external_id` to update while preserving attendance. Supply all desired translations on every update; supplied translations replace previous ones.

### Local clients (stdio)

Configure your MCP client with absolute paths:

```json
{
  "mcpServers": {
    "thors-running-club": {
      "command": "python3",
      "args": ["/absolute/path/ThorsRunningClub/server/mcp_stdio.py"],
      "env": {
        "DATABASE_PATH": "/absolute/path/ThorsRunningClub/data/club.sqlite3",
        "SEED_DEMO": "false"
      }
    }
  }
}
```

The local process has trusted access to SQLite. It needs neither the web server nor a token. Keep both processes on the same machine and database path.

### ChatGPT

ChatGPT cannot directly launch this local stdio command. The documented private connection route is [Secure MCP Tunnel](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels). Associate a tunnel with the intended ChatGPT workspace, configure its command to run `python3 /absolute/path/ThorsRunningClub/server/mcp_stdio.py`, and connect that tunnel as a developer-mode app. Access depends on workspace features and permissions. This project does not configure or connect your ChatGPT account automatically.

After obtaining the tunnel client and tunnel ID from your OpenAI account:

```bash
tunnel-client init \
  --sample sample_mcp_stdio_local \
  --profile thors-running-club \
  --tunnel-id YOUR_TUNNEL_ID \
  --mcp-command "python3 /absolute/path/ThorsRunningClub/server/mcp_stdio.py"
tunnel-client doctor --profile thors-running-club --explain
tunnel-client run --profile thors-running-club
```

Follow the official guide for account credentials. Set `DATABASE_PATH` in the tunnel environment if overriding the default. The tunnel must remain running.

An alternative is a deployed remote server with OAuth. [ChatGPT developer-mode documentation](https://developers.openai.com/api/docs/guides/developer-mode) lists OAuth, no-auth, and mixed auth. This starter does **not** implement an OAuth provider; the static bearer endpoint below is for clients supporting custom authorization headers and is not directly connectable through ChatGPT’s OAuth UI.

### HTTP clients

```bash
export WORKOUT_IMPORT_TOKEN="replace-with-a-long-random-secret"
npm run server
```

Endpoint: `http://127.0.0.1:8000/mcp`, stateless Streamable HTTP with JSON responses. Send `Authorization: Bearer <token>`, `Content-Type: application/json`, and `Accept: application/json, text/event-stream`. Supported protocol versions: `2025-03-26`, `2025-06-18`, `2025-11-25`. Subsequent requests should send the negotiated `MCP-Protocol-Version`. Notifications return 202; optional SSE GET requests return 405. Both tools require the token. No token is included in browser code.

```bash
curl http://127.0.0.1:8000/mcp \
  -H "Authorization: Bearer $WORKOUT_IMPORT_TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

Suggested assistant instruction:

> List existing workouts first. Prepare next week’s schedule with Danish and English titles and notes. Confirm dates, meeting points, and the plan with me, then publish using upsert_workouts. Reuse external_id when editing an existing run.

## REST import

```bash
curl http://127.0.0.1:8000/api/workouts/import \
  -H "Authorization: Bearer $WORKOUT_IMPORT_TOKEN" \
  -H 'Content-Type: application/json' \
  --data-binary @examples/workouts.json
```

Required: `external_id`, `title`, `kind`, `starts_at`, `distance_km`, `duration_minutes`, `pace`, `location`. Optional: `notes`, `translations`. See [example payload](examples/workouts.json). `starts_at` must include a timezone offset. Distance must be positive; duration a positive integer. Invalid batches are rejected before any workouts change.

| Route | Purpose |
| --- | --- |
| `GET /api/workouts` | Schedule, attendance counts, and current user's joined state |
| `GET /api/me` | Current user or null |
| `GET /api/auth/config` | Reports whether Google sign-in and local test login are enabled |
| `GET /api/auth/google/start` | Starts Google OpenID Connect sign-in |
| `GET /api/auth/google/callback` | Handles the Google authorization callback |
| `PATCH /api/me` | `{alias}`; updates the signed-in member’s club alias |
| `POST /api/register` | Local test-only `{name, email, password}` when `ALLOW_TEST_LOGIN=true` |
| `POST /api/login` | Local test-only `{email, password}` when `ALLOW_TEST_LOGIN=true` |
| `POST /api/logout` | `{}`; destroys current session |
| `POST /api/workouts/:id/attendance` | `{}`; joins an upcoming run idempotently |
| `DELETE /api/workouts/:id/attendance` | `{}`; leaves a run |

## Checks

```bash
npm test
npm run build
```

Integration tests use temporary databases and localhost servers. They cover accounts, sessions, password hashing, attendance, protected atomic imports, bilingual data, origin checks, past-run rejection, and MCP discovery/calls.

Browser checks (build first):

```bash
npx playwright install chromium
npm run build
npm run test:e2e
```

The browser test verifies language persistence, bilingual workout content, registration, joining/leaving, reload persistence, map links, and the mobile layout. It uses its own temporary database. To reuse an existing browser, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to its executable.

## Configuration and deployment

Variables are read from the process environment; `.env` files are not automatically loaded.

| Variable | Default | Purpose |
| --- | --- | --- |
| `DATABASE_PATH` | `data/club.sqlite3` under project root | Persistent database |
| `WORKOUT_IMPORT_TOKEN` | unset | Enables REST imports and HTTP MCP |
| `SEED_DEMO` | `true` | Seeds an empty database |
| `HOST` | `127.0.0.1` | Listen address |
| `PORT` | `8000` | Backend port |
| `SECURE_COOKIES` | `false` | Enable for HTTPS |
| `GOOGLE_CLIENT_ID` | unset | Google OAuth Web client ID |
| `GOOGLE_CLIENT_SECRET` | unset | Google OAuth Web client secret |
| `GOOGLE_REDIRECT_URI` | derived from Host/port | Exact Google OAuth callback URI |
| `ALLOW_TEST_LOGIN` | `false` | Enables the local-only password test account |
| `TEST_LOGIN_EMAIL` | `test@example.com` | Override the local test email |
| `TEST_LOGIN_PASSWORD` | `RunClub-test-2026!` | Override the local test password |

This is a local MVP. Public deployment needs HTTPS and a reverse proxy, persistent disk and backups, and appropriate request limits. Preserve the public Host header through the proxy for same-origin checks. Cookies are HttpOnly/SameSite=Lax; OAuth state cookies expire after ten minutes; sessions expire after 30 days. The local password test account is disabled by default. Do not expose the development server, trusted stdio process, or test credentials publicly.
