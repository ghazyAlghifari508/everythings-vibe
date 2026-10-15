# basic-rules.md

Boot instructions for AI agents working on **everythings-vibe**.

## Read first

- `AGENTS.md` -> repository-wide product, architecture, phase, and safety rules
- `.agents/rules/vibe-everythings-context.md` -> comprehensive product definition, multi-surface architecture, flows, and schema
- `.agents/rules/architecture-folder-structure.md` -> feature-driven colocation, thin routes, anti-monster file limits, and zero dead code
- `.agents/rules/no-assumptions.md` -> strict fact verification and zero assumptions
- `.agents/rules/atomic-commit.md` -> atomic commits per logical change and mandatory git push before handoff
- `.agents/rules/no-hardcode.md` -> configuration, provider, and constants discipline
- `.agents/rules/no-type-bypass.md` -> strict type safety (`as never`, `as any`, and `@ts-ignore` are forbidden)
- `.agents/rules/anti-ai-slop.md` -> design constraints and UI standards
- `.agents/rules/anti-satisficing.md` -> completeness, quality, and verification discipline; never stop at the first acceptable implementation
- `docs/` and `TODO.md` -> behavior, scope, acceptance, test plan, and architecture specs

If documents disagree, use the most specific approved requirement and document the decision before changing code. Once implementation exists, actual source, package manifests, migrations, and runtime configuration are evidence of current behavior.

---

## What makes everythings-vibe special

**everythings-vibe** is an all-in-one AI vibe-coding and creation ecosystem that turns raw concepts, existing codebases, and visual references into production-ready implementation plans, interactive design prototypes, and actionable agent rules. Four non-negotiables:

1. **Multi-surface Vibe Ecosystem:**
   - **VibePlan (Greenfield):** Interactive question flow, feature tree map, 8-section PRD, structured acceptance criteria (AC), task whiteboard canvas, and interactive Kanban boards.
   - **VibePlan (Existing Codebase):** Local repository synchronization via CLI (`packages/cli`), AST/dependency analysis, and context-aware planning directly on top of existing code.
   - **VibeScrape:** Web scraping of public website UI, Playwright headless crawling, stylesheet/asset extraction, and design token compilation into `DESIGN.md`.
   - **VibeDesign (Studio):** Interactive HTML/Tailwind prototyping studio with live canvas preview, multi-screen frame inspection, design skill selection, and versioned AI visual synthesis.
   - **VibeTemplate:** Catalog of prompt blueprints and starter boilerplates for planning and design.
2. **Real generation pipeline:** Question flow, PRD streaming, AC generation, task breakdowns, and studio synthesis must come from real system signals, proper SSE streams, and persisted records. Never fake progress, typewriter deltas, or provider output.
3. **Safe, atomic credit and data flow:** 1 credit = 1 generate action (revisions and patch updates are free and unlimited). Credit burning must be atomic (`WHERE credits_used + :charge <= credits`). Database queries strictly enforce tenant isolation (`WHERE user_id = ?`).
4. **100% type-safe, modular, and robust:** Zero type-safety bypasses (`as never`, `as any`, `@ts-ignore`) are allowed. Strict Drizzle schema types, typed server routes, and Zod validation protect every trust boundary. Hard ceiling of $\le$ 400 lines per file to prevent monster files.
5. **Restrained developer-grade aesthetic:** Clean, high-utility, content-first interface without cheap AI slop (no unnecessary gradients, glow effects, or decorative filler copy).

---

## Rules — god-tier

- **THE UNBREAKABLE BAR (NEVER LOWER THE TEST STANDARD):** When a test fails,
  fix the production code and elevate the logic. NEVER soften assertions (for
  example, replacing specific equality with loose `.toBeDefined()`), never delete
  or comment out valid boundary tests, and never write shallow pass-through tests
  just to get a cheap green check. If a test caught a break, fix the root cause.
- **NEVER TEST AI PROSE, RAW MEDIA CONTENT, CLASSNAMES, OR STOCHASTIC OUTPUT:**
  Unit and TDD tests MUST NOT assert generated copy, exact prompt responses,
  exact markdown wording, exact className strings, Tailwind utility lists, HTML tag
  structures, palette hues, fonts, layout structure, card counts, section
  sequences, or generated source snapshots. Tests assert deterministic mechanical
  invariants only:
  1. JSON Schemas and Zod validation;
  2. state-machine and structure conformance, data types, and required keys;
  3. type narrowing, ownership (`WHERE user_id = ?`), and contract error handling;
  4. hard deterministic boundaries such as step monotonic progression (`projects.step`),
     credit deduction, route topology, state transitions, output verification,
     security, compilation, and idempotency.
  Rendered aesthetic quality and copy appeal belong to human evaluation and live
  browser reviews.
- **Feature-driven colocation (Domain before file type):** Organize by feature domain
  (`src/features/greenfield`, `src/features/codebase`, `src/features/studio`,
  `src/features/billing`, `src/features/templates`). Follow
  `.agents/rules/architecture-folder-structure.md`. Never create generic catch-all
  directories such as `hooks/`, `utils/`, `helpers/`, or `misc/` without a documented
  cross-cutting boundary.
- **Anti-monster file ceiling (Max 300–400 lines):** Maintain strict modularity.
  Any file approaching 350 lines must be decomposed into sub-components, custom hooks,
  or dedicated service modules. Files $\ge$ 400 lines are strictly forbidden.
- **Thin routes & clean routing tree:** Files in `src/routes/` must remain thin
  ($\le$ 100–150 lines), serving solely as route declarations and loaders that render
  feature containers. Non-route helper files and unit tests prefixed with `-` must
  NOT reside in `src/routes/`—colocate tests in feature `tests/` directories.
- **Zero dead code & zero garbage:** Never leave orphan files, unreferenced exports,
  obsolete prototypes, mock fixtures, or unused packages in the repository.
- **Structured test suites:** Unit tests sit in feature `tests/` directories
  (`*.test.ts`, `*.test.tsx`), API/security tests at their API boundary, and end-to-end
  user journeys in `e2e/`. Follow the repository's actual Vitest and Playwright scripts.
- **No `any`, `as never`, or `@ts-ignore`:** `any` and `never` casting disables
  the type-checker. Use `unknown` with narrowing, Drizzle `$inferInsert` / `$inferSelect`,
  typed DTOs, or schema validation. Fix actual root causes.
- **Self-explanatory code over comments:** Code must be obvious through clear
  names and modular structure. Never write multi-line block comments or banner
  dividers (`// ---`). Authored comments delete by default; keep only strictly
  necessary single-line invariant explanations.
- **Solid as hell:** Nothing ships without typecheck, lint, format, affected
  tests, and required build checks passing together. Run the repository's `pnpm`
  verification commands locally before handoff.
- **Small and surgical:** One concern per change. A 50-line fix beats a 500-line
  refactor.
- **FAIL LOUD AND NEVER HIDE STATE:** Validate untrusted input at server
  boundaries and fail closed on auth, ownership, credit deduction, rate limiting,
  provider output, and state transition failures.
- **Always unslop:** Follow `.agents/rules/anti-ai-slop.md` across code, prompt
  strings, docs, and UI copy. Cut AI filler words, puffery, and passive voice.
- **Native tool calling only:** When executing actions or tools, always invoke the
  native tool calling schema provided by the platform. Never emit simulated XML,
  markdown, or pseudo-code tags such as `<skill>` or `<invoke>` into the message
  body instead of executing the tool directly.

---

## Where code lives

- `src/features/` — Feature-driven domain modules (high cohesion):
  - `greenfield/` — Ask flow, Feature tree map, PRD viewer/editor, AC, Task whiteboard, Kanban board
  - `codebase/` — CLI sync handling, codebase explorer, chat workspace, analysis engine
  - `studio/` — Interactive HTML/Tailwind studio, multi-screen canvas preview, design skill presets
  - `scrape/` — Web scraper engine, Playwright headless crawler, token extraction (`DESIGN.md`), asset ingestion
  - `templates/` — Blueprint prompt catalog and starter templates
  - `billing/` — Midtrans payment integration, credit balance, atomic ledger, invoices
  - `auth-settings/` — Better Auth flows, user profile, account settings, API keys, notifications
  - `admin/` — Admin metrics dashboard, user management, project triage
- `src/routes/` — Thin TanStack Router file-based UI routes and server API route handlers (`/api/*`, `/api/v1/*`)
- `src/components/ui/` — Base design system primitives (shadcn / Radix) without domain logic
- `src/db/` — Drizzle ORM schema (`schema.ts`), PostgreSQL connection client, and migrations
- `src/lib/` — Shared infrastructure (Auth session, base constants, rate-limiting, credit policy, model gateway)
- `src/store/` — Zustand in-memory state stores (`useAuthStore`, `useChatStore`, `useUIStore`)
- `src/types/` — Shared global domain types (`database.ts`)
- `packages/cli/` — Companion CLI tool (`everythings-vibe`) for terminal-based codebase sync and task management
- `e2e/` — Playwright end-to-end test suites
- `docs/` — Specifications, architecture, plans, and technical documentation

This is target organization, not permission to assume these paths already exist.
Map the actual repository before modifying it.

---

## Commands

```bash
pnpm install --frozen-lockfile
pnpm dev
pnpm lint
pnpm format
pnpm check
pnpm exec tsc --noEmit
pnpm test
pnpm build
```

Run exact scripts from `package.json` once it exists. `pnpm dev` is a long-lived
managed service. Migration, browser smoke, provider sandbox, and test verification
commands must be read from package manifests and active documentation rather than invented.
