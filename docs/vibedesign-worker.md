# Extraction worker

The web application and worker share PostgreSQL and scrape ownership boundaries.
Use `pnpm scrape:worker` in a separately supervised Node process with Chromium installed.
The worker reads `.env.local` and `.env` using the installed dotenv package and reports
`Scrape worker ready` only after database connectivity succeeds.

Jobs are claimed under a PostgreSQL row lock with SKIP LOCKED. Lease expiry permits
recovery after interruption; an exact token and owner predicate fences parent writes.
SIGINT/SIGTERM stop accepting jobs and close the browser after the current operation.

This worker is not automatically deployed by the web application or the existing
daily billing cron. Provision it alongside the web deployment against the same database.
Use `pnpm dev:all` locally so the web process and worker start together; `pnpm dev`
runs only Vite and leaves every job queued.

The API now enqueues all four modes. Apply the additive migration
`drizzle/0033_new_xavin.sql` through the repository migration workflow before deploying
the application, then provision the worker. Without the worker, jobs remain queued,
including HTML and DESIGN.md operations.

Crawl uses HTTP HTML extraction, a persisted discovered-page frontier, completed-page
reuse, robots restrictions/delay, exact hostname or descendant scope, and bounded regex
worker evaluation. Images uses guarded Chromium discovery and bounded optional image
dimension reads. Signed image URLs expire; reopening the result renews capabilities.

## Browser function serialization

Worker code loads through tsx, which runs esbuild with `keepNames` enabled. That option
rewrites every inner function binding inside a browser-bound callback into a
`__name(...)` helper call, and `Function.prototype.toString` carries that call into the
page, where the helper does not exist. Without a shim, Playwright aborts the whole
capture with `ReferenceError: __name is not defined`; images mode failed this way while
design mode worked, and the same rewrite silently prevented the WebSocket and Worker
guard from being installed at all. `BROWSER_NAME_SHIM` installs a guarded `globalThis.__name`
per capture context before any serialized function runs.

## Runtime evidence captured

`SCRAPE_RUNTIME_VERIFY=1 pnpm vitest run src/lib/services/scrape-runtime.test.ts` drives all
four modes through persisted queue claims, lease recovery, and the standalone worker
process. Live captures against public sites recorded: images on `notion.com` reported
discovery `found` with outcome `complete` (174 discovered, 174 saved, 0 failed); a
rate-limited site reported discovery `capture-failed` with the 429 reason and code
`WEBSITE_RATE_LIMITED`; and repeated design runs on `notion.com` completed with
`aiEnrichment: applied`.

Static verification does not establish authenticated downloads, per-browser rendering
fidelity, or visual layout quality in the workspace UI. Those remain unverified here.

