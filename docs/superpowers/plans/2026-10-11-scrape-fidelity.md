# Scrap fidelity remediation implementation plan

**Goal:** Repair factual extraction, processing reliability, and processing UX on `feature/vibedesign-scrape`.

**Approved design:** Versioned computed-style evidence collected within the existing guarded browser capture is canonical. Deterministic factual tables and the inspector consume the same evidence. AI explains evidence without authoring measurements. Legacy documents remain accessible and unverified. No website-specific fixes, invented measurements, or additional dependencies.

## Audit evidence

Starting HEAD: `a744c7aefe16db68d54f9b27c104b83c6dc5971e`. Clean working tree; upstream `origin/feature/vibedesign-scrape`.

- `design-extraction.ts` assigns semantic colors by source ordering and supplies fabricated palette, font, heading, and CTA defaults.
- `scrape-service.ts` calls that parser after browser capture, losing computed styles before generation.
- `prompts-design-md.ts` requires 12,000 characters, eight colors and components, and encourages inferred expansion.
- `design-md-inspector.ts` parses model Markdown without canonical evidence.
- `scrape-extraction-service.ts` validates image URLs but not fetched response status/type, silently drops validation failures, and reports completed even if every candidate was discarded.
- `createScrape` uses `WEBSITE_BLOCKED` for both rate limit and queue capacity; API maps that code to 502.
- The detail route and progress component both render error/retry for failed Images without partial results.
- `scrape-progress.tsx` has three-dot activity glyphs and redundant header/timeline spinners.

## Execution obligations

- Read actual callers, contracts, configuration, tests and recent history before each change; reproduce the failure mechanism.
- Validate external and persisted payloads; preserve ownership, SSRF guards, capture limits, lease fencing and partial results.
- Use existing browser capture, worker, components and scripts; inspect current library docs for API changes.
- Cover empty, pending, invalid, unauthorized, network/provider failure, duplicate/stale/abort, retry and terminal states. Billing and unrelated planning flows are outside this change.
- Verify every milestone with affected deterministic tests, TypeScript, Biome and bypass scan; inspect status/diff, stage named files, commit atomically before subsequent milestones.
- Never label declarations or AI inference observed. Missing evidence stays unknown. No quota-driven token fabrication.

## Milestones

1. Add bounded serializable computed-style observations with source URL, selector, element role, dimensions, properties and loaded font-face status. Collect while browser context is alive. Test hidden/unused CSS, resolved variables, CTA styling, gradients, alpha and absent evidence using Chromium fixtures. Retain capture resource guards.
2. Replace quantity contracts with evidence contracts. Render factual tables deterministically; reject unsupported AI measurements and unsafe repair. Persist matching evidence with document.
3. Feed inspector from validated evidence; retain original legacy Markdown with an unverified indication. Confirm swatches, export and font measurements agree.
4. Verify image responses and persist actual outcomes/counters. Distinguish zero candidates from all failed. Repair restart/partial-result reconciliation. Add supervised web+worker development command with consistent env and cleanup. Separate capacity/rate/transport errors.
5. Reuse processing workspace and timeline for all modes, real elapsed time/counters/activity, one failure+retry, no dummy thoughts or redundant spinner. Verify 320–1440px and both themes.
6. Run controlled fixtures and Brainfish/dark/light/custom-font public captures. Run all four real web/worker journeys, restart/unavailable/capacity/retry/history/refresh checks. Record exact limitations.

## Verification and handoff

Commands from package scripts: `pnpm test`, `pnpm exec tsc --noEmit`, `pnpm check`, `pnpm build`. Chromium tests use installed Playwright. No manual DB state manipulation or mocked success UI. Each concern ends in its own verified commit. Push to resolved upstream and prove clean tree and zero ahead/behind commits before completion. If runtime evidence is blocked, document exact blocker and report Partial/Blocked rather than Complete.
