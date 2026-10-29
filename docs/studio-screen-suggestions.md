# Studio next-screen suggestions

The composer carries one row of next-screen bubbles. A bubble only fills the
composer with an editable prompt; it never submits and never spends a credit.
Execution still goes through the composer intent path, so `add_screen` is
resolved and validated by the same code that handled TASK 05.

## Where the suggestion data comes from

Everything is read from project state the workspace already loaded
(`StudioDetailLoaderData`): the shared blueprint, the PRD, the project title and
platform, and the frame names on the canvas. No screenshot, no vision call, no
provider request, and no new endpoint.

Source order in `deriveStudioScreenSuggestions` (`studio-screen-suggestions.ts`);
the lexicon itself lives in `studio-screen-recipes.ts`:

1. `designBlueprint.screenPlan` entries that have no frame yet — the plan is the
   strongest signal, and the entry's `role` becomes the prompt focus.
2. `designBlueprint.navigationContract.labels` that have no screen — a
   navigation destination the app cannot reach.
3. `SCREEN_RECIPES` matched against `prdContent`, then against the frame
   descriptions — a domain capability lexicon (`transaksi`, `anggaran`,
   `laporan`, `keranjang`, `stok`, ...) where each recipe carries its own concrete
   focus sentence and, where it matters, its platform. A recipe only fires when
   this project's own text mentions it, so two unrelated projects never get the
   same list. A frame description holds the prompt that asked for that screen, so
   earlier requests keep informing the row after the PRD stops being the only
   text.
4. `PLATFORM_FALLBACK` — base screens that are missing (`Profil`, `Pengaturan`,
   and `Notifikasi` for mobile or `Aktivitas` for web). This only tops up the row
   when the project itself has nothing more specific to say.

Filtering: a candidate is dropped when its token set is contained in an existing
frame name or in an already accepted suggestion (`Riwayat` vs `Riwayat
Transaksi`, `Transaksi` vs `Catat Transaksi`), when its label normalizes to
nothing, or when `STUDIO_SCREEN_SUGGESTION_LIMIT` (4) is reached.

Each bubble carries `id` (`add-screen:<slug>`), `label` (`Buat <name>`), `prompt`,
`intent: "add_screen"`, and an internal `reason`. The prompt is assembled from
the project title, the screen name and the source focus:

```
Buat satu halaman Anggaran untuk CatatDompet. Tampilkan daftar kategori
anggaran dengan batas, realisasi, progres pemakaian, serta aksi mengubah
batas. Ikuti desain, navigasi, dan komponen aplikasi yang sudah ada.
Jangan mengubah halaman lain.
```

The first sentence binds an add verb to the screen noun followed by the exact
name, which is what `resolveStudioIntentFromContext` reads; the addition wins
even while other frames are selected.

## Generation and caching

Deterministic only. The structured data always contains what a suggestion needs,
so there is no model call to tune, bound, cache or fail. That removes the
per-render/per-keystroke cost the brief warns about: rendering, panning, zooming
or polling cannot start a request.

`studioSuggestionRevision` is the cache key: project id, platform, blueprint
version, PRD hash (or PRD length when absent), normalized title, normalized
frame names and an FNV-1a hash of the frame descriptions. `getStudioScreenSuggestions` memoizes the derived list per revision
in a small bounded map, so identical content returns the same array instance and
the row does not re-render on a status poll. Frame add, rename and delete all
change the frame-name part of the key, so the row refreshes from the same polls
that already update the canvas. The key contains the project id, so the shared
server-side module cache can never return another project's list.

Suggestions are hidden while `isProcessing` is true. Planning rewrites the frame
list (`persistStudioPlannedFrames` deletes and reinserts when the slots are no
longer temporary), so inviting an add mid-plan would race it; the row returns as
soon as the canvas is idle.

## UI

`StudioSuggestionRow` sits above the composer form inside the same floating
container, so it inherits the composer width and safe-area inset. It is one
horizontal row of pill buttons with `overflow-x-auto`, no scrollbar, and previous
/ next buttons that appear only once the bubbles actually overflow — a row that
fits keeps no dead controls. `canScrollPrev`, `canScrollNext` and
`getCarouselStep` are reused from `studio-shortcut-carousel-state` rather than
reimplemented.

Accessibility: the row is a labelled `region` containing a `ul` of buttons, so
Tab and Left/Right arrows both move between bubbles, focus rings are visible, and
each button is disabled while a request is in flight. Labels are truncated at
`max-w-52`, and the full prompt stays available through `title` (pointer) and an
sr-only copy inside the button (keyboard and screen readers).

Component audit: `src/components/ui` has no ScrollArea, Tooltip or Carousel
primitive, and shadcn/HeroUI/Magic UI are not part of the studio surface, so the
row reuses what exists instead of adding a dependency —
`studio-shortcut-carousel-state` for the scroll maths, `Icon` for the arrows, and
the composer's own button treatment. Native `overflow-x-auto` (scrollbar hidden,
as in `StudioShortcutCarousel`) covers scrolling; `title` plus the sr-only prompt
covers the full text. `Button` was not used for the pills because this repo has
no `tailwind-merge`, so `rounded-md`/`h-8` from its variants would collide with
the pill sizing instead of merging.

Selecting a bubble calls `insertSuggestion` in `StudioComposer`: it replaces the
draft, clears a stale clarify message and focuses the textarea. Submission stays
the user's own action.

## Verification

```sh
pnpm vitest run src/features/studio/tests/studio-screen-suggestions.test.ts
pnpm vitest run src/features/studio/tests/studio-suggestion-row.test.tsx
pnpm vitest run src/features/studio/tests/studio-screen-suggestions.integration.test.ts
pnpm vitest run src/features/studio/tests/studio-composer.test.tsx
```

Covered: one-screen project, several existing screens, no frames, blueprint plan
gaps, navigation gaps, PRD and earlier-request recipes, near-duplicate prevention,
user-created screen names, platform-specific fallback, prompt richness and the
shared prompt bounds, add-screen intent and name round-trip through the intent
resolver, revision changes for every input, cache reuse and invalidation,
click-inserts-without-submit, disabled state, arrow key navigation, scroll
controls, and — against the database — one added frame per bubble, untouched
existing frames, ownership refusal and duplicate refusal.

No browser QA.