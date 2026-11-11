# Studio next-screen suggestions

The composer carries one compact horizontal row of next-screen bubbles above the
input. A bubble only fills the composer with an editable prompt; it never submits
and never spends a credit. Execution still goes through the composer intent path,
so `add_screen` is resolved and validated by the same code that handled TASK 05.

## Where the suggestion data comes from

Everything is read from project state the workspace already loaded
(`StudioDetailLoaderData`): the shared blueprint, the PRD, the project title and
platform, the project's own message history, the prompts behind existing screens,
and the frame names on the canvas. No screenshot, no vision call, no provider
request, no model call, and no new endpoint.

Source order in `deriveStudioScreenSuggestions` (`studio-screen-suggestions.ts`);
the lexicon lives in `studio-screen-recipes.ts`:

1. `SCREEN_RECIPES` matched against the frame descriptions — a frame description
   holds the prompt that asked for that screen, so the user's own earlier request
   is the strongest evidence of what the product should do next.
2. `SCREEN_RECIPES` matched against `prdContent`.
3. `designBlueprint.screenPlan` entries that have no frame yet — the entry's
   `role` becomes both the bubble description and the prompt focus.
4. `SCREEN_RECIPES` matched against the existing frame names — a screen already
   on the canvas implies the rest of its flow.
5. `designBlueprint.navigationContract.labels` that have no screen — a
   navigation destination the app cannot reach.
6. `DOMAIN_RECIPES` — the product domain read from the project's own words (PRD,
   message history, title, blueprint identity and audience, screen names). Six
   domains ship: travel, keuangan, kuliner, portofolio, kesehatan and edukasi.
   Travel adds itinerary history, a wishlist, a traveler profile and then a
   destination explorer, a local-festival finder and a trip cost split; kuliner
   adds order history, coffee favourites and promo detail; portofolio adds a case
   study, work experience and a contact form. A domain only fires when the
   project's own text proves it, and the first matching domain in the array takes
   the slots.
7. `FLOW_SUCCESSORS` — the step after a screen that is already on the canvas. A
   canvas holding "Katalog" needs a way into the cart; "Jelajahi Destinasi" needs
   somewhere to keep what was found. Successor names resolve through the lexicon,
   so they inherit its label, description and focus, and the bubble reason reads
   `Alur lanjutan dari layar "Katalog"`.
8. `PLATFORM_FALLBACK` — base screens that are missing (`Profil`, `Pengaturan`
   and `Notifikasi` for mobile, `Aktivitas` instead of `Notifikasi` on web). This
   only tops up the row when the project itself has nothing more specific.

Filtering: a candidate is dropped when its name **or any of its `aliases`** is
contained in an existing frame name or in an accepted bubble (`Riwayat` vs `Riwayat
Transaksi`, `Checkout` vs `Pembayaran`), when its bubble label normalizes to the
same phrase as one already in the row, when its name normalizes to nothing, or
when `STUDIO_SCREEN_SUGGESTION_LIMIT` (3) is reached. Aliases are what stop a
canvas that already has "Checkout" from being offered "Pembayaran"; keep them
tight, because every alias token set joins the taken set for the rest of the pass
(and a loose alias such as "menu favorit" collides with a plain "Menu" frame).

## Bubble label vs prompt

`label` is what the bubble shows: a short, domain-specific action phrase
("Bagi Biaya Trip", "Favorit Kopi", "Form Kontak"), never a bare page noun or a
"Buat halaman ..." title. `title` stays the longer action title used as the
bubble's accessible name; `description` is the one line capped at 96 characters.

The prompt behind a bubble is complete and editable, and it carries every piece
of project context the row actually knows: the screen name, the project title,
the lexicon focus (content, states and actions of that screen), the blueprint
audience, the platform, and the shared consistency contract:

```
Buat satu halaman Bagi Biaya Trip untuk Squad Trip. Tampilkan pembagian biaya
perjalanan untuk anggota grup: daftar pengeluaran, siapa yang membayar, peserta
yang berbagi biaya, total per anggota, ringkasan siapa melunasi siapa, dan status
pelunasan. Sasarannya anggota Squad. Susun tata letak mobile satu kolom dengan
target sentuh yang nyaman. Gunakan navigasi, warna, tipografi, header, dan
komponen yang konsisten dengan layar project yang sudah ada. Jangan mengubah
halaman lain.
```

The first sentence binds an add verb to the screen noun followed by the exact
name, which is what `resolveStudioIntentFromContext` reads; the addition wins
even while other frames are selected. The composer only pre-fills the draft and
focuses the textarea — the user still edits and submits, so a click cannot spend
a credit.

## Generation and caching

Deterministic only. The structured data always contains what a suggestion needs,
so there is no model call to tune, bound, cache or fail. That removes the
per-render/per-keystroke cost the brief warns about: rendering, panning, zooming
or polling cannot start a request, and the model bill does not grow with the
canvas.

`studioSuggestionRevision` is the cache key: project id, platform, blueprint
version, PRD hash (or PRD length when absent), normalized title, normalized frame
names, an FNV-1a hash of the frame descriptions and an FNV-1a hash of the message
history. `getStudioScreenSuggestions` memoizes the derived list per revision in a
small bounded map, so identical content returns the same array instance and the
row does not re-render on a status poll. Frame add, rename and delete change the
frame-name part of the key; a new user message changes the brief hash; a
blueprint rewrite changes the version. The key contains the project id, so the
shared server-side module cache can never return another project's list.

Suggestions are hidden while `isProcessing` is true. Planning rewrites the frame
list (`persistStudioPlannedFrames` deletes and reinserts when the slots are no
longer temporary), so inviting an add mid-plan would race it; the row returns as
soon as the canvas is idle.

## UI

`StudioSuggestionRow` sits above the composer form, inside the same floating
container, so it inherits the composer width and safe-area inset. It is one
labelled `region` (`Saran layar berikutnya`) holding a scrollable horizontal `ul`:
each bubble is a `h-11 lg:h-8` pill with the Hugeicons add marker, the short
label, an optional flow arrow for navigation destinations, and an sr-only copy of
the title, description and full prompt. Scroll arrows appear only while the row
overflows; Tab and ArrowLeft/ArrowRight move between bubbles with a visible focus
ring, and every bubble is disabled while a request is in flight. The row never
becomes a vertical stack of cards.

Component audit: `src/components/ui` has no Chip, close-button, Tooltip or
ScrollArea primitive, so the catalogs were checked instead. HeroUI v3 is already
a dependency and ships `Tooltip`, `CloseButton` and `ScrollShadow`; its `Chip`
only renders label content (there is no `onClose` slot, that is the v2 API), and
the project has no `tailwind-merge`, so `Button`/`Chip` variants cannot be merged
with a compact bubble's own padding. The attachment chip therefore keeps the
project's token markup, and the detach affordance reuses the HeroUI `Tooltip`
pattern already used by `codebase-kanban-board.tsx`. The bubble row stays a
`ul` of token-styled buttons for the same reason; icons remain Hugeicons and
colours remain the project's tokens.

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
fallback, bubble label/description shape, the travel, coffee and portfolio action
sets, journey-gap successors, prompt richness (audience, platform, consistency)
and the shared prompt bounds, add-screen intent and name round-trip through the
intent resolver, revision changes for every input including the message history,
cache reuse and invalidation, click-inserts-without-submit, editing before
submit, disabled state, horizontal ArrowLeft/ArrowRight navigation, scroll
buttons — and, against the database, one added frame per bubble, untouched
existing frames, ownership refusal and duplicate refusal.

Attachment behaviour (chip detach, clear-all, stale-target pruning, submit
snapshot) is documented in `studio-composer-intent.md` and verified by
`studio-composer.test.tsx`, `studio-frame-selection.test.ts`,
`studio-chat-workspace.test.tsx` and `studio-detail.test.tsx`.

No browser QA.