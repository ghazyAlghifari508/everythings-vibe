# HOTFIX — Repair VibeScrape [DESIGN.md](http://DESIGN.md) Integration with VibeDesign Studio

**Priority:** P0 — CRITICAL  
**Complexity:** COMPLEX  
**Task Type:** Targeted integration bugfix  
**Repository:** `ghazyAlghifari508/everythings-vibe`  
**Target Branch:** `feature/vibedesign-design-studio`

## 1. Mission &amp; Critical Context

Fix a specific integration bug involving [DESIGN.md](http://DESIGN.md) documents previously generated and saved by VibeScrape.

The user can browse completed VibeScrape projects in VibeDesign Studio, select their stored [DESIGN.md](http://DESIGN.md) as a design reference, and see the selected reference inside the AI composer.

However, when the user submits a design-generation prompt with that reference attached, Studio may fail with:

> "Terjadi kendala saat memproses permintaan Studio. Silakan coba beberapa saat lagi."

The problem is **NOT the manual [DESIGN.md](http://DESIGN.md) upload feature**.

The affected workflow is:

**An existing, persisted VibeScrape [DESIGN.md](http://DESIGN.md) → selected from Studio's "Punya Saya" tab → used during AI generation.**

Your mission is to identify and resolve the actual failing integration boundary.

### Important: Previous Phase Already Completed

A previous coding agent has already worked on Phase 3 — Design Reference End-to-End Reliability.

Therefore:

- Inspect the latest branch and recent changes first.
- Identify what Phase 3 has already fixed.
- Reuse the existing reference resolver and error handling.
- Avoid duplicating implemented logic.
- Do not replace working code with a second implementation.
- Do not revert unrelated Phase 3 changes.
- Focus exclusively on confirmed remaining defects affecting VibeScrape references.

**This is a follow-up hotfix, not a request to restart Phase 3.**

---

## 2. Exact User Scenario

### Current failing user flow

```
                VIBESCRAPE
                    |
                    v
       User scrapes an existing website
                    |
                    v
          VibeScrape generates
                DESIGN.md
                    |
                    v
        DESIGN.md is saved/persisted
                    |
                    |
                    v
              VIBEDESIGN
                    |
                    v
         Open /design/studio
                    |
                    v
        Click Design Picker icon
                    |
                    v
          Select "Punya Saya"
                    |
                    v
         Section "Dari VibeScrape"
                    |
                    v
       Select an existing reference
                    |
                    v
       Click "Gunakan" / Apply
                    |
                    v
     Composer shows "Referensi aktif"
                    |
                    v
          User writes a prompt
                    |
                    v
       Select Skill (or No Skill)
                    |
                    v
           Submit Generation
                    |
                    v
             ❌ ERROR
```

### Example

The user selects an existing VibeScrape reference such as:

"Ngoding Pake AI — Bikin PRD ..."

The composer correctly displays that the reference is active.

The user may select Impeccable or No Skill, write a product brief, and submit.

Instead of creating a design project successfully, the application returns a generic processing error.

### Expected flow

```
Select Stored VibeScrape Reference
                 |
                 v
        Validate Reference ID
                 |
                 v
       Fetch Saved DESIGN.md
                 |
                 v
      Verify Ownership & Status
                 |
                 v
    Parse / Validate Design System
                 |
                 v
       Persist Studio Reference
                 |
                 v
       Create Project + Job
                 |
                 v
        AI Planning Receives
         Design Reference
                 |
                 v
      Shared Design Blueprint
                 |
                 v
       AI Generates Frames
                 |
                 v
       Frames Follow Selected
           Design System
```

No generic error should appear for a valid, supported VibeScrape reference.

---

# 3. Mandatory Codebase Inspection

Before writing code:

1. Confirm current Git branch, HEAD, and working-tree changes.
2. Read [`AGENTS.md`](http://AGENTS.md).
3. Read `opencode.json`.
4. Read relevant `.agents/rules/*` completely.
5. Inspect commits associated with the completed Phase 3.
6. Trace the existing VibeScrape → Studio integration end to end.

The repository recently adopted a feature-based structure.

Use current paths, not obsolete imports from the old Studio architecture.

### Primary source files

VibeScrape producer:

- `src/features/scrape/services/scrape-design-md-service.ts`
- `src/features/scrape/services/scrape-detail-service.ts`
- Relevant VibeScrape persistence, history, and document-generation services.

VibeDesign consumer:

- `src/features/studio/services/studio-design-reference.server.ts`
- `src/features/studio/services/studio-design-tokens.ts`
- `src/features/studio/services/studio-project-enqueue.ts`
- `src/features/studio/services/studio-generate-http.ts`
- `src/features/studio/services/studio-prompt-validation.ts`
- `src/features/studio/services/studio-design-blueprint.ts`
- `src/features/studio/services/studio-frame-generation.ts`
- `src/features/studio/components/design-system/studio-scrape-design-sources.tsx`
- `src/features/studio/components/design-system/studio-design-picker-dialog.tsx`
- `src/features/studio/components/composer/studio-launch-composer.tsx`

Inspect current tests and schema definitions.

These paths are starting points. Verify actual ownership and imports in the latest HEAD.

---

# 4. Critical Findings to Reverify

Previous source inspection found that Studio already implements:

```
resolveStudioDesignReference(...)
```

For a VibeScrape reference, the resolver uses:

```
getScrapeDesignMd(parsed.id, userId)
```

Then processes the returned document through validation and token extraction.

The VibeScrape service returns information conceptually similar to:

```
{
  scrapeId,
  sourceUrl,
  title,
  designMd
}
```

Studio then attempts to validate the document and extract usable design-system tokens.

### Potential failure boundaries

Investigate the following without assuming any is definitely responsible:

1. Reference ID submitted incorrectly.
2. Wrong identifier type passed to the VibeScrape service.
3. User ownership mismatch.
4. Scrape status incorrectly classified.
5. Missing stored `designMd`.
6. Valid VibeScrape document rejected by Studio validation.
7. Difference between VibeScrape's actual [DESIGN.md](http://DESIGN.md) format and Studio's parser.
8. Valid document exceeding Studio's content budget.
9. Failure extracting colors or typography.
10. Failure persisting reference metadata.
11. Request schema mismatch.
12. Database error during project creation.
13. Unexpected exceptions classified as generic HTTP 500.

**Find evidence of the actual failure. Do not randomly change all of these areas.**

---

# 5. Verify Producer–Consumer Compatibility

The core issue may involve mismatched contracts between the module generating [DESIGN.md](http://DESIGN.md) and the module consuming it.

Audit the entire data lifecycle.

```
VIBESCRAPE PRODUCER
        |
        v
Generated DESIGN.md
        |
        v
Persisted scrape document
        |
        v
getScrapeDesignMd()
        |
        v
STUDIO REFERENCE RESOLVER
        |
        v
validateStudioDesignMd()
        |
        v
extractDesignSystemTokens()
        |
        v
Studio Generation Pipeline
```

### Required investigation

Determine:

- What exact format does VibeScrape currently produce?
- What versions or legacy formats exist?
- Which sections does Studio expect?
- Which sections are mandatory?
- Which sections are optional?
- Does token extraction recognize valid VibeScrape output?
- Can a valid completed scrape produce a document rejected by Studio?
- Does token validation incorrectly reject missing optional tokens?
- Are generated Markdown color tables parsed correctly?
- Does typography extraction understand the actual font format?
- Are document limits consistent with the producer's output?

The previous source review identified support for sections such as:

```
## Tokens - Colors
## Fonts & Type Scale
```

Verify whether this remains the canonical producer format.

### Important principle

**A valid [DESIGN.md](http://DESIGN.md) produced by VibeScrape should be consumable by VibeDesign Studio without requiring the user to manually edit it.**

If producer and consumer formats differ, create a shared, versioned contract or a narrowly scoped compatibility adapter.

Do not hardcode individual website names or scrape IDs.

Do not silently rewrite user design tokens to unrelated defaults.

Do not bypass validation entirely.

---

# 6. Verify Reference Selection &amp; Request Payload

The user selecting a reference should result in a stable, typed reference object.

Conceptually:

```
{
  kind: "scrape",
  id: "<persisted-scrape-id>"
}
```

Verify the actual schema and request implementation.

The browser should not need to send the entire stored [DESIGN.md](http://DESIGN.md) back to the server when the reference is already persisted.

Expected process:

```
User selects reference
         |
         v
Composer stores reference ID
         |
         v
POST /api/studio/generate
         |
         v
Server loads saved DESIGN.md
         |
         v
Validated project creation
```

Audit:

- Picker selection handler.
- Applied draft state.
- Composer submit handler.
- Request serialization.
- Zod schemas.
- Server resolution.
- Authentication context.

### Required verification

A selected VibeScrape reference must not accidentally be interpreted as:

- A built-in theme.
- A manual upload.
- A raw Markdown string.
- An unknown template.

Preserve stable source identity throughout the request.

---

# 7. Repair the Actual Failure, Not Just the Error Message

This requirement is critical.

The previous Phase 3 may have already improved generic error responses.

That does not mean the underlying bug is resolved.

Do not consider this task complete after replacing:

"Terjadi kendala saat memproses permintaan Studio."

with a friendlier error.

The feature must successfully complete project creation when given a valid stored VibeScrape reference.

### Investigation order

1. Inspect current server exception classification.
2. Trace the failing operation.
3. Determine the exact exception source.
4. Reproduce with a representative persisted VibeScrape fixture.
5. Fix the source of failure.
6. Add regression tests.
7. Confirm the reference remains available in generated project state.

If a real local VibeScrape document is unavailable, build representative fixtures from the actual producer schema and output examples.

Do not invent a fake success response.

Do not claim production data was tested when only mocked data was used.

---

# 8. Skill Compatibility Must Remain Functional

The VibeScrape reference must work both with and without a selected design skill.

At minimum verify:


| Reference                                | Skill           | Expected |
| ---------------------------------------- | --------------- | -------- |
| VibeScrape [DESIGN.md](http://DESIGN.md) | No Skill        | Works    |
| VibeScrape [DESIGN.md](http://DESIGN.md) | Impeccable      | Works    |
| VibeScrape [DESIGN.md](http://DESIGN.md) | Frontend Design | Works    |
| VibeScrape [DESIGN.md](http://DESIGN.md) | UI UX Pro Max   | Works    |
| VibeScrape [DESIGN.md](http://DESIGN.md) | Anti-Slop       | Works    |
| VibeScrape [DESIGN.md](http://DESIGN.md) | Taste           | Works    |


Don't confuse successful request validation with successful application of the reference.

### Design reference precedence

The [DESIGN.md](http://DESIGN.md) should provide the project's visual identity.

The selected skill should provide compatible design guidance.

Example:

```
VibeScrape DESIGN.md
  ├── Primary color
  ├── Background
  ├── Typography
  ├── Spacing
  └── Component styling
          |
          v
Selected Skill: Impeccable
          |
          v
Improve composition and visual craft
WITHOUT replacing the selected identity
          |
          v
AI generates consistent screens
```

No Skill should still apply the VibeScrape design reference.

The project must not silently fall back to generic Studio styling.

---

# 9. Verify [DESIGN.md](http://DESIGN.md) Really Affects Generated Frames

Do not stop after confirming the project was created.

Trace the persisted reference into:

1. AI planning.
2. Shared Design Blueprint.
3. Per-frame generation.
4. Relevant future revisions.

### Required checks

Verify that a selected VibeScrape reference influences:

- Color choices.
- Typography.
- Surface treatments.
- Component styling.
- Relevant spacing.
- Cross-frame consistency.

Apply only information genuinely present in the document.

Do not fabricate a complete source design system from missing data.

### Example

```
VibeScrape Reference
--------------------
Primary: #123456
Font: Example Sans
Radius: 8px

         |
         v

Studio Blueprint
----------------
Primary: #123456
Font: Example Sans
Radius: 8px

         |
         v

Generated Frames
----------------
Frame A → follows reference
Frame B → follows reference
Frame C → follows reference
```

The above is illustrative test data, not a production design recommendation.

If the current blueprint or HTML enforcement overrides selected tokens, correct that precedence.

---

# 10. Reliable User-Facing Error Handling

When a real source problem occurs, provide a concise actionable message.

Examples:

**Reference deleted or unavailable**

"Referensi desain ini sudah tidak tersedia. Pilih referensi lain."

**Stored [DESIGN.md](http://DESIGN.md) invalid**

"Referensi desain belum bisa digunakan. Pilih referensi lain atau periksa hasil VibeScrape."

**Temporary service failure**

"Desain belum berhasil diproses. Coba lagi."

Do not expose:

- Internal exception names.
- SQL errors.
- Stack traces.
- Scrape storage implementation.
- Raw schema validation objects.
- Internal source code paths.
- Entire raw [DESIGN.md](http://DESIGN.md) contents.

### Internal diagnostics

Maintain structured server-side logs with:

- Operation identifier.
- Safe correlation ID.
- Error category.
- Failure stage.
- Request/job association where applicable.

Do not log user-owned raw Markdown documents or secret tokens.

The public message should be concise. The internal diagnostics should remain sufficiently detailed for debugging.

---

# 11. Preserve Working Features

This hotfix must NOT break:

- Built-in themes.
- Manual [DESIGN.md](http://DESIGN.md) upload.
- Template placeholders.
- Optional logo upload.
- Skill selector.
- PRD `.md` attachment.
- Page-count selector.
- Project creation without any design reference.
- Existing project history.
- Existing design reference persistence.
- Existing frame retry/revision.
- Previously successful Studio projects.

These are regression requirements, not additional redesign tasks.

Do not rewrite their architecture unless a proven shared dependency requires a small correction.

---

# 12. UI &amp; Component Restrictions

This is primarily an integration/backend hotfix.

Do not redesign the Studio landing page, Design Picker, or composer.

If a UI change is genuinely required, inspect existing primitives first.

Explore appropriate ready-made components from:

- shadcn/ui
- HeroUI
- Magic UI
- React Bits
- Thinking Orbs

Reuse suitable existing components rather than creating standard UI from scratch.

No:

- Generic sparkle icons.
- Purple AI gradients.
- Unnecessary modal redesign.
- Extra technical badges.
- Debug information displayed publicly.
- Giant error banners.
- New UI elements unrelated to the root cause.
- Arbitrary layout changes.

Read and follow the repository's anti-AI-slop and layout-consistency rules.

**A backend integration problem should not become an excuse for an unrelated UI redesign.**

---

# 13. Required Test Scenarios

Implement focused automated integration tests.

## A. VibeScrape source

- Completed scrape with valid [DESIGN.md](http://DESIGN.md).
- Scrape with no [DESIGN.md](http://DESIGN.md).
- Scrape still generating.
- Deleted scrape.
- Scrape owned by another user.
- Legacy valid [DESIGN.md](http://DESIGN.md).
- Current canonical [DESIGN.md](http://DESIGN.md).
- Invalid colors.
- Missing optional tokens.
- Document exceeding supported limits.

## B. Selection and project creation

- VibeScrape reference ID submitted correctly.
- Resolver fetches the expected stored document.
- Valid document creates a Studio project and initial job.
- Invalid document returns a safe, specific error.
- No duplicate project from repeated submission.
- Reference metadata persists correctly.
- Reopening the project retains reference context.

## C. Skill combinations

- No Skill.
- Impeccable.
- Frontend Design.
- UI UX Pro Max.
- Anti-Slop.
- Taste.

Verify the combination does not trigger an unexpected server exception.

## D. Generation context

- Planning receives the actual resolved [DESIGN.md](http://DESIGN.md).
- Blueprint uses available reference tokens.
- Per-frame generation receives the same design system.
- Selected skill does not replace explicit reference tokens.
- Existing project revision preserves relevant reference context.

## E. Regression

- Built-in themes still work.
- Manual custom [DESIGN.md](http://DESIGN.md) still works.
- No-reference generation still works.
- PRD `.md` attachment behavior is preserved.
- Existing projects remain accessible.

Use deterministic mocks/fixtures for provider behavior.

If real database integration tests are supported, use isolated test data with proper cleanup.

Do not depend on another user's production data.

---

# 14. NO BROWSER QA

Browser QA is explicitly excluded.

Do not perform:

- Manual localhost browser testing.
- Chrome DevTools QA.
- Playwright E2E navigation.
- Screenshot comparison.
- Browser automation.
- Visual browser walkthroughs.

Use code-level tests, integration tests, API contract tests, typechecking, lint/check, and build.

Do not falsely claim the actual deployed browser flow was validated when only automated backend tests were executed.

---

# 15. Implementation Discipline

Recommended execution order:

1. Inspect completed Phase 3 changes.
2. Trace the VibeScrape reference contract.
3. Identify the exact failing boundary.
4. Reproduce the failure with realistic test fixtures.
5. Apply the smallest correct architectural fix.
6. Verify persistence and AI input propagation.
7. Verify compatibility with all six skill choices.
8. Run regression tests.
9. Inspect the final diff for unrelated changes.
10. Commit and push according to repository rules.

Avoid speculative refactors.

Do not introduce new dependencies without demonstrated need.

Do not weaken ownership checks, design validation, or output security.

Do not use `as any`, `@ts-ignore`, or equivalent type-safety bypasses.

---

# 16. Definition of Done

- Completed Phase 3 implementation has been reviewed.
- Actual VibeScrape → Studio failing boundary identified.
- Valid stored VibeScrape [DESIGN.md](http://DESIGN.md) can be selected and submitted.
- Server fetches the correct saved [DESIGN.md](http://DESIGN.md).
- Ownership verification remains correct.
- Producer and consumer [DESIGN.md](http://DESIGN.md) formats are compatible.
- Valid documents are not rejected by incorrect token parsing.
- Invalid documents produce actionable errors.
- Valid reference allows successful project/job creation.
- Reference remains associated with the created project.
- No Skill works with the reference.
- Impeccable works with the reference.
- Other supported design skills also work.
- AI planning receives the resolved reference.
- Shared Blueprint reflects the selected design system.
- Generated frames preserve applicable reference styling.
- Manual upload and built-in themes remain functional.
- No unrelated frontend redesign.
- No browser QA.
- Relevant tests, typecheck, lint/check, and build pass or blockers are disclosed.
- Changes follow atomic-commit rules and are pushed to the current feature branch when permitted.

---

# 17. Final Report — Bahasa Indonesia

Provide an evidence-based report containing:

**A. Root Cause**

Explain precisely which operation caused the VibeScrape reference submission to fail.

**B. Existing Phase 3 Work**

Identify what was already implemented and what this hotfix corrected.

**C. Changes**

List affected files and the reason for each modification.

**D. Compatibility**

Report verified behavior for:

- VibeScrape + No Skill.
- VibeScrape + Impeccable.
- VibeScrape + other supported skills.

**E. AI Application**

Explain how the saved [DESIGN.md](http://DESIGN.md) influences planning, blueprint, and generated screens.

**F. Verification**

Include exact tests and their real pass/fail results.

Clearly distinguish mocked tests from live provider verification.

**G. Git Handoff**

Report commit hashes, push status, and remaining limitations.

**Browser QA: Not executed — explicitly excluded by the user.**

## FINAL DIRECTIVE

**DO NOT fix the manual [DESIGN.md](http://DESIGN.md) upload flow when the actual reported bug is the stored VibeScrape [DESIGN.md](http://DESIGN.md) integration.**

**DO NOT redo the entire Phase 3 implementation.**

**DO NOT mark this task complete merely because the composer displays "Referensi aktif".**

The required outcome is:

**A real [DESIGN.md](http://DESIGN.md) previously generated by VibeScrape can be selected in VibeDesign Studio, submitted together with a user prompt and an optional design skill, successfully persisted, and genuinely used by the AI generation pipeline.**

Implement the fix, verify it through permitted tests, and provide an accurate handoff.