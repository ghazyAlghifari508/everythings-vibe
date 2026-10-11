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
Do not start the dev server or worker for this task: the user explicitly declined runtime QA.

The API now enqueues all four modes. Apply the additive migration
`drizzle/0033_new_xavin.sql` through the repository migration workflow before deploying
the application, then provision the worker. Without the worker, jobs remain queued,
including HTML and DESIGN.md operations. Migration execution and worker startup were
not performed in this task.

Crawl uses HTTP HTML extraction, a persisted discovered-page frontier, completed-page
reuse, robots restrictions/delay, exact hostname or descendant scope, and bounded regex
worker evaluation. Images uses guarded Chromium discovery and bounded optional image
dimension reads. Signed image URLs expire; reopening the result renews capabilities.

Static verification does not establish runtime readiness, database recovery correctness,
authenticated downloads, or visual fidelity. Those checks remain blocked by the explicit
no-server/no-worker instruction.
