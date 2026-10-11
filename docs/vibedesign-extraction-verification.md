# Extraction workspace verification

## Delivered code

Four-mode shared form, normalized protocol/suffix URL, isolated/resettable parameters,
strict request validation, persistent queue claims, Crawl and Images result tables,
inventory/sitemap/page explorer/Markdown blueprint, signed image gallery/downloads,
shared history, HTML context/icon toolbar, and allowlisted contextual Back navigation.

Crawl and Images do not deduct credits, per the user's decision. Existing AI DESIGN.md
generation and captured-DOM snapshot boundaries are retained. No runtime dependency was added.

## Checks

- Final full Vitest suite passed: 230 files, 2,199 tests (2026-10-11).
- TypeScript no-emit passed after each code checkpoint.
- Repository Biome check passed with ten existing autofill `!important` warnings.
- Production client/SSR build passed, with existing browser externalization and chunk-size warnings.
- Type-bypass scan found existing generated route assertions and unrelated legacy application/test
  assertions. No forbidden bypass was introduced in changed extraction files.
- Back regression first failed against unconditional history Back, then passed after the fix.
- Controlled tests cover URL/settings bounds, mode payloads, keyboard selection/reset, depth zero,
  page caps/deduplication, partial failure, resume frontier, robots grouping/allow precedence,
  regex termination, image deduplication and evidence-based classification.

## Unverified runtime and known limitations

The user explicitly declined running dev server and worker. No authenticated application
browser QA, responsive screenshot review, database-backed concurrent claim/recovery test,
live Crawl/Images run, migration application, or production worker provisioning was performed.
Do not call this complete or production-ready on the basis of unit tests/build alone.

- Crawl extracts server-delivered HTML, not JavaScript-only rendered navigation/content.
- Sitemap records first discovered parent relationships, not every link edge in the site.
- Blueprint is deterministic observed data; it contains no AI architecture inferences.
- Image classification currently supports metadata-evidenced icons/logos; ambiguous images
  remain unclassified. Dimensions are measured for loaded images and at most fifty additional
  candidates. Resources with unavailable dimensions do not receive invented sizes.
- Image discovery bounds scanning at 5,000 elements and 200 candidate entries. Capture limits
  browser requests to 500 and accepted resource bodies to 50 MB; concurrent fetch overshoot and
  decoded image memory are not yet governed by a strict aggregate memory budget.
- Worker lease fencing prevents stale writes and closes Chromium after lease loss or the
  fifteen-minute job budget. It does not yet actively cancel every in-flight HTTP fetch or
  robots delay when the lease is lost. Shutdown finishes the current operation.
- API deduplicates identical active jobs under a locked user row; completed-request replay does
  not have a persisted idempotency-key contract.
- Same-origin iframe content is captured into exported HTML without re-navigation; secured
  visual snapshot CSP still prevents executing embedded website frames.

These are explicit remaining contract/verification gaps, not successful QA claims.
