# Self-hosted deployment (preparation only)

No VPS, domain, database cutover, or production credentials are provisioned by this repository change. Docker/Compose validation must be performed on a host with Docker installed before deployment.

## Requirements

Use a supported Linux host (Ubuntu 24.04 or Debian 12), Docker Engine with Compose v2, a reachable PostgreSQL database, and a real domain for production TLS. Allow inbound TCP 80/443; do not publish PostgreSQL or the Node server. Keep SSH restricted by your host policy. The app, browser-based Scrape worker, Studio worker, and Codebase worker consume separate memory; size and measure the VPS before enabling optional workers, especially Chromium. No 2 GB fit is promised.

## Configure and start

1. Copy `.env.example` to `.env`; replace every required placeholder with unique production secrets and credentials. Never commit either env file. Set `APP_URL` and `BETTER_AUTH_URL` to the real HTTPS origin, and configure OAuth callback URLs and Midtrans webhooks for that origin.
2. For local proxy smoke tests, leave `DOMAIN` unset (Caddy uses `localhost`; local certificates are not public HTTPS). For production set `DOMAIN` to the domain you control only after DNS points to this host.
3. Build and start the web/proxy: `docker compose build` then `docker compose up -d web caddy`.
4. Enable the three worker processes deliberately: `docker compose --profile workers up -d`. Scrape uses Playwright/Chromium; validate browser dependencies and memory on the target Linux architecture before enabling it.
5. Enable exactly one billing scheduler: `docker compose --profile scheduler up -d billing-scheduler`. It invokes the authenticated endpoint at 03:00 UTC using `CRON_BILLING_SECRET`; never also enable a host/systemd scheduler for the same deployment. Do not run a live billing invocation locally without explicit authorization.
6. Inspect: `docker compose ps`, `docker compose logs -f web`, and `docker compose logs -f <worker>`. Stop/restart using `docker compose stop` / `docker compose restart <service>`.

Compose reads `.env` for variable interpolation. Service containers currently receive that env file; therefore keep only deployment secrets needed by services there and restrict file permissions (`chmod 600 .env`). Use the VPS secret store/Compose secrets when available rather than committing secrets or embedding them in images. Database and server ports remain internal; Caddy is the only published service.

## Database lifecycle

Back up the database and verify restore before schema changes. Apply migrations as an explicit operator step using the versioned migration process (`pnpm db:migrate` against the intended database from a controlled environment); application startup does not migrate automatically. Record the current release and backup before upgrading; rollback means redeploying the previous image and restoring the database backup only when a migration is not backward-compatible. Never run `db:push --force` against production.

## Operations and security

The web container serves SSR/API on internal port 3000. Caddy terminates TLS automatically only when a real public domain resolves to the host and ports 80/443 are reachable; `localhost` is strictly for local testing. Caddy forwards requests without response buffering (`flush_interval -1`) for SSE/AI streaming and supports normal HTTP upgrades. Payment webhook routes are reachable through the same public HTTPS proxy; configure the provider only after deployment and verify signatures in its sandbox first. Keep database access restricted to the app host/network and use least-privilege credentials.

Workers use the same application image and their existing TypeScript entrypoints with `tsx`; they are separate Compose processes, not web request handlers. Check worker logs and existing job state/diagnostics for stuck jobs; restart one service at a time. Only one scheduler profile/host timer should run.

## Validate after provisioning

On a Docker host, run `docker compose config`, `docker compose build`, then start local `web` and `caddy`. Verify `/` and a known API endpoint using `curl`, then confirm proxy behavior through `http://localhost` locally or the real HTTPS domain after DNS. Inspect each worker's startup logs against a dedicated non-production database and test service credentials. Check graceful shutdown with `docker compose stop`. Do not run scraping against third-party sites solely for smoke tests, nor send real billing email. This environment currently has no Docker, so none of those container/runtime checks are claimed as passed.

No SSH deploy workflow is configured. Once infrastructure exists, an owner may separately authorize a build/deployment pipeline with real secrets, host identity, rollback plan, and staged verification.
