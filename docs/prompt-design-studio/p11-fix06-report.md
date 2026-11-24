# P11 Fix 06 — Implementation Report

**Scope:** AI design quality, product navigation reasoning, UI composition reasoning, cross-screen content coherence, and real photography in VibeDesign Studio.  
**Status:** Implemented; browser QA is explicitly deferred to P12.  
**Branch:** `feature/vibedesign-design-studio`

## 1. Evidence and root-cause matrix

The representative Jelajahin artifacts were available as workspace evidence at investigation time: the original prompt, the planning prompt, `tmp-plan.json`, `tmp-worker.log`, and a rendered screenshot. They were moved out of the repository to `~/.cache/evvibe-p11-fix06-evidence/` after the report was drafted so the working tree can be clean without deleting the evidence. No persisted production project was available, so this report does not claim an audit of the live database record.

Cause labels follow P11 §5.

| Cause | Verdict | Evidence | Fix |
|:--|:--|:--|:--|
| A — generic/incorrect planning | Confirmed | `tmp-plan.json` had `compositionOwner: "model"`, destinations `["explore","tickets"]` and a coherent 5-screen booking flow, but the planning schema example still used `["home"]` and photo query strings were long descriptive sentences. | Planning schema example now uses a generic `primary-task` destination, explicitly removes Home/link-count bias, requires contextual screens to carry a journey-derived parent, and asks for short provider queries. `sampleData` was added as a shared fact ledger. |
| B — restrictive prompt contracts | Confirmed | `studio-quality-rules.ts` said Studio always assembles the app bar; `studio-component-guidance.ts` said Studio owns header/navigation. Both contradict `studio-screen-prompts.ts` model-owned branch ("Studio injects tokens, not chrome"). | Rules are now ownership-aware: model-owned blueprints author one coherent chrome; legacy canonical shells remain injected. No universal chrome count or layout was introduced. |
| C — deterministic assembly | Not the Jelajahin cause | `studio-frame-finalize.ts` returns early for `compositionOwner === "model"`. The screenshot came from model-authored markup, not canonical header injection. | No change to legacy canonical assembly. Existing projects are not regenerated. |
| D — unhelpful examples | Partially confirmed | The actual plan was better than the rendered result; however, the schema example and mobile reference were weak signals for parent relationships and search intent. | Planning examples and component guidance now explain parent/contextual relationships and require a search control to bind to a real collection. Existing EvVibe examples were not replaced with fixed templates. |
| E — incomplete requirements | Confirmed as a contract gap | The brief did not supply a durable fact ledger, so each frame received only screen names and a partial screen plan; the observed screenshot mixed 2025 and 2026 sample dates. | `blueprint.sampleData` records currency, date format, sample dates and statuses once; `buildStudioFramePrompt` passes a bounded continuity summary with each screen's role/primary task to every frame. |
| F — raw model output quality | Confirmed, not solved with templates | Screenshot showed unplanned `Profil` tab, duplicate search areas, scenic SVG instead of photography, and inconsistent dates. Validation did not detect the first two. | Deterministic validators reject unplanned primary navigation, unbound search inputs, and large scenery substituting for a planned photo slot. AI still decides whether navigation, search or photography is appropriate. |
| G — unavailable/misplaced imagery | Confirmed | Live Openverse check: `Labuan Bajo Padar Island landscape Indonesia` → 0 results; `Labuan Bajo` → 178 results. Worker log: `no-match`, one `timeout`, then failed project. Upstream also returned intermittent 500/504/timeouts. | `normalizePhotoQuery()` reduces verbose descriptive queries to two public subject terms before provider lookup; both providers receive the normalized query. Licence filter stays `cc0,pdm,by`; no share-alike or new provider was adopted because `p2-report.md` documents that legal decision. |
| H — validation/correction damage | Confirmed | Worker log shows repeated `photo-contract`, `html-contract`, `html-diagnostics` and `quality-repair` issues; no deterministic check existed for unplanned visible nav or search binding. | Added bounded structural checks. Correction still runs at most `STUDIO_FRAME_CORRECTION_MAX` rounds; no extra model call, no extra provider search, and no first-frame dependency on decorative assets. |

## 2. Changes by layer

- **Prompt ownership:** `studio-quality-rules.ts`, `studio-component-guidance.ts`.
- **Planning contract:** `studio-prompt-contracts.ts`, `studio-planning-prompt.ts`, `studio-design-blueprint.ts` (`sampleData`, type-safe component ID tuple).
- **Frame context:** `studio-screen-prompts.ts` (bounded continuity facts), `studio-frame-generation.ts` (explicit photo-slot instruction).
- **Validation:** `studio-semantic-navigation.ts` (all nav landmarks, search binding), `studio-generated-html-validation.ts` (scenery substitute).
- **Photography:** `photo-query.ts` (new), `studio-photo-source.ts`.
- **Tests:** `studio-design-quality-p11-fix06.test.ts` (new), `studio-blueprint-navigation.test.ts` (stale normalized `layoutIntent` expectation updated, assertion kept strict).
- **Legacy compatibility:** the scenery-substitute rule is gated to `compositionOwner === "model"`; legacy canonical blueprints keep their previous behavior.

No universal navbar, Home destination, hero, card quota, KPI row, back-bar, or header-action count was added. No runtime design-catalog browsing was added.

## 3. P11 consolidated delivery checklist

| # | Item | Current-state evidence | Claim |
|:--|:--|:--|:--|
| 1 | HTML-first renderer | `src/features/studio/tests/studio-chat-result-p11-fix04.test.tsx:132-136` renders sandboxed iframes from committed `htmlCode`; `src/features/studio/tests/studio-conversation-p11-fix04.integration.test.ts:290` serves a script-free document only to the owner. | Real standalone HTML remains the authoritative artifact; no JPEG substitution. Browser confirmation is P12 work. |
| 2 | Canvas / toolbar / trackpad | `docs/prompt-design-studio/p11-fix02-report.md`; `studio-canvas-gesture-input.test.tsx`, `studio-canvas-gesture.test.ts`, `studio-canvas-zoom-p5.test.tsx`, `studio-canvas-marquee.test.ts`. | Fix 02 behavior is preserved; Fix 06 touched generation services only. |
| 3 | Pencil and editing | `docs/prompt-design-studio/p11-report.md` (Fix 03), `p11-fix03-report.md`; `studio-revision-preservation.test.ts`, `studio-document-persistence-p5.integration.test.ts`. | Revision preservation and scoped editing contracts remain covered. No legacy project is auto-regenerated. |
| 4 | Chat explanations and result cards | `docs/prompt-design-studio/p11-fix04-report.md`; `studio-conversation-grounding-p11-fix04.test.ts`, `studio-chat-result-p11-fix04.test.tsx`, `studio-conversation-p11-fix04.integration.test.ts:261`. | Grounded explanations and honest result rows are preserved; no extra explanation model call was added. |
| 5 | Vertical suggestions and composer | Commit `d46529a8` (`fix(studio): replace suggestion carousel with conversation steps`); `studio-chat-suggestions-p11-fix05.test.tsx`, `studio-conversation-suggestions-p11-fix05.test.ts`, `studio-composer-p11-fix05.test.tsx`. | Fix 05 behavior is preserved; no conversation files were modified in Fix 06. No separate fix01/fix05 report file exists in the repository; the commit and tests are the retained evidence. |
| 6 | Design generation and photography | §1 matrix and §2 layer list; `studio-design-quality-p11-fix06.test.ts`, `studio-photo-placement.test.ts`, `studio-photo-provider.test.ts`. | Ownership-consistent prompts, journey-derived navigation, sample-data continuity, honest slots and short public queries are implemented. |
| 7 | Known limitations | §4. | Stated explicitly; no visual acceptance inferred from unit tests. |
| 8 | Test results | §5 and final test run recorded there. | Exact commands and pass/fail counts are recorded. |
| 9 | Remaining baseline failures | §6. | One pre-existing P6 pattern-contract failure is retained, reproduced on unmodified `HEAD`. |
| 10 | P12 Browser QA readiness | `docs/prompt-design-studio/p12.md`. | All browser-dependent acceptance was transferred; no browser acceptance is claimed here. |

## 4. Known limitations

- Unit tests prove deterministic contracts, not subjective visual excellence.
- Openverse is externally intermittent; measured live responses included 0-result queries, 500/504 HTML responses and timeouts. The code fails honestly with labelled fallback text rather than inventing imagery.
- The environment had no `STUDIO_PEXELS_API_KEY`; Pexels behavior is covered by mocked tests, not a live call.
- Query normalization intentionally keeps only two significant subject terms. That improves the measured landmark case but can be less specific for rare subjects; the planner still supplies the subject and the slot remains honest when lookup fails.
- Legal licence scope was not widened. `by-sa` and other redistributive/non-commercial licences remain excluded per the documented P2 product decision.
- No visual/browser acceptance was performed. This is P12 work.
- Prompt-size figures below are deterministic character counts for representative prompts, not live provider token billing; real timing measurement remains P12 work.

## 5. Test results

Executed with the repository's own commands:

- `pnpm biome check <touched files>` — clean, no diagnostics.
- `pnpm exec tsc --noEmit` — clean.
- Focused Vitest after the legacy-gating fix: new Fix 06 test — **1 file, 9 tests passed**.
- Final targeted Vitest across 19 files covering P11 §14 areas — **209 passed, 1 failed**. The single failure is the pre-existing P6 malformed-pattern contract described in §6; 18 files pass fully.
- Live Openverse queries (read-only): long descriptive query `0` results; `Labuan Bajo` `178` results; `Raja Ampat` `240` results. Upstream 500/504/timeout responses were observed on other short queries and are treated as provider unavailability, not design failures.

Deterministic prompt-size measurement for a representative Jelajahin brief (`pnpm exec tsx` calling the real builders):

| Prompt | Characters |
|:--|--:|
| Planning system (cacheable) | 17,387 |
| Planning user request | 6,203 |
| Frame system (byte-identical per frame) | 14,116 |
| Frame user request (4-screen travel blueprint) | 17,960 |

Media pipeline: `generateValidatedFrameHtml()` starts photo resolution before the generation loop (`studio-frame-generation.ts:74-95`) and awaits it only when applying slots after HTML generation (`studio-frame-generation.ts:257-265`). Each resolution emits a `photo-resolution` timing event. No extra model or provider call was added; request caps remain `STUDIO_FRAME_REQUEST_MAX = 3`, `STUDIO_FRAME_CORRECTION_MAX = 1`, `STUDIO_PLANNING_REQUEST_MAX = 3`, `STUDIO_PLANNING_CORRECTION_MAX = 1`.

The new regression tests cover discovery-led mobile plans with 1/2/4 destinations and no Home, unplanned nav rejection, search binding honesty, cross-screen sample facts in frame prompts, query normalization and provider propagation, chrome-ownership wording, scenery substitution, and preservation of legacy canonical behavior. Deterministic photo planning, provider failure, slot application, attribution, SSRF/MIME/size checks, export/revision preservation, and no-extra-model-call contracts were already covered by existing tests and re-run here.

## 6. Remaining baseline failure

`src/features/studio/tests/studio-planning-quality-p6.test.ts > rejects malformed composition ... patterns: ["unknown-runtime"]` expects `validateBlueprint()` to reject an unknown advisory pattern. The schema intentionally filters unknown pattern IDs to the closed server-owned set and accepts the rest; the in-code comment documents that behavior. This failure was reproduced on unmodified `HEAD` by temporarily stashing the working changes. It was not introduced by Fix 06 and was not softened or deleted.

A previous stale assertion in `studio-blueprint-navigation.test.ts` expected `productIdentity` without the normalized `layoutIntent`. It was updated to the precise normalized value `"web-application"` rather than loosened.

## 7. P11 §14 coverage ledger

| Required coverage | Evidence |
|:--|:--|
| Model-owned composition path | `studio-design-quality-p11-fix06.test.ts`, `studio-semantic-composition.test.ts`. |
| Legacy canonical compatibility | `studio-canonical-shell.test.ts`, `studio-canonical-blueprint.test.ts`, and the new legacy-scenery regression in `studio-design-quality-p11-fix06.test.ts`. |
| No forced three-link navbar / no mandatory Home / alternative mobile models | `studio-design-quality-p11-fix06.test.ts` (1/2/4 discovery-led destinations, no Home), `studio-prompt-contracts.ts:112`. |
| Correct destination references and contextual behavior | `studio-semantic-composition.test.ts:107-140`, `studio-semantic-navigation.ts:60-104`. |
| Theme / DESIGN.md consistency | `studio-design-intelligence.test.ts:441`, `studio-design-reference.server.test.ts:45`, `studio-add-screen.integration.test.ts:153`. |
| Diverse valid composition contracts; bounded card-wall check | `studio-design-blueprint.test.ts`, `studio-design-intelligence.test.ts:467-583`; validator is gated to `public-website`. |
| Consistent cross-screen prototype data | `studio-design-quality-p11-fix06.test.ts` (`sampleData` in every frame prompt), `studio-screen-prompts.ts:35-52`. |
| Photo planning, provider resolution/failure, slot application, no fabricated URL, secure refs, fallback honesty, attribution | `studio-photo-placement.test.ts`, `studio-photo-provider.test.ts`, `studio-design-intelligence.test.ts:456-464`, `photo-asset.ts:40-142`. |
| Revision/export preservation | `studio-revision-preservation.test.ts`, `studio-document-persistence-p5.integration.test.ts`. |
| No unnecessary model calls | `studio-design-intelligence.test.ts:390-428` (1 planning + 1 per frame; no browsing stage), bounded request constants in `studio-constants.ts:163-168`. |

These are deterministic contract checks. They do not prove subjective visual excellence; browser confirmation belongs to P12.

## 8. Handoff

- Historical reports remain in `docs/prompt-design-studio/`.
- `p11.md` now labels Fix 06 as complete and points to this report and the P12 brief.
- `p12.md` carries the transferred browser acceptance requirements.
- Working tree is clean after commit and push; temporary investigation artifacts were moved to `~/.cache/evvibe-p11-fix06-evidence/`, not silently deleted.
