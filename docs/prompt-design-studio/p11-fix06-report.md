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

No universal navbar, Home destination, hero, card quota, KPI row, back-bar, or header-action count was added. No runtime design-catalog browsing was added.

## 3. P11 consolidated delivery checklist

1. **HTML-first renderer** — unchanged from Fix 01/01.1/01.2; real standalone HTML remains the generated artifact. No JPEG substitution was introduced.
2. **Canvas/toolbar/trackpad** — unchanged from Fix 02; this task touched generation services only, not the canvas interaction layer.
3. **Pencil and editing** — unchanged from Fix 02/03; revision preservation contracts remain covered by existing tests.
4. **Chat explanations and frame result cards** — unchanged from Fix 04; no additional LLM call was added here.
5. **Vertical suggestions and composer** — unchanged from Fix 05; no chat/conversation files were modified.
6. **Design generation and photography** — implemented above: ownership-consistent prompts, journey-derived navigation reasoning, shared sample-data continuity, honest photo slots, and short public photo queries.
7. **Known limitations** — listed in §4.
8. **Test results** — listed in §5.
9. **Remaining baseline failures** — listed in §6.
10. **P12 Browser QA readiness** — transferred to `p12.md`; no browser acceptance is claimed here.

## 4. Known limitations

- Unit tests prove deterministic contracts, not subjective visual excellence.
- Openverse is externally intermittent; measured live responses included 0-result queries, 500/504 HTML responses and timeouts. The code fails honestly with labelled fallback text rather than inventing imagery.
- The environment had no `STUDIO_PEXELS_API_KEY`; Pexels behavior is covered by mocked tests, not a live call.
- Query normalization intentionally keeps only two significant subject terms. That improves the measured landmark case but can be less specific for rare subjects; the planner still supplies the subject and the slot remains honest when lookup fails.
- Legal licence scope was not widened. `by-sa` and other redistributive/non-commercial licences remain excluded per the documented P2 product decision.
- No visual/browser acceptance was performed. This is P12 work.

## 5. Test results

Executed with the repository's own commands:

- `pnpm biome check <14 touched files>` — clean, no diagnostics.
- `pnpm exec tsc --noEmit` — clean.
- Focused Vitest: new Fix 06 test + blueprint navigation + semantic composition + photo provider + design blueprint — **5 files, 41 tests passed**.
- Wider targeted Vitest (10 studio files listed in P11 §14 coverage areas) — **122 passed, 1 failed**; the single failure is the pre-existing P6 malformed-pattern contract described in §6.
- Live Openverse queries (read-only): long descriptive query `0` results; `Labuan Bajo` `178` results; `Raja Ampat` `240` results. Upstream 500/504/timeout responses were observed on other short queries and are treated as provider unavailability, not design failures.

The new regression tests cover discovery-led mobile plans with 1/2/4 destinations and no Home, unplanned nav rejection, search binding honesty, cross-screen sample facts in frame prompts, query normalization and provider propagation, chrome-ownership wording, and scenery substitution. Deterministic photo planning, provider failure, slot application, attribution, SSRF/MIME/size checks, export/revision preservation, and no-extra-model-call contracts were already covered by existing tests and re-run here.

## 6. Remaining baseline failure

`src/features/studio/tests/studio-planning-quality-p6.test.ts > rejects malformed composition ... patterns: ["unknown-runtime"]` expects `validateBlueprint()` to reject an unknown advisory pattern. The schema intentionally filters unknown pattern IDs to the closed server-owned set and accepts the rest; the in-code comment documents that behavior. This failure was reproduced on unmodified `HEAD` by temporarily stashing the working changes. It was not introduced by Fix 06 and was not softened or deleted.

A previous stale assertion in `studio-blueprint-navigation.test.ts` expected `productIdentity` without the normalized `layoutIntent`. It was updated to the precise normalized value `"web-application"` rather than loosened.

## 7. Handoff

- Historical reports remain in `docs/prompt-design-studio/`.
- `p11.md` now labels Fix 06 as complete and points to this report and the P12 brief.
- `p12.md` carries the transferred browser acceptance requirements.
- Working tree is clean after commit and push; temporary investigation artifacts were moved to `~/.cache/evvibe-p11-fix06-evidence/`, not silently deleted.
