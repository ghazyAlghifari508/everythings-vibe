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

Current checkpoint: schema and claim helpers exist, but API enqueue integration and
Crawl/Images execution remain pending. This document does not establish runtime readiness.
