# P7 — Retiring VibeDesign Design Skills While Preserving Legacy Projects

**Status:** complete. **Complexity:** complex. **Scope:** the entire user-selectable
design-skill feature (UI, prompt injection, registry, assets, time-report grouping,
API contract) is gone; every project, frame, revision and reference still loads,
revises, retries and exports unchanged.

> Deviation from the phase brief, recorded explicitly: `p7.md` ends with "Do not
> commit/push/merge/deploy." The session instruction and `AGENTS.md` require an
> atomic commit plus push before handoff, so the work was committed and pushed.
> Nothing was merged and nothing was deployed.

---

## 1. Dependency inventory (audited before any edit)

`grep` over the whole repository for `designSkillId`, `StudioDesignSkillId`,
`STUDIO_DESIGN_SKILLS`, `STUDIO_SKILL_*`, `StudioSkillSelect`, `studio-skill-*`,
`studio-design-skill*`, `ui-ux-pro-max`, `resolveStudioDesignSkill`,
`studioSkillSystemGuidance`, `buildStudioSkillContext`, `resolveStudioSkillContext`,
`resolveStudioFrameSystemPrompt`, `resolveStudioPlanningSystemPrompt`.

| Layer | Artifact | Skill coupling |
|---|---|---|
| Schema | `src/db/schema/studio.ts` | `designSkillId` (`notNull`, default `"none"`), `designSkillVersion` |
| Types | `src/features/studio/types/studio-service.ts` | `InitialFrameContext.designSkillId`, `ValidatedFrameInput.designSkillId` + `stage`, `CreateStudioProjectInput.designSkillId`, `StudioPreferencesInput` |
| Types | `src/features/studio/types/studio-status.ts` | `projectSchema.designSkillId` validated against the skill enum |
| Types | `src/features/studio/types/studio-constants.ts` | `STUDIO_SKILL_DOCUMENT_BUDGET_CHARS`, `STUDIO_SKILL_STAGE_BUDGET_CHARS`, `STUDIO_CHARS_PER_TOKEN_ESTIMATE` (skill-context audit only) |
| Validation | `src/features/studio/services/studio-generation-options.ts` | `studioDesignSkillIdSchema`, `StudioDesignSkillId`, `studioGenerationOptionsSchema.designSkillId` |
| Registry | `studio-design-skill-registry.server.ts`, `studio-design-skills.ts`, `studio-skill-manifest.ts`, `studio-skill-context.server.ts`, `studio-skill-selection.server.ts`, `studio-skill-capabilities.ts`, `studio-skill-context-audit.server.ts`, `ui-ux-pro-max-lookup.ts` | the whole adapter/assembly/selection engine |
| Assets | `studio-skill-assets.generated.ts` (700 KB), `studio-skill-assets-build.ts`, `src/features/studio/skills/**` (23 files), `public/icons/skills/**` | pinned upstream documents, datasets, logos |
| Prompt composition | `studio-frame-runtime.ts`, `studio-planning.ts`, `studio-prompt-contracts.ts`, `studio-quality-rules.ts`, `studio-planning-prompt.ts`, `studio-screen-prompts.ts` | skill guidance block, per-stage selection, "selected design skill guidance" precedence rung |
| Generation paths | `studio-frame-generation.ts`, `studio-frame-operation.ts`, `studio-initial-frame.ts`, `studio-revision-service.ts`, `studio-project-create.ts`, `studio-project-enqueue.ts`, `studio-job-pipeline.ts` | passed `designSkillId` through every request |
| API | `studio-generate-http.ts` (`designSkillId` body field), `studio-project-http.ts` (`preferences` action), `studio-preferences-service.ts` | request-level skill requirements and a write path |
| UI | `studio-skill-select.tsx`, `studio-composer.tsx`, `studio-launch-composer.tsx`, `studio-landing-page.tsx`, `studio-workspace.tsx`, `use-studio-workspace.ts`, `use-studio-workspace-actions.ts` | the dropdown, its state, and the preference write |
| Telemetry | `studio-timing.ts`, `studio-timing-report.ts` | `skillId`, `skillStage`, `skillChars`, `selectedSectionCount`, `omittedSectionCount`, `estimatedTokens`, `promptAssemblyMs`, `perSkill` |
| Build/deploy | `package.json` (`studio:assets`, `studio:assets:check`, `studio:smoke`, and their hooks in `dev`, `dev:all`, `build`, `test`, `studio:worker`) | generated-asset gate |
| Help copy | `src/components/bantuan/workflow-guides.tsx` | "Pilih skill & referensi" step |
| Tests | 8 skill-only suites + skill dimensions inside 14 more | see §5 |
| Docs | `docs/studio-skills/**`, `docs/studio-generation-latency.md`, `docs/studio-p2-component-discovery.md`, `README.md` | see §6 |

Also verified: no `e2e/`, `scripts/`, or CI workflow reference (`scripts/studio-p2-check.ts`
and `.github/` were clean; there is no workflow directory in this checkout).

---

## 2. Removal plan (executed in this order)

1. **Baseline first.** Compose the single mandatory standard before deleting
   anything, so the generation paths can never be left without the quality
   contract: `STUDIO_PLANNING_SYSTEM_PROMPT` and `STUDIO_FRAME_SYSTEM_PROMPT` in
   `studio-prompt-contracts.ts` interpolate the base quality contract exactly once.
2. **Cut the runtime.** `generateStudioHtml` lost its `designSkillId` and
   `context` parameters; every caller lost the skill argument, and the now
   meaningless `correctionFocus` / `ValidatedFrameInput.stage` fields were removed
   with it.
3. **Cut the request surface.** `designSkillId` left the generate body schema,
   `CreateStudioProjectInput` and the options schema; the `preferences` action and
   its service were deleted outright.
4. **Cut the UI.** The selector, its props, its state hook and its preference
   request were removed; the composer now renders only the reference chip.
5. **Cut telemetry.** Skill attribution fields and the `perSkill` report section
   were deleted; `frame-context` now reports the exact `systemChars`/`promptChars`
   of the two strings handed to the provider, which is the honest replacement for
   the retired skill-size measurement.
6. **Retire persisted metadata, do not drop it** (see §3).
7. **Delete dead code and assets** only after the reference grep came back empty.
8. **Verify** loaders, revision, retry, export and the new baseline (§5).

---

## 3. Migration of persisted metadata (staged, non-destructive)

* **Legacy representation.** A historic project is a `studio_projects` row that
  carries `design_skill_id` (e.g. `impeccable`) and, often, `design_skill_version`.
  Frames and revisions carry no skill state at all.
* **Reader tolerance.** `studioStatusSchema.projectSchema` now validates the
  column as a plain string, so any historic value parses. Nothing else reads it.
* **No writer remains.** Project creation, enqueue and duplication stopped writing
  a skill; new rows take the column default `"none"` and `design_skill_version`
  stays `null`. The duplicate path still copies the source row's value, because a
  duplicate is a faithful copy of history, not a new skill choice.
* **No destructive migration.** Dropping the two columns would destroy history for
  zero functional gain, so no migration was generated and no row was rewritten.
  Neither column is a live dependency; see §7.
* **No silent changes to old HTML.** No frame `html_code`, revision or export was
  regenerated, mutated or backfilled.

---

## 4. The mandated baseline (what replaced the skills)

Skill removal retires *optional skill-selection infrastructure*, not the quality
floor. All of the following are unchanged and still enforced:

* the base quality contract (`STUDIO_BASE_QUALITY_PROMPT` / `STUDIO_BASE_QUALITY_INVARIANTS`);
* HTML safety and completeness validation (`studio-generated-html-validation.ts`, `studio-html-diagnostics.ts`);
* accessibility requirements and accessible-label repair (`studio-accessible-repair.ts`);
* component-first patterns and canonical CSS ownership (`studio-canonical-*.ts`, `studio-component-guidance.ts`);
* platform-aware layout contracts (`MOBILE_PLATFORM_CONTRACT`, `WEB_PLATFORM_CONTRACT`);
* structural/shell quality checks (`validateCanonicalShell`, `structural-quality`);
* bounded repair and correction rounds (`STUDIO_FRAME_REQUEST_MAX`, `STUDIO_FRAME_CORRECTION_MAX`);
* shared design tokens (`studio-design-tokens.ts`, `studio-design-system-html.ts`);
* the design-reference precedence chain, minus the skill rung.

`STUDIO_FRAME_SYSTEM_PROMPT` is now byte-identical on every frame, correction and
revision request, and `STUDIO_PLANNING_SYSTEM_PROMPT` on every plan — asserted by
exact equality in `studio-skill-retirement.test.ts`, which is the strongest
available proof that no skill context is injected anywhere.

---

## 5. Impacted files

**Deleted (45 paths).** Services: `studio-design-skill-registry.server.ts`,
`studio-design-skills.ts`, `studio-skill-capabilities.ts`,
`studio-skill-context.server.ts`, `studio-skill-context-audit.server.ts`,
`studio-skill-manifest.ts`, `studio-skill-selection.server.ts`,
`studio-skill-assets-build.ts`, `studio-skill-assets.generated.ts`,
`ui-ux-pro-max-lookup.ts`, `studio-preferences-service.ts`. UI:
`composer/studio-skill-select.tsx`. Assets: `src/features/studio/skills/**` (23),
`public/icons/skills/**` (2). Shim: `src/lib/studio-generation-options.ts`.
Tests: `studio-design-skill-fidelity`, `studio-selects`, `studio-skill-assets`,
`studio-skill-comparative-evaluation`, `studio-skill-context-audit`,
`studio-skill-stage-context`, `studio-preferences.integration`,
`studio-native-runtime.smoke`.

**Added.** `src/features/studio/tests/studio-skill-retirement.test.ts`, this report.

**Modified.** `src/db/schema/studio.ts`; `studio-prompt-contracts.ts` (composed
prompts), `studio-quality-rules.ts` (comment + wording), `studio-frame-runtime.ts`,
`studio-frame-generation.ts`, `studio-frame-operation.ts`, `studio-initial-frame.ts`,
`studio-revision-service.ts`, `studio-project-create.ts`, `studio-project-enqueue.ts`,
`studio-job-pipeline.ts`, `studio-planning.ts`, `studio-generation-options.ts`,
`studio-generate-http.ts`, `studio-project-http.ts`, `studio-timing.ts`,
`studio-timing-report.ts`, `studio-planning-prompt.ts`, `studio-screen-prompts.ts`,
`studio-prompt-shortcuts.ts`, `types/studio-service.ts`, `types/studio-status.ts`,
`types/studio-constants.ts`; composer/workspace UI and both workspace hooks;
`src/components/bantuan/workflow-guides.tsx`; `package.json`; `README.md`; 6 docs.

---

## 6. Targeted tests

Run for this phase (no browser QA, no Playwright, no repo-wide sweep):

| Suite | What it now proves |
|---|---|
| `studio-skill-retirement.test.ts` (new) | No skill on a new project; no skill in any system prompt (exact equality with the mandated standard); base quality contract present in every prompt; theme / custom `DESIGN.md` / VibeScrape references still applied; a historic project loads, reopens through `studioStatusSchema`, revises, retries and exports |
| `studio-project-route.test.ts` | `preferences` rejected as an unsupported action; no handler runs |
| `studio-export.test.ts` | A project row carrying a historic skill still exports |
| `studio-generation-options.test.ts` | Options default without a skill; a retired client's `designSkillId` is stripped, not rejected |
| `studio-design-reference-matrix.test.ts` | Theme / scrape / upload references applied to planning and every frame |
| `studio-design-reference-legacy-format.test.ts` | The archived VibeScrape document still parses and reaches every prompt |
| `studio-quality-gate-p3.test.ts`, `studio-quality-p4.test.ts`, `studio-validated-frame-p4.test.ts`, `studio-output-diagnostics.test.ts`, `studio-frame-contract-p2.test.ts` | Bounded correction, contract validation and diagnostics unchanged, without a skill axis |
| `studio-p3-pipeline.test.ts` | One composed planning/frame standard replaces the six skill contexts |
| `studio-planning.integration.test.ts`, `studio-blueprint-navigation.test.ts`, `studio-add-screen.integration.test.ts` | Refs, blueprint and shared context survive add/revise |
| `studio-timing-report.test.ts`, `studio-latency.test.ts` | Frame/planning token totals and scheduler measurements unchanged; skill grouping removed |
| `studio-composer.test.tsx`, `studio-launch-composer.test.tsx`, `studio-index.test.tsx` | The composer/landing surface renders without a skill control |
| `prd-viewer.test.tsx` | Source-tree scan no longer allowlists the deleted generated asset |

**Input token volume.** Deleting skill guidance removes a large, previously
variable block from the system prompt; `frame-context` and `planning-context` still
log `systemChars`/`promptChars`, so the change stays measurable per request. No
latency improvement is claimed — the removed work was prompt assembly, not provider
time, and provider-reported `inputTokens` must be compared on real traffic first.

**Pre-existing failures, unchanged by this phase (verified by re-running each at
`HEAD` with the work stashed).** They are recorded, not re-pinned or silenced:

| Suite | Failure at `HEAD` | Cause |
|---|---|---|
| `studio-validated-frame-p4.test.ts` | `meneruskan dokumen sebelumnya ke koreksi…` expects the raw previous document to appear verbatim in the correction prompt | `enforceDesignSystemOnHtml` rewrites the document before the correction prompt is built, so the raw prefix is no longer a substring. Unrelated to skills. |
| `studio-blueprint-navigation.test.ts` | `preserves tokens, designSkillId and styling references throughout extension` compares the stored `productIdentity` with the fixture | `validateBlueprint` always fills `layoutIntent`, and the fixture omits it. Unrelated to skills; the skill assertion itself was removed in this phase. |
| `studio-index.test.tsx` | `shows error when submitting empty prompt` cannot find the empty-prompt copy | The landing component no longer renders that exact string. Unrelated to skills. |

Every other suite in the batches above passes.

---

## 7. Retained legacy compatibility fields

| Field | State | Why it is retained |
|---|---|---|
| `studio_projects.design_skill_id` | present, `notNull`, default `"none"`, never read for behaviour, never written by current code | Historic rows carry skill values; dropping the column destroys history and would require a destructive migration. `studio_status.ts` validates it as a plain string so any historic value loads. |
| `studio_projects.design_skill_version` | present, nullable, never written | Companion of the row above, written only by the deleted preferences service. |

No other skill identifier survives in code, assets, scripts, prompts or UI. There is
no runtime branch that still depends on a skill value, so this is a genuine removal
with two inert columns kept as data, exactly as the phase brief allows.
