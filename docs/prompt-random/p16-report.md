# TASK 16: Final integration audit report

Scope: the `random` branch after merging `origin/main` (universal credit work) into the p16 tree.
Evidence below is from this session on the repository state at commit `9a39b5ce`.

## 1. What was actually broken

The merge of `origin/main` (562 staged files, 335 TypeScript files) left three regressions and one design flaw:

| ID | Symptom | Root cause | Fix |
| --- | --- | --- | --- |
| M-1 | 13 failures in `studio-chat-workspace.test.tsx`: `No QueryClient set` | merged workspace mounts credit surfaces that read react-query; the spec rendered without a provider | local `render` shadows the base render and wraps every render/rerender in `QueryClientProvider` |
| M-2 | `studio-service.test.ts`: `turns.filter is not a function` | conversation sync awaits `.orderBy()` directly; the mock only implemented `.orderBy().limit()` | `orderBy` mock is a thenable array builder, resolving `[]` and still exposing `.limit()`/`.for()` |
| M-3 | `studio-detail.test.tsx`: `JSON.parse(undefined)` | spec waited for the first fetch, but submit now posts after an async preflight | spec waits for a `POST` call, then reads the body |
| D-1 | submit could stall behind a second round trip | composer ran a `loadStudioQuote` preflight before posting; a slow quote held the draft | preflight removed; `use-studio-composer-request` maps the endpoint's authoritative code (`INSUFFICIENT_CREDITS`, `TRIAL_EXHAUSTED`, `PRODUCT_PLAN_REQUIRED`) to `creditState`, and the workspace opens the modal or routes to `/pricing` |
| C-1 | `Progress task · x/y selesai` used a middle dot | decorative separator in developer-authored UI copy | comma: `Progress task, x/y selesai` (source plus three specs) |

New regression spec: `src/features/studio/tests/studio-credit-refusal.test.tsx` proves a `402 INSUFFICIENT_CREDITS` opens the credit modal and a `PRODUCT_PLAN_REQUIRED` routes to `/pricing`.

## 2. Test results

| Run | Result |
| --- | --- |
| All specs touched by the merge (90 files) | 830 passed, 23 skipped, 0 failed |
| `studio-chat-workspace`, `studio-detail`, `studio-service`, `studio-planning.integration` | 41 passed |
| `studio-credit-refusal` (new) | 2 passed |
| `workspace-header`, `workspace-task-progress` | 19 passed |
| `pnpm exec tsc --noEmit` | clean |

The whole-repository suite was not completed in this pass; the numbers above are the merge-affected set plus every spec touched by the fixes.

## 3. Runtime smoke on port 3000

| Check | Result |
| --- | --- |
| `pnpm dev` ready | 10.4 s (cold, dependency re-optimization after the lockfile change) |
| First HTML `GET /` | 60.6 s cold, 57 ms warm |
| `GET /pricing` | 200, 268 ms cold / 79 ms warm |
| `GET /login` | 200, 64 ms |
| `GET /admin` | 307, auth guard redirect |

Startup is dominated by the first SSR module evaluation on Windows, matching the baseline recorded in `docs/dev-startup-benchmark.md` (56 s cold). No further improvement was attempted because the merge moved the tree, not the startup path.

## 4. Feature evidence

| Concern | Evidence |
| --- | --- |
| Universal credit ledger | `drizzle/0050_universal_credit_ledger.sql` and follow-ups `0051`-`0054` |
| Product trials | `src/features/billing/services/product-trials.server.ts`, settlement service |
| Badge system | `src/components/ui/{badge,status-indicator,status-badge,numeric-badge}.tsx` with `badge-system.test.tsx` |
| Punctuation rule | source sweep for `—`, `•`, `·` in UI props found one violation, fixed |

## 5. Limits

- Authenticated browser QA (studio canvas, billing flows, admin dashboard) was not run in this session: no test account credentials were available, and the Chrome DevTools session belongs to another agent.
- `pnpm biome check src drizzle` still reports the 10 pre-existing `noImportantStyles` diagnostics in `src/app/globals.css`; they exist on `origin/main` unchanged and the autofill overrides need `!important`.
- The npm publication of `@ghazynabiel/everythings-vibe` remains blocked on owner credentials, documented in `TODO.md`.