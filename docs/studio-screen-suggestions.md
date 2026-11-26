# Studio next-screen suggestions

The composer carries a compact stack of next-screen cards. A card only fills the
composer with an editable prompt; it never submits and never spends a credit.
Execution still goes through the composer intent path, so `add_screen` is
resolved and validated by the same code that handled TASK 05.

## Where the suggestion data comes from

Everything is read from project state the workspace already loaded
(`StudioDetailLoaderData`): the shared blueprint, the PRD, the project title and
platform, the prompts behind existing screens, and the frame names on the
canvas. No screenshot, no vision call, no provider request, and no new endpoint.

Source order in `deriveStudioScreenSuggestions` (`studio-screen-suggestions.ts`);
the lexicon lives in `studio-screen-recipes.ts`:

1. `SCREEN_RECIPES` matched against the frame descriptions — a frame description
   holds the prompt that asked for that screen, so the user's own earlier request
   is the strongest evidence of what the product should do next.
2. `SCREEN_RECIPES` matched against `prdContent`.
3. `designBlueprint.screenPlan` entries that have no frame yet — the entry's
   `role` becomes both the card description and the prompt focus.
4. `SCREEN_RECIPES` matched against the existing frame names — a screen already
   on the canvas implies the rest of its flow.
5. `designBlueprint.navigationContract.labels` that have no screen — a
   navigation destination the app cannot reach.
6. `DOMAIN_RECIPES` — the product domain read from the project's own words (PRD,
   title, blueprint identity, screen names). A travel project gets itinerary
   history, a wishlist and a traveler profile; a finance project gets categories,
   budgets, reports and savings goals. This is what a page name alone cannot
   express, and it only fires when the project's own text proves the domain.
7. `PLATFORM_FALLBACK` — base screens that are missing (`Profil`, `Pengaturan`
   and `Notifikasi` for mobile, `Aktivitas` instead of `Notifikasi` on web). This
   only tops up the stack when the project itself has nothing more specific.

Filtering: a candidate is dropped when its name **or any of its `aliases`** is
contained in an existing frame name or in an accepted card (`Riwayat` vs `Riwayat
Transaksi`, `Checkout` vs `Pembayaran`), when its name normalizes to nothing, or
when `STUDIO_SCREEN_SUGGESTION_LIMIT` (3) is reached. Aliases are what stop a
canvas that already has "Checkout" from being offered "Pembayaran"; keep them
tight, because every alias token set joins the taken set for the rest of the pass.

Each card carries `id` (`add-screen:<slug>`), a short action `title`, a one-line
`description` capped at 96 characters, the full `prompt`, `intent: "add_screen"`
and an internal `reason` naming the source ("PRD menyebut …", "Alur aplikasi
travel menyebut …"). The prompt is assembled from the project title, the screen
name, the source focus and the consistency contract:

```
Buat satu halaman Anggaran untuk CatatDompet. Tampilkan daftar kategori
anggaran dengan batas, realisasi, progres pemakaian, serta aksi mengubah
batas. Gunakan navigasi, warna, tipografi, header, dan komponen yang
konsisten dengan layar project yang sudah ada. Jangan mengubah halaman lain.
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
frame names and an FNV-1a hash of the frame descriptions. `getStudioScreenSuggestions`
memoizes the derived list per revision in a small bounded map, so identical
content returns the same array instance and the card stack does not re-render on
a status poll. Frame add, rename and delete all change the frame-name part of the
key, so the stack refreshes from the same polls that already update the canvas.
The key contains the project id, so the shared server-side module cache can never
return another project's list.

Suggestions are hidden while `isProcessing` is true. Planning rewrites the frame
list (`persistStudioPlannedFrames` deletes and reinserts when the slots are no
longer temporary), so inviting an add mid-plan would race it; the stack returns
as soon as the canvas is idle.

## UI

`StudioSuggestionRow` sits above the composer form inside the same floating
container, so it inherits the composer width and safe-area inset. It is a
labelled `region` holding a `ul` of full-width buttons, one per card: a turn
arrow marker, the action title, and the one-line description. A long title
wraps inside the button instead of being truncated, which is why the row is a
vertical stack and not a horizontal pill carousel — "Buat halaman riwayat
perjalanan" does not survive a 208px pill.

Accessibility: Tab and Up/Down arrows move between cards (wrapping), focus rings
are visible, and every card is disabled while a request is in flight. The full
prompt stays available through `title` (pointer) and an sr-only copy inside the
button (keyboard and screen readers). The stack grows upwards from the composer
and stays inside the composer width cap, so it never overlaps the canvas zoom
controls in the bottom-right corner.

Component audit: `src/components/ui` has no ScrollArea, Tooltip or Carousel
primitive, and shadcn/HeroUI/Magic UI are not part of the studio surface, so the
row reuses what exists instead of adding a dependency — `Icon` with
`ArrowTurnForwardIcon` (Hugeicons) for the marker, `divide-iron` borders for the
list, and the composer's own focus/disabled treatment. `Button` was not used for
the cards because this repo has no `tailwind-merge`, so `rounded-md`/`h-8` from
its variants would collide with the card padding instead of merging.

Selecting a card calls `insertSuggestion` in `StudioComposer`: it replaces the
draft, clears a stale clarify message and focuses the textarea, so the user can
rewrite the prompt before sending. Submission stays the user's own action.

## Verification

```sh
pnpm vitest run src/features/studio/tests/studio-screen-suggestions.test.ts
pnpm vitest run src/features/studio/tests/studio-suggestion-row.test.tsx
pnpm vitest run src/features/studio/tests/studio-screen-suggestions.integration.test.ts
pnpm vitest run src/features/studio/tests/studio-composer.test.tsx
```

Covered: one-screen project, several existing screens, no frames, blueprint plan
gaps, navigation gaps, PRD and earlier-request recipes, synonym prevention
(`Checkout` vs `Pembayaran`), a travel project with five screens, a finance
project, near-duplicate prevention, user-created screen names, platform-specific
fallback, card title/description shape, prompt richness and the shared prompt
bounds, add-screen intent and name round-trip through the intent resolver,
revision changes for every input, cache reuse and invalidation,
click-inserts-without-submit, editing before submit, disabled state, arrow key
navigation, and — against the database — one added frame per card, untouched
existing frames, ownership refusal and duplicate refusal.

No browser QA.
