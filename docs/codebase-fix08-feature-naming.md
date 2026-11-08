# FIX 08: Meaningful, Stable Indonesian Feature Titles for VibePlan Existing Codebase

Scope: how a feature plan inside a synced repository gets its **name** — at
creation, and afterwards. The planning pipeline itself (questions, feature
specification, PRD, AC, tasks), the artifact surfaces, and the Greenfield
product-naming behavior are unchanged.

## 1. Root cause

| Defect | Evidence in the code before the fix |
| --- | --- |
| Feature names were "product" names derived from the prompt **tail** | `feature-project-route.server.ts` (POST `/api/codebases/$codebaseId/features`) and `project-create.server.ts` (repository-first / repository-sync creation) both called `deriveProjectNameSync(prompt)` |
| That fallback keeps the last meaningful words | `prd-naming.ts` → `deriveNameFromFallback`: `const tail = words.slice(-4)` after dropping fillers |
| A long Indonesian request therefore yielded its final filler clause | "…serta mencari judul proyek melalui kolom pencarian langsung. … demi kemudahan eksplorasi karya." → **"Demi Kemudahan Eksplorasi Karya"** |
| The name could change again after creation | `prd-chat-persist.server.ts` ran a cosmetic AI rename on every PRD `generate` turn (`if (mode !== "generate" \|\| !projectId) return; … update(projects).set({ name: better })`) — for existing-codebase features too, whose PRD generation goes through `/api/chat` (`workspace-generation-executor.server.ts`, `use-workspace-generation-actions.ts`) |

Changing `slice(-4)` to `slice(0, 4)` was explicitly rejected: the head of such a
prompt is equally unrelated ("Sediakan Fitur Interaktif Pada").

## 2. Naming strategy

New pure module `src/features/codebase/services/feature-naming.ts` (+ its data
table `feature-naming-terms.ts`). A title is **primary function + target
entity/context**, derived from the intent the user actually wrote:

1. **Explicit user naming wins verbatim.** A quoted name, `bernama X` /
   `named X`, or a CamelCase brand token is delegated to the shared single source
   of truth (`hasExplicitProductName` + `deriveProjectNameSync`), so the fix
   cannot regress the one case the old heuristic got right.
2. **Action nouns** — the prompt is matched on word boundaries against canonical
   concepts whose aliases collapse into one noun (`login` + `autentikasi` →
   `Autentikasi`, never both). Up to two, ordered by how often the request
   mentions them, ties by first mention. Two peers are joined with "dan"/"and";
   a repair intent is not a peer but a modifier, so it leads and is not joined
   ("perbaiki checkout" → `Perbaikan Pembayaran`, `Fix Mobile Navigation`).
3. **Target entities** — the entity named right after the first action forms the
   compound the request is about (`menyaring proyek` → Proyek, `status pesanan` →
   Status Pesanan); entities mentioned earlier are the context and follow as the
   qualifier (`halaman portofolio` → Portofolio). A compound keeps the word order
   of the language the prompt was written in, and an English compound rendered as
   an Indonesian title is reversed, because Indonesian puts the head noun first
   (`mobile navigation` → `Navigasi Mobile`).
4. **Fallback** — when no term is known: the first plain content words of the
   first clause (head, never tail), otherwise the neutral provisional label
   `Fitur Baru` / `New Feature`. A filler fragment can never become a title.

The title language follows the plan language (`normalizeLanguage`), so an
Indonesian plan gets Indonesian titles and an English plan English ones. Titles
are capped at 6 words / 40 characters, which matches the bound the explicit-name
path already used.

### Worked examples (unit-tested)

| User request | Title |
| --- | --- |
| The FIX 08 portfolio prompt | `Pencarian dan Filter Proyek Portofolio` |
| `Add a blog to a portfolio website` | `Blog Portfolio` |
| `Tambahkan blog ke website portofolio` | `Blog Portofolio` |
| `Fix mobile navigation responsiveness` | `Perbaikan Navigasi Mobile` |
| `Tambah login dan autentikasi pengguna` | `Autentikasi Pengguna` |
| `Tambahkan dashboard status pesanan` | `Dashboard Status Pesanan` |
| `Add filtering to a list of articles` (en) | `Filter Articles` |
| `Bikin fitur bernama "Smart Project Finder"` | `Smart Project Finder` |
| `Buat halaman admin untuk mengelola pengguna dan peran` | `Manajemen Pengguna` |
| `Perbaiki bug pada halaman checkout …` | `Perbaikan Pembayaran` |
| `Pengguna bisa menyimpan draft artikel …` | `Penyimpanan Artikel Pengguna` |

### Why no model call

The instruction requires evaluating an AI naming operation first, and forbids
silently adding a billable model call to name a feature. The title is therefore
derived synchronously from the user's own words: zero latency before the feature
appears in the dropdown, zero credit impact, and — because it is deterministic —
the same prompt always produces the same title, which is exactly what keeps the
feature identity stable while the user answers questions. The existing AI rename
of the `/api/chat` stream is **not** reused for features: it exists to improve a
Greenfield *product* name once, and applying it to a feature would reintroduce
title drift.

The other naming sources the brief asks about were evaluated and do not apply:

- The repository analysis describes the *codebase* (framework, modules, impact
  areas), not the requested feature, so it cannot name the plan.
- The feature specification (`/api/features/generate`) produces a `productName`
  **after** the plan is titled — the dropdown shows the title from creation
  onwards (Draft · Pertanyaan), so it arrives too late to be the source.
- A provisional label is refined once when the feature's own words finally exist
  (the answered questions in the compiled generation prompt), deterministically
  and without a model call.

Two distinct features created from the same words intentionally share a title:
identity is the project id (the client's `requestId`), and numbering titles would
make a name depend on history rather than on intent. Within a single title a
concept is never named twice (collapsed aliases), and no migration renames any
existing, user-created feature — the change applies to newly created features and
to a title that is still the neutral provisional label.

## 3. Stable naming across the lifecycle

- The title is persisted exactly once, at creation, inside the same transaction
  that creates the feature project (the route already reuses the `requestId` row
  on retry, so a retry cannot rename or duplicate).
- The cosmetic AI rename is now gated by `shouldAutoRenameProject` in
  `prd-naming.ts`: it still runs for Greenfield products (unchanged behavior) and
  **never** for `project_mode = 'existing_codebase'`, so questions, PRD, AC and
  tasks stay attached to one name, refresh and History keep showing it, and a
  manual rename is never overwritten.
- The one controlled exception: a title that is still the neutral provisional
  label (`Fitur Baru` / `New Feature`) is refined once, when the answered
  questions finally carry the feature's own words (`refineProvisionalFeatureTitle`).
  It is deterministic (same function, no model), and the write is a
  compare-and-set on the name it read (`WHERE name = <read name>`), so a manual
  rename always wins.
- No project id is ever regenerated for a naming change; no name is written on a
  workspace reload (verified: the only writers of `projects.name` after creation
  are these two blocks in `prd-chat-persist.server.ts`).

## 4. Component-first verdicts

No UI change was required, and none was made: the feature dropdown
(`codebase-plan-switcher.tsx`) already renders the persisted `projects.name` with
the existing `DropdownMenu` primitive and its existing readiness metadata. No new
feature card, title popup, loading animation, naming wizard or decorative UI was
introduced. External component sources named in the brief (shadcn, HeroUI,
magicui, reactbits, thinkingorbs, affectui, tuffui, CUI, sakaniui) were therefore
rejected as unnecessary rather than ignored — the surface that shows the name was
not redesigned.

## 5. Files changed

| File | Change |
| --- | --- |
| `src/features/codebase/services/feature-naming.ts` | new: `deriveFeatureTitle`, `isProvisionalFeatureTitle`, `refineProvisionalFeatureTitle` |
| `src/features/codebase/services/feature-naming-terms.ts` | new: canonical action/entity tables + generic-word table |
| `src/features/codebase/services/feature-project-route.server.ts` | feature creation names via `deriveFeatureTitle(prompt, language)` |
| `src/features/greenfield/services/project-create.server.ts` | repository-first/sync creation: Greenfield keeps `deriveProjectNameSync`; `existing_codebase` uses `deriveFeatureTitle` |
| `src/features/greenfield/services/prd-naming.ts` | exports `stripPrdBoilerplate`; adds `shouldAutoRenameProject` (Greenfield rename policy unchanged) |
| `src/features/greenfield/services/prd-chat-persist.server.ts` | controlled provisional refinement for `existing_codebase`; cosmetic AI rename gated to Greenfield |
| `src/features/greenfield/services/prd-chat-stream.server.ts`, `prd-chat-route.server.ts` | pass the project's `projectMode` into the persist turn |
| `src/features/codebase/tests/feature-naming.test.ts` | new: naming quality, determinism, explicit names, provisional refinement |
| `src/features/codebase/tests/existing-codebase-naming-isolation.test.ts` | new: rename policy per project mode |
| `src/features/codebase/tests/feature-create-idempotency.test.ts` | long Indonesian prompt title, explicit-name preservation, prompt preserved |
| `docs/codebase-fix08-feature-naming.md` | this record |

## 6. Verification

| Check | Command | Result |
| --- | --- | --- |
| Naming unit tests | `pnpm vitest run src/features/codebase/tests/feature-naming.test.ts` | 21 passed |
| Rename-policy tests | `pnpm vitest run .../existing-codebase-naming-isolation.test.ts` | 5 passed |
| Feature creation route | `pnpm vitest run .../feature-create-idempotency.test.ts .../features-route.test.ts` | passed (long Indonesian prompt → functional title, explicit name kept verbatim, retry reuses the row) |
| Greenfield naming untouched | `pnpm vitest run src/features/greenfield/tests/derive-project-name.test.ts src/features/greenfield/tests/project-mode.test.ts` | passed |
| Dropdown/history/chat flow regression | `.../plan-switcher.test.tsx`, `.../chat-flow.test.ts`, `.../features-anchor.test.ts`, `.../onboarding-home-entry.test.tsx`, greenfield `chat-service.test.ts`, `planning-scope-wiring.test.ts` | passed |
| Lint + format | `pnpm biome check <11 touched files>` | clean |
| Typecheck | `pnpm exec tsc --noEmit` | clean except the pre-existing `studio-composer.test.tsx` `Promise.withResolvers` lib error (untouched file) |
| Build | `pnpm build` | passed (`✓ built in 35.83s`, `.output/nitro.json` generated) |
| Whole codebase test directory | `pnpm vitest run src/features/codebase/tests` | 179 files: 167 passed / 12 failed; 1962 tests: 1936 passed / 26 failed |

The 26 failures in the directory run are pre-existing and environmental, not
regressions from this change:

- `auto-name.test.ts` (10 tests, `401` vs `200` handshake fixtures),
  `codebases-pages.test.ts` ("selects the latest usable snapshot…", a source-text
  assertion that moved in an earlier resync refactor) and
  `workspace-analysis-reconciliation.test.tsx` (5s timeout) are the same failures
  FIX 07 recorded as pre-existing on an unmodified checkout.
- This change was re-verified against that baseline directly: with the change
  stashed at HEAD, the same nine files produce **14** failing tests; with the
  change they produce **11**. The failures are 5s-timeout / React-query flakes
  (the run where they appeared spent 4627s in import alone), no file under
  `feature-naming`, feature creation, PRD, AC or task generation is among them,
  and the naming surfaces themselves are the 100/100 focused run above.
- Every file that touches this change passes both together and alone: the
  focused 12-file run above (naming, rename policy, feature creation route,
  feature/anchor routes, plan switcher, chat flow, Greenfield product naming and
  mode parsing) is 100/100 green.

No Playwright, browser automation, screenshot, or manual browser QA was used,
as required.

### Requirement coverage

| # | Required test | Evidence |
| --- | --- | --- |
| 1 | Long Indonesian prompt → functional name | `feature-naming.test.ts` "names a long Indonesian request by function and target"; route test "persists a functional title for a long Indonesian feature request" |
| 2 | Title does not copy the final filler words | naming test "never reuses the filler tail of the final sentence" (asserts the old fallback still produces the rejected string, and the new one does not) |
| 3 | Portfolio search/filter example → relevant title | same two tests, exact `Pencarian dan Filter Proyek Portofolio` |
| 4 | Blog request → blog title | "derives a blog title from a blog request" (`Blog Portfolio`, `Blog Portofolio`) |
| 5 | Navigation request → navigation title | "derives a navigation title from a navigation request" (`Perbaikan Navigasi Mobile`, `Fix Mobile Navigation`) |
| 6 | English prompt handled appropriately | "names an English request in English when planned in English", "refines an English provisional title in English" |
| 7 | Explicit user feature name preserved | "preserves an explicit user-given feature name" + route test "keeps an explicitly named feature verbatim" |
| 8 | Manual rename never overwritten automatically | `existing-codebase-naming-isolation.test.ts` ("never auto-renames an existing-codebase feature"), "leaves a meaningful title alone", and the compare-and-set write in the refinement |
| 9 | Stable, deterministic behavior | "is deterministic for the same prompt" (identical bytes, whitespace/newline variants) |
| 10 | Duplicate requests do not create extra feature projects | `feature-create-idempotency.test.ts` "reuses the same feature on a retry without duplicating…" (unchanged, still green) |
| 11 | Refresh preserves the title | Title is a persisted column written once; the only post-creation writers of `projects.name` are the two blocks in `prd-chat-persist.server.ts` (both verified), so no reload path can rename |
| 12 | History preserves the title | same as 11: History renders `projects.name`, no rename on read |
| 13 | Dropdown shows the correct title | `plan-switcher.test.tsx` (unchanged, green): the switcher renders the persisted `projects.name`; no UI change was needed |
| 14 | PRD/AC/tasks stay on the same feature identity | Identity is `requestId` → project id, untouched; naming never creates a project id |
| 15 | Existing-codebase naming isolated from Greenfield | `shouldAutoRenameProject` keeps the Greenfield AI rename enabled and disables it for `existing_codebase`; `derive-project-name.test.ts` (Greenfield tail-word behavior) still green; `feature-naming.test.ts` asserts the codebase title differs from the Greenfield fallback for the same prompt |
| 16 | Name is never a marketing slogan | "keeps the title free of marketing language"; the deriver can only emit canonical nouns or the user's own head words |
| 17 | Model failure cannot yield a misleading tail-word name | The codebase path calls no model at all (grep: `deriveProjectName` is only referenced from the Greenfield chat modules), and every branch ends in a functional name or the neutral provisional label |
| 18 | No unintended billing changes | No billing/credit file is in the diff; the naming path makes no model call, so it cannot change credit math |
| 19 | No loss of existing planning content | Nothing in the artifact pipeline changed; the route test asserts the raw prompt is still what the plan persists (`state.prompt === message`) |

