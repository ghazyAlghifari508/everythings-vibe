# Extraction workspace verification

## Delivered code

Four-mode shared form, normalized protocol/suffix URL, isolated/resettable parameters,
strict request validation, persistent queue claims, Crawl and Images result tables,
inventory/sitemap/page explorer/Markdown blueprint, signed image gallery/downloads,
shared history, HTML context/icon toolbar, and allowlisted contextual Back navigation.

Crawl and Images do not deduct credits, per the user's decision. Existing AI DESIGN.md
generation and captured-DOM snapshot boundaries are retained. No runtime dependency was added.

## Reliability fixes

- Browser capture installs a guarded `__name` shim so tsx/esbuild `keepNames` output does
  not break serialized page functions; images mode and the resource guard depend on it.
- Upstream HTTP failures are classified (rate limited, access denied, not found, server
  error) and `Retry-After` is read in both forms without inventing a wait. Internal faults
  report `UNEXPECTED_ERROR` instead of a website block.
- Image runs resolve to `complete`, `partial`, `empty`, or `all-failed`, and discovery
  records whether it found candidates, found none, or never ran. Only transient transport
  failures and 5xx responses retry; a site's own status answer is final.
- The canonical DESIGN.md is built from browser evidence and survives an optional AI
  summary failure; enrichment status is persisted and reported honestly.
- Identical measurements collapse into one curated row that keeps its frequency and
  representative selector, and Do and Don't guidance is derived only from repeated
  measured patterns.
- The crawl explorer resyncs its selected page whenever results change, and the status
  poll returns persisted pages and images so no reload is needed.
- The inspector routes a row by its own property name as well as the table header, so
  `border-radius` values reach the radius bucket instead of the spacing list, and the
  canonical `Do:` / `Don't:` labels are not repeated inside an already-labelled section.

## Checks

- Full Vitest suite passed: 242 files, 2,248 tests.
- Runtime suite passed with `SCRAPE_RUNTIME_VERIFY=1`, driving all four modes through the
  persisted queue, lease recovery, and the standalone worker process.
- TypeScript no-emit passed; repository Biome check passed with ten existing autofill
  `!important` warnings; production build passed.
- Type-bypass scan over every changed file found no `any`, `@ts-ignore`, or `as unknown as`.
- The polling race, radius routing, and rule-label tests are mutation-verified: each one
  fails when its fix is reverted and passes when it is present.

## Live capture evidence

- Images on `notion.com`: discovery `found`, outcome `complete`, 174 discovered, 174
  saved, 0 failed, 86 with measured dimensions.
- Images on `framer.com`: outcome `partial`, 149 saved, 2 failed with stored reasons.
- Design on `notion.com`: three consecutive runs completed with `aiEnrichment: applied`;
  the document shrank from roughly 1.1 MB to 84 KB with zero duplicate rows. The same
  capture round-trips through the inspector with 24 colours, 43 spacing rows, 8 radii,
  4 Do rules and 4 Don't rules, and no `border-radius` row left in the spacing list.
- A rate-limited public site: code `WEBSITE_RATE_LIMITED` with actionable copy and no
  fabricated retry delay, where it previously reported a generic block.

## Unverified runtime and known limitations

No authenticated browser QA was performed in this session; the user runs workspace UI QA
separately. Not verified here: responsive layout quality, screenshot fidelity, focus order,
and download authorization in a real browser.

- Crawl extracts server-delivered HTML, not JavaScript-only rendered navigation/content.
- Sitemap records first discovered parent relationships and extracted outgoing page links;
  links beyond crawl limits remain observations rather than visited pages.
- Blueprint is deterministic observed data; it contains no AI architecture inferences.
- Image classification currently supports metadata-evidenced icons/logos; ambiguous images
  remain unclassified. Resources with unavailable dimensions do not receive invented sizes.
- Image discovery bounds scanning at 5,000 elements and 200 candidate entries. Capture limits
  browser requests to 500 and accepted resource bodies to 50 MB.
- Worker lease fencing prevents stale writes, aborts Crawl fetch/delay, and closes capture
  contexts after lease loss or the fifteen-minute job budget. AI provider generation does not
  yet receive the worker abort signal. Shutdown finishes the current operation.
- API deduplicates identical active jobs under a locked user row and persists replay keys in
  job metadata. Key reuse with different parameters is rejected.
- Same-origin iframe content is captured into exported HTML without re-navigation; secured
  visual snapshot CSP still prevents executing embedded website frames.

These are explicit remaining verification gaps, not successful QA claims.

