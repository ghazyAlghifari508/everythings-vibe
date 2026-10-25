# Billing Scheduler Specification & Setup Guide

## 1. Overview & Schedule Contract

The billing reminder service alerts users prior to subscription expiration and during paused renewal windows.

- **Canonical Schedule:** `03:00 UTC daily` (`0 3 * * *`).
- **Endpoint:** `GET /api/cron/billing`
- **Authentication:** Strict Bearer token via `Authorization: Bearer <CRON_BILLING_SECRET>` (constant-time verification).
- **Execution Model:** Provider-independent HTTP invocation.

```
Scheduler Host / Timer (03:00 UTC)
  │
  ▼
Authorized HTTP GET /api/cron/billing (Bearer $CRON_BILLING_SECRET)
  │
  ▼
TanStack Start Server Route (/api/cron/billing)
  │
  ▼
handleBillingCron (src/features/billing/services/billing-cron.server.ts)
  │
  ├─► Select eligible candidate rows (pro/hengker active within 3-day window)
  ├─► Atomic DB claim (UPDATE subscriptions SET reminder_count = reminder_count + 1 WHERE reminder_count = ?)
  ├─► Send email via Resend (pre-expiry notice or paused reminder)
  └─► Return summary: { ok: true, sent: N, failed: N, skipped: N }
```

---

## 2. Invocation Mechanism

The repository provides a standalone, provider-agnostic invoker script:

```bash
# Direct pnpm command
pnpm cron:billing

# Or via tsx
npx tsx scripts/run-billing-cron.ts
```

### Environment Configuration

| Variable | Required | Description | Default |
|---|---|---|---|
| `CRON_BILLING_SECRET` | **Yes** | Shared secret matching the server configuration | None (fails if empty) |
| `BILLING_CRON_URL` | No | Full target endpoint URL | Derived from `APP_URL` |
| `APP_URL` | No | Base application URL | `http://127.0.0.1:3000` |
| `CRON_TIMEOUT_MS` | No | HTTP request timeout in milliseconds | `30000` (30 seconds) |

### Invoker Characteristics
- **Single-shot:** Dispatches exactly one HTTP request per invocation. No automated retries that could bypass idempotency or generate duplicate emails.
- **Fail-safe logging:** Never logs the secret, bearer token, or complete Authorization header.
- **Exit codes:** Returns `0` on HTTP 200, and `1` on HTTP 4xx/5xx, timeouts, or network failures.

---

## 3. VPS & Self-Hosted Scheduling Options

When the Linux VPS is provisioned, recurring triggers can be configured using one of the following methods:

### Option A: Host Crontab (Simplest)

Run `crontab -e` on the VPS as the application user:

```crontab
# Trigger billing cron daily at 03:00 UTC
0 3 * * * cd /opt/everythings-vibe && CRON_BILLING_SECRET="your-secret-here" /usr/bin/pnpm cron:billing >> /var/log/billing-cron.log 2>&1
```

Or using standard `curl` locally on the VPS loopback interface:

```crontab
0 3 * * * curl -fsS -m 30 -H "Authorization: Bearer your-secret-here" http://127.0.0.1:3000/api/cron/billing >> /var/log/billing-cron.log 2>&1
```

### Option B: Systemd Timer (Enterprise / Resilient)

1. Create `/etc/systemd/system/billing-cron.service`:
```ini
[Unit]
Description=everythings-vibe Daily Billing Reminder Cron
After=network.target

[Service]
Type=oneshot
User=everythings
WorkingDirectory=/opt/everythings-vibe
EnvironmentFile=/opt/everythings-vibe/.env
ExecStart=/usr/bin/pnpm cron:billing
StandardOutput=journal
StandardError=journal
```

2. Create `/etc/systemd/system/billing-cron.timer`:
```ini
[Unit]
Description=Trigger everythings-vibe Daily Billing Cron at 03:00 UTC

[Timer]
OnCalendar=*-*-* 03:00:00 UTC
Persistent=true

[Install]
WantedBy=timers.target
```

3. Enable and start the timer:
```bash
sudo systemctl daemon-reload
sudo systemctl enable --now billing-cron.timer
```

### Option C: Docker Scheduler (Containerized)

In a Docker Compose deployment, a lightweight scheduler container (such as `mcuadros/ofelia` or a custom Alpine cron service) on the same Docker network can invoke the web service container:

```yaml
services:
  scheduler:
    image: alpine:latest
    restart: unless-stopped
    command: >
      sh -c 'echo "0 3 * * * wget -q -O- --header=\"Authorization: Bearer $$CRON_BILLING_SECRET\" http://web:3000/api/cron/billing" | crontab - && crond -f -l 2'
    environment:
      - CRON_BILLING_SECRET=${CRON_BILLING_SECRET}
    depends_on:
      - web
```

---

## 4. Operational Readiness vs. Live Production Status

> **CRITICAL OPERATIONAL NOTICE:**  
> The standalone script and endpoint are ready in the repository. However, the owner **HAS NOT yet provisioned or purchased the VPS**.
>
> 1. **No Live Scheduler:** The invoker script is an invocation tool, not a daemon. Until the VPS is provisioned and a host scheduler (crontab, systemd timer, or container) is active, billing reminders **will not fire automatically**.
> 2. **Provider Cutover Safety:** If an existing production deployment still depends on Vercel Cron, the replacement scheduler on the VPS **must be verified and active before the old Vercel deployment/service is retired**.
