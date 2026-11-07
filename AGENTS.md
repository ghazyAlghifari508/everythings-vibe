# everythings-vibe

everythings-vibe is an all-in-one AI vibe-coding and creation ecosystem that turns raw concepts, existing codebases, and visual references into production-ready implementation plans, interactive design prototypes, and actionable agent rules. A TanStack Start (SSR) + React 19 full-stack framework with Vite, PostgreSQL/Drizzle ORM, Better Auth, and Vercel AI SDK.

You can think of everythings-vibe as an open, high-leverage workspace combining VibePlan, VibeDesign, VibeScrape, Existing Codebase sync, and VibeTemplate.

---

## 📌 Fast Skill Router (On-Demand Knowledge)

Instead of overloading context with thousands of passive rule lines, detailed operational standards are encapsulated into specialized skills. The agent **MUST** invoke and read the relevant skill when executing matching work:

| Surface / Concern | Trigger / Kapan Dipanggil | Skill Target |
| :--- | :--- | :--- |
| **UI / Styling / Layout** | Saat mendesain, membuat, atau me-refactor komponen UI, Tailwind styling, tipografi `<PageHeading>`, ikon Hugeicons, atau tata letak keluarga halaman (*page family*). | `skill://vibe-ui-craft` |
| **Logic / Debug / Refactor** | Saat menganalisis kode, menelusuri bug rumit (*root cause*), mencegah *satisficing*, memvalidasi tipe data ketat, merancang indikator sinyal riil, atau protokol monorepo (*Rule 5A*). | `skill://vibe-deep-engineering` |
| **Domain / Workflows / DB** | Saat menyentuh alur Greenfield, Codebase sync via CLI, VibeScrape Playwright, Studio prototyping, skema database Drizzle, atau siklus kredit/billing Midtrans. | `skill://vibe-domain-context` |
| **Library / SDK APIs** | Sebelum menggunakan pustaka eksternal (TanStack Start/Router, Better Auth, Drizzle, AI SDK, Midtrans, Radix UI). | `skill://context7-mcp` |
| **UI Component Reuse** | Sebelum membuat komponen baru (tabel, modal, tabs, form, dropdown, chart). | `skill://shadcn-component-discovery` |

---

## ⚡ Core Invariants (Always Active Across All Turns)

The following non-negotiable rules apply unconditionally from turn 1 of every session:

### 1. The Unbreakable Bar for Testing
- **Never lower the test standard:** When a test fails, fix the production code. **NEVER** soften assertions (e.g. replacing strict `.toBe(x)` with loose `.toBeDefined()`), never delete or comment out valid failing boundary tests, and never write shallow pass-through tests just to get a cheap green check.
- **Never test stochastic AI text, raw media, or CSS classnames:** Unit/TDD tests **MUST NOT** assert generated AI copy, exact prompt responses, markdown wording, Tailwind utility lists (`className`), HTML tag structures, or visual layout snapshots.
- **Assert deterministic mechanical invariants only:**
  1. JSON Schemas & Zod validation.
  2. State-machine transitions, step progression (`projects.step`), and data types.
  3. Tenant ownership (`WHERE user_id = ?`) and contract error handling.
  4. Hard deterministic boundaries: atomic credit burn math (`WHERE credits_used + :charge <= credits`), route topology, webhook idempotency, and compilation.

### 2. Strict Type Safety: Zero Type Bypass
- **Strictly Forbidden:** `as never`, `as any`, `as unknown as any`, `@ts-ignore`, `@ts-expect-error`, broad `as unknown as Record<string, unknown>`, and `(values({...}) as never)`.
- Use Drizzle inference (`$inferInsert` / `$inferSelect`), `$type<T>()` for JSON schema columns, project-owned typed `AppError`, and runtime Zod parsing for unknown payloads (AI streams, webhooks, SSE).
- Unavoidable SDK boundary cast requires `// cast boundary: <reason>` and single-level narrow typing.

### 3. Architecture, Feature Colocation & Monster File Ceiling
- **Feature-Driven Colocation:** Group code by domain in `src/features/<domain>/` (`components/`, `hooks/`, `services/`, `types/`, `tests/`). Never drop domain-specific code into root `src/components/` or `src/lib/`.
- **Anti-Monster File Ceiling:** Ideal $\le$ 200–300 lines. **Hard ceiling of $\le$ 400 lines per file.** Files approaching 350 lines must be proactively decomposed into hooks, sub-components, or services.
- **Thin Routes:** Files in `src/routes/` must remain thin ($\le$ 100–150 lines), serving solely as route declarations and loaders that render feature containers. **No test files (`-*.test.tsx`) in `src/routes/`**; colocate tests in feature `tests/`.
- **Zero Dead Code:** Clean orphan files, unreferenced exports, obsolete prototypes, and unused packages (`pnpm remove`).

### 4. Safe, Atomic Credit & Tenant Isolation
- **Tenant Isolation without RLS:** PostgreSQL does not use RLS. **EVERY query and mutation MUST enforce `WHERE user_id = ?`**.
- **Atomic Credit Deduction:** Pemotongan saldo kredit wajib atomik: `WHERE credits_used + :charge <= credits`.
- 1 credit = 1 generate action. Revisions via section patch protocol (`:::UPDATE_SECTION[Name]:::`) are always unlimited and **FREE**.

### 5. Atomic Commits & Mandatory Push
- **One Logical Concern = One Atomic Commit:** Commit incrementally per layer (Schema $\rightarrow$ Logic $\rightarrow$ Tests $\rightarrow$ UI). Never hoard changes into lazy megacommits.
- **Conventional Commits:** `feat(scope):`, `fix(scope):`, `refactor(scope):`, `test(scope):`, `chore(scope):`.
- **Mandatory Push Before Handoff:** Every session MUST conclude with `git push origin <branch>` and a clean working tree.

### 6. Epistemics, Monorepo Roots & Anti-Hallucination
- **Verify with tools first:** Never guess file contents or APIs from memory.
- **Absence Claims Protocol (Rule 5A):** Never claim *"X does not exist / CLI tidak ada"* after 1–2 failed searches. Map workspace roots (`packages/cli`), glob each root, grep repo-wide, and use coverage phrasing (*"Not found in [paths]"*).
- **Honest Indicators:** Indicators must be wired to real signals (SSE events, measurable transitions). Never fabricate progress bars, fake timer step sequences, or simulated typing. If no stream exists, display one honest static label.
- **Language:** Explain to user in **Bahasa Indonesia**; keep code, identifiers, commits, and technical terms in **English**.

---

## 🛠️ Verification & Development Commands

- `pnpm dev` — Start TanStack Start dev server on port 3000.
- `pnpm dev:all` — Start web server plus background scraper & durable codebase workers.
- **Targeted verification on touched files only:**
  - Lint & format check: `pnpm biome check <path-to-file>` (< 1 second).
  - Targeted unit test: `pnpm vitest run <path/to/specific.test.ts>`.
  - Typecheck: `pnpm exec tsc --noEmit`.
- **NO REPO-WIDE CHECKS DURING DEVELOPMENT:** No blind `pnpm test` or full `pnpm build` after every minor edit. Focus on files you touched.
- **No browser QA without permission:** Never launch headless Playwright or DevTools QA unless explicitly requested.

---

## 🗺️ Codebase Map

- `src/features/` — Domain modules:
  - `greenfield/` — Ask flow, Feature tree map, PRD viewer/editor, AC, Task whiteboard, Kanban board
  - `codebase/` — CLI sync handling, codebase explorer, chat workspace, analysis engine
  - `studio/` — Interactive HTML/Tailwind studio, multi-screen canvas preview, design skill presets
  - `scrape/` — Web scraper engine, Playwright headless crawler, token extraction (`DESIGN.md`)
  - `templates/` — Blueprint prompt catalog and starter templates
  - `billing/` — Midtrans payment integration, credit balance, atomic ledger, invoices
  - `auth-settings/` — Better Auth flows, user profile, account settings, API keys
  - `admin/` — Admin metrics dashboard, user management, project triage
- `src/routes/` — Thin TanStack Router file-based UI routes and API route handlers ($\le$ 150 lines).
- `src/components/ui/` — Base design system primitives (shadcn / Radix / Hugeicons) without domain logic.
- `src/db/` — Drizzle ORM schema (`schema.ts`), PostgreSQL connection client, and migrations.
- `src/lib/` — Shared infrastructure (Auth session, base constants, model gateway).
- `packages/cli/` — Companion CLI tool (`@ghazynabiel/everythings-vibe`) for terminal-based codebase sync.
- `e2e/` — Playwright end-to-end test suites.
- `docs/` — Specifications, architecture, and technical documentation.
