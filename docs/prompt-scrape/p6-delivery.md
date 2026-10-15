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

## Verification and remaining parent audit

- Typecheck and affected Biome checks passed during each integration checkpoint.
- Deterministic coverage includes mixed stored/legacy/failed/pending counts, empty/all-failed results, search/filter behavior, loading/error fallback, diagnostic cooldown and expired-capability retry.
- Browser/screenshot QA intentionally excluded by Phase 6.
- Parent owns whole-phase audit, production build, migration-history reconciliation and final push/upstream checks.
- Remaining integration review: download currently uses the original signed prop URL, so a preview-only capability refresh does not refresh the download URL; download error recovery remains generic. Rendering failures do not adjust aggregate persisted counts (which intentionally represent storage, not current decoder success). Review all terminal partial-result wording and add dedicated signing/history/progress contract tests before declaring the phase complete.
