# everythings-vibe — AGENTS.md

> **Status: MANDATORY EXECUTION CONTRACT**
>
> Repository-wide execution contract for AI/coding agents working on **everythings-vibe**.
> Read this file first, then route to the detailed authoritative rules in `.agents/rules/`.

---

## 1. Core Philosophy (Measure Twice, Cut Once)

- **Simple systems, software that feels obvious:** Do not preserve complexity just because it exists. Do not introduce machinery because it looks architecturally impressive.
- **YAGNI & Scope control:** Understand the real constraint, then write the smallest correct code that makes the behavior unsurprising. Fight scope creep.
- **Good defaults, developer's intent wins:** Think of these instructions as high-quality defaults. The developer's explicit preferences in chat override anything here.
- **Restrained developer-grade aesthetic:** Content-first, clean UI without AI slop, decorative gradients, or filler prose (`anti-ai-slop.md`).

---

## 2. Rule Router (Wajib Baca & Terapkan Rules)

The agent **MUST** read and strictly apply the authoritative rule files in `.agents/rules/` to actual EOF before executing relevant work:

### Always read before starting work:
- `.agents/rules/basic-rules.md` — Core invariants, codebase map, god-tier bar
- `.agents/rules/architecture-folder-structure.md` — Feature colocation (`src/features/`), thin routes, max 400 lines/file
- `.agents/rules/no-assumptions.md` — Verify evidence before assuming; no hallucinated files or APIs
- `.agents/rules/skills-mcp.md` — Single source of truth for skills & MCP gates

### Read for code / test / DB / state modification:
- `.agents/rules/no-type-bypass.md` — Zero `as any`, `as never`, `@ts-ignore`; strict Drizzle & Zod types
- `.agents/rules/no-hardcode.md` — Configuration, secrets, models, and constants discipline
- `.agents/rules/atomic-commit.md` — Atomic commits per concern, clean tree, mandatory push

### Read for bugs, refactors, architecture, or scope decisions:
- `.agents/rules/anti-satisficing.md` — Root cause before patch; completeness over convenience

### Read for UI, layout, copy, or accessibility:
- `.agents/rules/anti-ai-slop.md` — Responsive layout, contrast, no generic AI styling

### Read for product/domain/workflow semantics:
- `.agents/rules/vibe-everythings-context.md` — Greenfield, Codebase sync, VibeScrape, Studio, Billing flows

> **Contract:** Reading a rule means operationalizing its constraints into your execution. Never claim a rule was followed without applying its concrete requirements.

---

## 3. Product Invariants (Non-Negotiables)

everythings-vibe must preserve at all times:
1. **Real Persisted Workflow:** Real signals and persisted DB state across all surfaces (Plan, Design, Codebase, Templates). Never fake streaming, progress, or state.
2. **Atomic Credit & Tenant Isolation:** 1 credit = 1 generate (unlimited free revisions). Queries strictly enforce `WHERE user_id = ?`. Credit deductions must be atomic (`WHERE credits_used + :charge <= credits`).
3. **100% Strict Type Safety:** Zero type bypasses (`as any`, `as never`, `@ts-ignore`). Inferred types over annotations.
4. **Feature-Driven Modularity:** Colocate domain code in `src/features/<feature-name>/`. Hard ceiling of $\le$ 400 lines per file (deconstruct if approaching 350 lines). Thin routes in `src/routes/` ($\le$ 150 lines).
5. **Zero Dead Code:** No orphan files, obsolete spikes, or unused dependencies.

---

## 4. Verifying: Surgical, Fast, and Lean (T3-Code Style)

The biggest failure mode for agents in this repo is running repetitive, slow, repo-wide shell commands. Follow this surgical protocol:

- **Smallest proof that the change works:**
  - Format & quick lint: `pnpm biome check <file-path>` (< 1 second).
  - Targeted unit tests: Run ONLY the affected test file:
    ```bash
    pnpm vitest run src/features/<feature>/tests/<specific>.test.ts
    ```
- **DO NOT RUN REPO-WIDE CHECKS DURING DEVELOPMENT:**
  - **FORBIDDEN** to run full `pnpm test`, blind `pnpm check`, or full `pnpm build` after every minor edit.
  - Full repo-wide verification belongs **only at the final pre-push gate** (or CI), never in the inner dev loop.
- **Think before typing, not trial-and-error in terminal:**
  - Read interfaces, types, and schemas first. Write code that compiles on the first attempt.
  - Do NOT use the terminal as a guessing tool or loop through repeated test failures without reading root causes.
- **Test meaningful logic, not UI styling:**
  - Unit and TDD tests MUST NOT assert CSS classnames, Tailwind utility lists, HTML tag structures, or generated AI markdown prose.
- **No browser QA without explicit permission:**
  - Never launch headless Playwright browsers, DevTools QA, or computer use unless the user explicitly requests live browser testing.

---

## 5. Execution & Handoff Workflow

1. **Understand & Check Rules:** Read the required rule files from Section 2 for the task at hand.
2. **Inspect Real Evidence:** Read actual files and callers before changing code (`no-assumptions.md`).
3. **Implement Surgically:** Keep changes minimal, modular, and type-safe.
4. **Surgical Verification:** Run targeted test/biome on the changed files only.
5. **Final Gate (Pre-push only):**
   - Check git status and diff.
   - Run affected typecheck / linter if needed.
   - Atomic commit with conventional commit message (`feat:`, `fix:`, `refactor:`).
   - Push to upstream remote.
   - Verify working tree is clean.