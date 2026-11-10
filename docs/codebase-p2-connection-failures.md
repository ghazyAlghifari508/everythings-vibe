# P02 — Interrupted upstream connections on codebase endpoints

Status: fixed & verified (`feature/vibeplan-existing-codebase`).

## Symptom

```
[Vite] Internal server error: read ECONNRESET
    at TCP.onStreamRead (node:internal/stream_base_commons:216:20)
```

plus HTTP 500 responses from `/api/codebases*` while using the Existing Codebase
workspace.

## Trigger

A request served by the codebase browser boundary runs a Drizzle/pg query while
the pooled Postgres client's socket is no longer alive (connection reset by the
server, idle reaping, database restart, network reset). Nothing in the request is
wrong; the *dependency* is temporarily unreachable.

Line of events, reproduced end-to-end:

1. `pg` writes the query to a socket the peer already dropped.
2. libuv raises `read ECONNRESET` (`syscall: 'read'`, `errno: -4077`) — an error
   object created outside JS, which is why its stack carries a single
   `TCP.onStreamRead` frame and no application frames.
3. Drizzle wraps it: `DrizzleQueryError` with `cause: read ECONNRESET`; its
   `message` also embeds the statement **and its parameter values**.
4. `handleCodebaseList` (and the feature-create / session / status handlers)
   performed their queries without an error boundary, so the rejection escaped
   the route handler.
5. TanStack Start answered with its opaque fallback:
   `{"status":500,"statusText":"","unhandled":true,"message":"HTTPError"}`, and
   the dev middleware printed `[vite] Internal server error: …`.

A second, separate defect surfaced in the same reproduction: when the outage hits
the **session lookup**, `auth.api.getSession` throws
`APIError { message: "Failed to get session", status: "INTERNAL_SERVER_ERROR" }`
with no `cause` chain. Every codebase handler mapped *any* auth error to `401`,
so a database hiccup made a signed-in user look signed out.

## Why it is not a Vite/HMR bug

The raw socket error is *not* produced by the dev middleware. It is a database
socket error that leaves the application boundary; Vite only prints it after the
handler lets it escape (`nitro` dev middleware → `next(error)` → Vite
`errorMiddleware`). Client-side aborts were tested separately (graceful close and
real `RST` with `SIGPIPE`/`SO_LINGER=0`) and did **not** produce the line, so the
HMR/overlay path was not the cause and `server.hmr.overlay` was not touched.

## Reproduction used

* `scripts`-only diagnostics (removed after the session):
  * a TCP proxy in front of Postgres that aborts the app's connection with a real
    RST after N forwarded packets;
  * a dev server on a separate port with `DATABASE_URL` pointed at that proxy;
  * a signed session cookie minted from an existing session row (read-only).
* Arms: `after=0` → the session lookup dies, `after=3` → the codebase list query
  dies.

Before: `HTTP 500 {"status":500,"unhandled":true,"message":"HTTPError"}` (and a
`401` for the auth arm).
After: `HTTP 503 {"error":"Layanan data sedang tidak tersedia. Coba lagi.","code":"SERVICE_UNAVAILABLE","retryable":true}`
for both arms, one classified log line per outage, and the healthy request still
answers `200` with the unchanged payload.

## Contract now enforced

`src/features/codebase/services/route-failure.ts` (pure, unit-tested):

| Failure | Status | Body |
| :--- | :--- | :--- |
| No session / banned | `401` | `{ "error": "Unauthorized" }` (unchanged) |
| Session store unreachable | `503` + `Retry-After: 2` | `SERVICE_UNAVAILABLE`, `retryable: true` |
| Dependency socket/timeout outage (`ECONNRESET`, `EPIPE`, `57P0x`, `08xxx`, …) | `503` + `Retry-After: 2` | `SERVICE_UNAVAILABLE`, `retryable: true` |
| Client already disconnected | `499` | empty (nothing to answer, nothing logged) |
| Any other escape | `500` | handler contract, or `CODEBASE_REQUEST_FAILED` |

Every codebase route is wrapped in `guardCodebaseHandler`, so no exception can
reach TanStack Start's `unhandled` fallback. Diagnostics log **scope + error code
only**, and the sanitized 500 path drops everything after `params:` so the query
parameters (which include the session token) never land in a log line.

## Still requires P12 (browser QA)

* Confirm in the browser Network/Console panels that the workspace no longer
  shows a 500 during a database hiccup and that the UI offers a retry path.
* `better-auth` logs the failed session query itself, including
  `params: [<session token>]`. That is upstream library logging, not ours; it
  needs a redacting `logger` in the auth config (security concern, separate
  scope).
* Whether the local Postgres actually resets idle pooled connections here (and
  whether pool `keepAlive`/`maxLifetimeSeconds` tuning is warranted) must be
  measured on the real environment before changing pool configuration.