# VibeDesign Extraction Workspace

Status: database-backed worker direction approved; Crawl and Images approved without credit charges.

## Scope

Implement real `design`, `html`, `crawl`, and `images` operations in the existing `/design/scrap` workspace, `/design/scrap/$id` result route, and shared history. Stay on `feature/vibedesign-scrape`. Preserve existing DESIGN.md generation, Style Inspector, and captured-DOM visual snapshot security.

## Repository evidence

- Baseline HEAD: `9e9dbed30c415d88400ce2eb52b21cb33537a7d5`; clean working tree before this document.
- `src/routes/api/scrape.ts` authenticates requests and starts `runScrapePipeline` without awaiting its completion. Unknown modes currently become `design`.
- `src/lib/services/scrape-service.ts` owns creation, processing, retry, lookup, history, and deletion. Retry requeues without an active-job predicate. Several internal writes filter only by scrape ID; changed writes must include ownership and job-claim predicates.
- `src/db/schema.ts` stores text-backed modes, HTML, preview HTML, metadata, and separate DESIGN.md documents. Existing rows default to `design`.
- `src/lib/fetch-html.ts` pins requests to validated public IP addresses, validates redirects, and bounds bytes/timeouts. Browser routing in `src/lib/render-page.ts` uses this fetch boundary.
- `src/lib/preview-capabilities.ts` binds asset capabilities to the exact canonical resource, scrape, owner, and expiry. `src/routes/api/scrape.asset.ts` checks ownership, active users, rate limits, MIME, and bytes.
- `src/components/design/scrape-detail.tsx` uses local view state. Source mode currently clears iframe `srcDoc` to stop activity; returning restores the captured document. Original website JavaScript must remain removed from the ephemeral preview.
- `src/lib/scrape-return-path.ts` allowlists `/design/scrap` and `/design/scrap/history`. `scrape-back-link.tsx` overrides that target with history Back whenever possible, which makes return navigation depend on unrelated history entries.
- `src/lib/adaptive-credit.ts` and `constants.ts` define codebase analysis, PRD, AC, and Task pricing. The inspected scrape API/service do not invoke credit accounting. The credit-service contract requires a planning project ID; a scrape must not masquerade as a planning project.
- `vercel.json` configures a daily billing cron. `package.json` supplies pnpm scripts and installed Playwright, Drizzle, Zod, React, and TanStack dependencies.
- `docs/vibedesign-preview-verification.md` records a previous request to stop the dev server. The user reaffirmed on 2026-10-11 that neither dev server nor worker may be started. Application browser QA and managed worker runtime QA are blocked by this explicit constraint; static and isolated fixture checks remain permitted.

## Architecture and alternatives

Use PostgreSQL-backed jobs with atomic claims, expiring leases, persisted checkpoints, and a separately managed Node worker. The web API enqueues work and returns the persisted ID; polling only reads state. Worker recovery does not depend on an open browser tab. A lost lease fences the previous executor from further writes.

Extending fire-and-forget would lose execution on process shutdown. Processing during status reads would make observation mutate jobs and depend on polling clients. An external queue would introduce a new infrastructure dependency. The approved database-backed direction uses the existing database and browser capture boundary.

Add a documented worker script using the installed TypeScript runner, with startup readiness, shutdown signals, browser cleanup, bounded concurrency, and resumable lease recovery. Production deployment must run this worker alongside the web deployment with access to the same PostgreSQL database and Chromium. Do not claim production operation until that runtime is provisioned and checked.

## Persistence and contracts

Keep `scrapes` as the user-owned history identity. Extend its mode contract and add validated settings, idempotency identity, and job lease fields through an additive migration. Add related page and image rows with scrape ID and owner ID, indexed ownership queries, normalized unique resource identifiers, statuses, results, and errors. Delete cascades remove related results.

Shared Zod discriminated request schemas validate all four modes. Omitted mode remains `design` for legacy clients; an explicit unsupported mode fails. Settings belong only to their mode. Existing records without settings resolve to documented defaults. Client and server use the same browser-safe contract module; it must not import server-only configuration or database drivers.

Client submission holds a synchronous in-flight guard. Server idempotency and an atomic active-job uniqueness boundary prevent concurrent duplicates. Retry only transitions a failed job, retains completed page/assets, clears obsolete terminal errors, and reuses valid HTML or DESIGN.md. Completed results are not regenerated by retry.

## Shared workspace

Preserve global navigation and Scrap/History navigation. Use a centered, comfortably bounded workspace with a prominent but restrained title, four independent horizontal mode controls, a concise mode description, one shared URL form, and a collapsible parameters panel.

Use semantic theme tokens, rectangular geometry, visible keyboard focus, and reduced-motion handling. Mode controls reflow or scroll within their container on small screens. The arrow-up submit button has a tooltip, accessible name, and mobile touch target.

Protocol and input state must represent one URL. Domain-only input defaults to HTTPS. Pasted HTTP/HTTPS updates the visible protocol and removes the protocol from the editable suffix. Preserve paths and queries; reject credentials, unsupported schemes, unsafe hosts, invalid ports, and oversized inputs before submission and at the server boundary.

Keep independent settings state for each mode. Reset restores only the current mode's documented defaults. Hide parameters for DESIGN.md. Keep submitted input after failure and surface client/server validation at the corresponding field.

## Crawl

Use breadth-first traversal with a persisted frontier and observed parent-link edges. Depth zero visits only the seed. Enforce max pages at claim time, not after downloads. Normalize fragments/default ports for identity without arbitrarily removing meaningful queries or trailing-slash distinctions.

Restrict traversal to the validated seed host; optional subdomains permit descendants of that host, never arbitrary sibling/external domains. Recheck scope and public-network safety on every redirect before fetching its destination. Do not send credentials or authenticated cookies.

Fetch and cache bounded robots rules per origin, honor applicable allow/disallow and crawl-delay, and fail closed for inaccessible/error robots responses except an actual not-found response. Share per-origin scheduling across workers to avoid parallel jobs exceeding request-rate bounds.

Compile the optional URL regex in an isolated worker with strict pattern/input lengths, bounded execution time, and termination on timeout. Validate syntax before enqueueing. The seed is always eligible; the regex gates discovered URLs. A timed-out expression is a parameter failure, not silently treated as a non-match.

Extract page title, description, headings, main/body text, canonical metadata, and observed links/images. Main-only changes the body extraction root and excludes navigation/footer/aside where practical; it does not erase page identity. Include-links and include-images affect stored exported result fields. Traversal edges remain available as crawl evidence even when link detail export is disabled.

Persist each completed or failed page before moving on. Preserve completed pages across partial failures and worker restarts. Progress reports actual discovered/visited/failed counts and the current URL, with no synthetic percent.

Results include inventory, an observed-edge sitemap, selectable page explorer, and downloadable Markdown blueprint. Blueprint documents verified page identity, relationships, headings, and recurring extracted patterns. Unknown page types remain unknown. Any inference is explicitly labeled; deterministic observations do not require an extra AI charge.

## HTML parameters and result

Wait time is a bounded additional wait in Chromium capture, not a client delay. Iframes disabled means skip frame capture. Enabled captures only safely accessible same-origin frame documents through the guarded browser boundary, with bounds on count/depth/bytes and explicit skipped-frame metadata. Cross-origin or inaccessible frames are not fabricated.

Header shows one site title and one full source URL. Group Eye/Code controls with Copy/Download and existing recovery actions. Use accessible tab semantics, arrow/Home/End keyboard selection, tooltip names, and selected-state contrast. Source/copy/download read persisted original HTML; preview reads only the secured ephemeral snapshot. Preserve wide preview and centered readiness/recovery.

Back uses the allowlisted `from` destination and a safe form fallback, rather than unconditional history Back. View switching remains local and never changes `from` or creates route history entries. Browser QA covers History and form origins, direct links, repeated switching, modified link clicks, and Back/Forward loops.

## Images

Capture rendered image elements/currentSrc, srcset candidates, picture sources, supported lazy attributes, computed CSS backgrounds, and icon metadata in the guarded browser. Bound DOM scanning, resource count, URL size, per-resource bytes, and total processing. Persist normalized assets and actual page associations.

Wait time affects capture. Resolution measurement enabled reads actual resource dimensions under bounds; disabled skips dimension-specific fetch/decode work. Failed/unsupported dimensions remain unavailable with an explicit reason. Classification uses actual metadata evidence and records that evidence; ambiguous assets remain unclassified rather than confidently labeled photographs or screenshots.

Provide responsive gallery, source links, known format/dimensions/classification, filtering from present metadata, empty results, broken-thumbnail handling, and safe original download. Issue exact signed resource capabilities only after ownership validation. Downloads use bounded authorized fetching and attachment headers; no unrestricted public proxy or fabricated placeholders.

## Billing decision gate

Crawl and Images do not deduct credits, as explicitly approved by the user on 2026-10-11. Enforce resource, rate, and concurrency limits without credit mutations. Preserve current DESIGN.md and HTML billing behavior. Do not invent a price or modify the planning ledger.

## Verification and delivery

Use deterministic fixture tests for URL/settings contracts, traversal scope/depth/page limits, regex timeout, robots, deduplication, redirects, include flags, checkpoints, lease fencing, ownership, retry, discovery, dimensions, classification evidence, and signed downloads. Keep valid existing tests and add regression protection for contextual Back and original HTML preservation.

Run affected tests, `pnpm exec tsc --noEmit`, changed-file `pnpm check`, full `pnpm test`, repository `pnpm check`, `pnpm build`, and type-bypass/security scans. Run `pnpm generate-routes` after route changes. Report pre-existing failures separately with actual output.

Use controlled capture fixtures and representative public websites for runtime checks. Authenticated browser journeys must verify all four modes, refresh/reopening/delete/retry, ownership, parameter effects, repeated view switching and Back, mobile/desktop, light/dark, focus and keyboard interaction. Do not manipulate production database state to bypass failed journeys.

Each coherent milestone is verified, diff-reviewed, and committed atomically before the next. Stage exact task files only. Push to the resolved feature upstream, never merge main, then verify clean status and zero outgoing commits. Full delivery remains incomplete until actual worker and application QA pass.
