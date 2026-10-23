# everythings-vibe

everythings-vibe is an all-in-one AI vibe-coding and creation ecosystem that turns raw concepts, existing codebases, and visual references into production-ready implementation plans, interactive design prototypes, and actionable agent rules. A TanStack Start (SSR) + React 19 full-stack framework with Vite, PostgreSQL/Drizzle ORM, Better Auth, and Vercel AI SDK.

You can think of everythings-vibe as an open, high-leverage workspace combining VibePlan, VibeDesign, VibeScrape, Existing Codebase sync, and VibeTemplate.

---

## 📌 Rule Router (Wajib Baca & Terapkan Rules)

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
- `.agents/rules/design-layout-consistency.md` — Page family classification, layout contracts, container strategies, breadcrumb rules, Hugeicons contract
- `.agents/rules/anti-ai-slop.md` — Responsive layout, contrast, no generic AI styling, anti-functional-slop & UI necessity contract

### Read for product/domain/workflow semantics:
- `.agents/rules/vibe-everythings-context.md` — Greenfield, Codebase sync, VibeScrape, Studio, Billing flows

> **Contract:** Reading a rule means operationalizing its constraints into your execution. Never claim a rule was followed without applying its concrete requirements.

---

## What makes everythings-vibe special?

It's important we maintain the things that make this platform reliable as we iterate. Here's a brief list of the things we can never compromise on:

### 1. Real persisted workflow
Real signals and persisted DB state across all surfaces (Plan, Design, Codebase, Templates). Never fake streaming, reasoning typewriter deltas, progress, or state.

### 2. Performance and taste without compromise
Lots of AI apps have gotten bogged down with bad tech decisions and "slop". We have not. Content-first, clean UI without visual slop, functional slop (redundant controls/toolbars), decorative gradients, neon glow, or filler prose (`anti-ai-slop.md`).

### 3. Safe, atomic credit and tenant isolation
1 credit = 1 generate action (unlimited free revisions and patches). Database queries strictly enforce tenant isolation (`WHERE user_id = ?`). Credit deductions must be atomic (`WHERE credits_used + :charge <= credits`).

### 4. Multi-surface ecosystem
everythings-vibe has key app surfaces:
- **VibePlan (Greenfield):** Interactive question flow, feature tree map, 8-section PRD, structured AC, task whiteboard canvas, and interactive Kanban boards.
- **VibePlan (Existing Codebase):** Local repository synchronization via companion CLI (`packages/cli`), AST/dependency analysis, and context-aware planning.
- **VibeScrape:** Web scraping of public UI, Playwright headless crawling, asset extraction, and design token compilation into `DESIGN.md`.
- **VibeDesign (Studio):** Interactive HTML/Tailwind prototyping studio with live canvas preview, multi-screen frame inspection, and versioned visual synthesis.
- **VibeTemplate & Billing:** Blueprint prompt catalog, starter boilerplates, and Midtrans payment integration.

---

## A note from the developer

I like ambitious ideas, simple systems, and software that feels obvious. Do not preserve complexity just because it already exists. Do not introduce machinery because it looks architecturally impressive. Understand the real constraint, then fight for the smallest model that makes the correct behavior unsurprising.

Channel both "measure twice, cut once" and "yagni". Fight scope creep. Try to honor the dev's intent in both a minimal and realistic fashion.

The rest of this document is meant to help you navigate the codebase and make changes effectively. Think of these instructions less as "hard rules", more as "good defaults". The developer's preferences should be able to override anything here.

---

## A small glossary

We need to be on the same page with terminology. When communicating, use this language:

- **you** means the agent reading this file and changing everythings-vibe.
- **we, us, and maintainers** mean the developers building everythings-vibe. These are who you are talking to now.
- **user** means the person using everythings-vibe to plan, design, or scaffold software.
- **agent** means the coding agent working inside this environment.
- **surface** means one of the primary domains: VibePlan (Greenfield or Codebase), VibeDesign Studio, VibeScrape, Templates, Billing, Settings.
- **project** means a user's plan or codebase record in the database.
- **turn** means one user-to-agent prompt cycle.

---

## The three ways to hurt yourself

1. **Killing by pattern.** Never `pkill -f`, `pgrep | kill`, or `kill` a PID you found by matching a name or path string. Kill only a PID you captured at spawn, or the owner of your port from `Get-NetTCPConnection` / `lsof` after confirming the process is your dev server.
2. **Writing to the live database carelessly.** Never run destructive migrations (`db:push --force`, dropping tables) against real development data without explicit confirmation. Keep queries scoped with `WHERE user_id = ?`.
3. **Bypassing strict type safety.** Never use `as any`, `as never`, or `@ts-ignore` to silence the TypeScript compiler. If types mismatch, fix the underlying schema, DTO, or narrowing logic (`no-type-bypass.md`).

---

## Hit every surface

The most common defect in this repo is a change that works on the path you tested and is missing everywhere else. Before calling work done, walk this list and say which entries applied:

- **Entry points.** A behavior reachable from Greenfield is often also needed in Existing Codebase, the dashboard history card, or the command palette. Fixing one is not fixing the feature.
- **Surfaces.** VibePlan, VibeDesign Studio, VibeScrape, and Codebase sync have their own state lifecycles. Ensure shared primitives don't break other surfaces.
- **Contracts.** Anything crossing server/client boundaries is typed with Zod schemas. Change the schema and the server handler, loader, and client hook all follow.
- **Reverse states.** If you added a way in, add the way out and the way to see it. Cancel needs resume. Open needs close. Deduction needs failure rollback. A one-way door is a bug.
- **Docs.** Check whether the change makes existing guidance in `docs/` or `TODO.md` inaccurate.

---

## Dev servers

- `pnpm install` installs dependencies.
- `pnpm dev` starts the Vite / TanStack Start development server on port 3000 (`node --dns-result-order=ipv4first node_modules/vite/bin/vite.js dev --port 3000`).
- `pnpm dev:all` starts both the web development server and the background scraping worker process.
- Stop what you started, by the PID you tracked. See rule 1.

---

## Verifying

- **Smallest proof that the change works.** Run targeted checks on the files you touched:
  - Quick format & lint: `pnpm biome check <path-to-file>` (< 1 second).
  - Targeted unit tests: `pnpm vitest run <path/to/specific.test.ts>`.
- **Test meaningful logic or observable behavior.** Do not render components to static markup to assert props or attributes, or add tests that merely assert callback wiring, Tailwind utility lists, CSS classnames, or generated AI markdown prose.
- **DO NOT RUN REPO-WIDE CHECKS DURING DEVELOPMENT.** No blind `pnpm test`, no repo-wide `pnpm check`, no full `pnpm build` after every minor edit unless explicitly requested. CI owns the full suite, and full checks belong only at the final pre-push gate.
- **Backend behavior changes ship with focused tests for that behavior.**
- **Think before typing, not trial-and-error in terminal.** Read interfaces, types, and schemas first. Write code that compiles on the first attempt instead of guessing in terminal loops.
- **No browser QA without explicit permission.** Never launch headless Playwright browsers, DevTools QA, or computer use unless the user explicitly agrees or requests it.

---

## Pull requests and commits

- Atomic commits per logical concern with conventional commit messages: `feat:`, `fix:`, `refactor:`, `docs:`.
- Body: the problem in a sentence or two, then how you fixed it.
- Never commit scratch files, temporary test logs, or credentials.
- Push to upstream remote before handoff and verify the working tree is clean.

---

## Documentation

Most code changes do not need an internal documentation change. Agents can read the code.

- `docs/` is for architectural decisions, domain specs, and implementation traps that are hard to discover from the source. Before adding documentation, ask what a maintainer would get wrong without it. If reading the relevant code answers the question, leave it out.
- Do not document every feature, enumerate fields, narrate control flow, or append long summaries. Types, tests, and code already record the implementation.
- Keep comments saying **WHY**, not what: a constraint, an external quirk, or an invariant the code can't show. Don't restate names or signatures.

---

## Plans and work artifacts

- Do not commit implementation plans, research notes, or agent scratch files to the repository.
- A merged commit/PR is the implementation record.

---

## Where code lives

- `src/features/` — Domain-driven feature modules (high cohesion):
  - `greenfield/` — Ask flow, Feature tree map, PRD viewer/editor, AC, Task whiteboard, Kanban board
  - `codebase/` — CLI sync handling, codebase explorer, chat workspace, analysis engine
  - `studio/` — Interactive HTML/Tailwind studio, multi-screen canvas preview, design skill presets
  - `scrape/` — Web scraper engine, Playwright headless crawler, token extraction (`DESIGN.md`)
  - `templates/` — Blueprint prompt catalog and starter templates
  - `billing/` — Midtrans payment integration, credit balance, atomic ledger, invoices
  - `auth-settings/` — Better Auth flows, user profile, account settings, API keys
  - `admin/` — Admin metrics dashboard, user management, project triage
- `src/routes/` — Thin TanStack Router file-based UI routes and API route handlers ($\le$ 100–150 lines).
- `src/components/ui/` — Base design system primitives (shadcn / Radix) without domain logic.
- `src/db/` — Drizzle ORM schema (`schema.ts`), PostgreSQL connection client, and migrations.
- `src/lib/` — Shared infrastructure (Auth session, base constants, model gateway).
- `packages/cli/` — Companion CLI tool (`@ghazynabiel/everythings-vibe`) for terminal-based codebase sync.
- `e2e/` — Playwright end-to-end test suites.
- `docs/` — Specifications, architecture, and technical documentation.

---

## Taste

- **Modular and clean:** Maintain strict modularity. Any file approaching 350 lines must be decomposed into sub-components, custom hooks, or services. Hard ceiling of $\le$ 400 lines per file.
- **Thin routes:** Files in `src/routes/` serve solely as route declarations and loaders that render feature containers.
- **Inferred types over annotations:** `any` is the enemy. Zero type bypasses.
- **Comments say why:** A constraint, an external quirk, or an invariant the code can't show. Don't restate names or signatures.
- **Zero dead code:** No orphan files, obsolete spikes, or unused dependencies.
- **If a rule here fights the task in front of you, say so loudly and get human sign-off before breaking it.**

---

## Additional tips

- Don't verify with browsers or computer use unless the user explicitly agrees or requests it.
- Security is important, but should not be over-indexed on for local dev mode / maintainer-only features.