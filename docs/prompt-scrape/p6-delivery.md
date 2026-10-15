# Phase 6 integration handoff

## Data and compatibility

- Backend `43083ea` stores validated image bytes in PostgreSQL; proxy `bca1522` serves signed private image identities.
- Required migration: `drizzle/0036_clammy_darkstar.sql`. It creates `scrape_image_assets` with byte-length integrity, owner/scrape/hash deduplication and cascading deletion; adds nullable asset and failure evidence columns to `scrape_images`.
- Deployment must reconcile the known existing migration-history collision before applying 0036. This integration did not execute migrations or alter migration history.
- Legacy completed rows without `assetId` remain remote links. Verification is historical evidence, not a guarantee of current remote availability. No automatic backfill is performed.
- Stored identities use the image row ID, scrape ID and owner ID. Preview and download use the signed same-origin asset URL; opening the original URL is a separate explicit action.

## Capacity and limitations

- Current storage limits: 100,000,000 bytes per scrape and 500,000,000 bytes per owner, enforced in the storage service. PostgreSQL bytes also consume database, WAL, replication and backup capacity; quotas are logical payload limits rather than total infrastructure cost limits.
- SVG is rejected for new stored images because active content is not verified. Supported raster content still must decode successfully in the browser; signature validation is not proof that every decoder accepts the file.
- Remote legacy sources can expire, block a subsequent request, change MIME, time out or deny access. The gallery does not bypass those controls.
- Gallery keeps fixed-height preview regions and native lazy loading for larger results. Diagnostic requests happen only after image load errors, not for successful thumbnails. Extraction counts and preview failure messages are separate evidence.
- Counts derive from rows: completed with asset reference = persisted; completed without reference = linked/verified; failed = extraction failures; remaining discovery = pending. Legacy `savedImages` metadata is not used as a saved-byte count.

## Verification and acceptance audit

- Typecheck and affected Biome checks passed during each integration checkpoint.
- Deterministic coverage includes mixed stored/legacy/failed/pending counts, empty/all-failed results, search/filter behavior, loading/error fallback, diagnostic cooldown and expired-capability retry.
- Browser/screenshot QA intentionally excluded by Phase 6.
- Preview refresh updates the URL used by downloads. Download failures decode the structured proxy error, honor its cooldown, and refresh expired capabilities on retry. Signing, history and progress have dedicated deterministic contract coverage; terminal partial copy does not promise that legacy links have stored bytes.
- A (semantics): row-derived persisted, legacy verified, failed and pending counts replace the legacy saved-count promise. Rendering failure is separate from extraction/storage evidence.
- B (durability): PostgreSQL byte storage, atomic owner quota lock, per-scrape content deduplication and cascading cleanup are covered by the isolated-schema storage integration test.
- C (gallery): fixed-height loading/failure regions remove failed image markup, preserve source alt behavior, reuse shared filters, support search, expose failures in a disclosure and use native lazy loading. Downloads and original-source navigation remain separate actions.
- D (diagnostics): expired/invalid capabilities, ownership/session rejection, stored-byte absence, MIME/size rejection, remote HTTP/timeout/redirect failures and proxy/source cooldowns remain distinct error codes. Successful thumbnails are not fetched again for diagnostics.
- E (counts): detail, progress, history and gallery share row-derived counts, including partial discovery and legacy data; download availability follows completed rows rather than a metadata count.
- F (security): stored reads join owner/scrape/image identities, capability serving checks active ownership, remote fetches validate each redirect and connect to the validated IP, response headers are private/no-store and nosniff with a sandbox policy. New stored SVG remains rejected.
- Final relevant suite: 41 files / 329 tests passed, excluding remote runtime and browser tests. This includes the real PostgreSQL isolated-schema quota/dedupe/ownership/cleanup test.
- `pnpm exec tsc --noEmit` passed. `pnpm lint` passed with 10 existing CSS `!important` warnings and one unrelated test template-literal info. Production client and SSR builds passed; Vite reported Node-module browser externalization warnings from pg and the existing large Mermaid chunk. These build warnings are not proof of a client secret leak, and were not suppressed.
- Application bypass scan reports pre-existing generated route assertions and unrelated legacy application/test casts; no new bypass was added to Phase 6 files. `git diff --check` passed.
- Deployment still requires migration-history reconciliation before normal migration rollout; no production migration history was changed. Parent owns final push/upstream checks; push is intentionally deferred by instruction.
