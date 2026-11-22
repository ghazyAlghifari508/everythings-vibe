# P5 implementation report

## Improved suggestion contract

`StudioScreenSuggestion` (`services/studio-suggestion-types.ts`) now carries:

- `cardCopy`: a sentence-length description shown on the card.
- `title`: the canonical action name used for accessibility and debugging.
- `description`: the concrete benefit in one short line.
- `prompt`: the complete, editable instruction that is filled into the composer.
- `intent`: one of `add_screen`, `add_state`, `improve_screen`, `complete_flow`, `add_validation`, `refine_domain`.
- `targetFrameName`: present only when the action targets an exact live frame.

The engine still executes only the intents it already understands. Targeted prompts are phrased as `Pada layar <nama>, ...` and always arrive with one selected frame, so `resolveStudioIntentFromContext` returns `revise_selected`. New-screen prompts stay as `Buat satu halaman ...` and clear the attachment. No server enum was widened and no new route was added.

Generation lives in three focused services: `studio-action-recipes.ts` (domain recipes and card copy), `studio-suggestion-candidates.ts` (grounded candidate ordering and dedupe), `studio-suggestion-actions.ts` (targeted action candidates and full prompts). `studio-screen-suggestions.ts` assembles at most three cards, keeps at least one slot for a new screen, and caches by a content revision.

## Component sources

Reviewed: TUFFUI "Result rail" pattern in the existing review ledger (horizontal scroller with readable cards), shadcn `Button`/`Card`, HeroUI `Card`/`ScrollShadow`, Magic UI, React Bits, Thinking Orbs, affectUI, CUI and SakaniUI. No Tavily or web fetch was used.

Adopted: existing `@/components/ui/icon` (Hugeicons), existing `studio-shortcut-carousel-state` helper for step size and scroll direction, and the theme tokens already used by the composer. The card itself is a native `button` with rounded border and a comfortable 64 px minimum height; the viewport uses the existing horizontal-overflow pattern and arrow controls. HeroUI `ScrollShadow` was prototyped but reverted: in this jsdom suite it unconditionally calls `ResizeObserver`, which would break every composer test for no functional gain. No new dependency was added and no carousel was written from scratch.

Nothing auto-plays. The only motion is a hover border, focus outline, and a `scrollBy` triggered by an explicit arrow click.

## Contextual examples

| Project context | Cards |
| --- | --- |
| Travel, `Detail Paket` + `Checkout` | "Simulasikan paket wisata yang kehabisan kuota", "Uji validasi tanggal pulang sebelum tanggal berangkat", "Rancang riwayat perjalanan dengan filter status" |
| Payout workspace | "Rancang modal penolakan pencairan dengan alasan wajib", "Tolak bukti transfer yang diunggah melebihi 5 MB", "Tampilkan riwayat pencairan selesai beserta dokumen bukti" |
| Developer portfolio | "Perbesar visual proyek pada tampilan beranda", "Rancang detail studi kasus yang menonjolkan hasil proyek", "Tambahkan formulir kontak untuk peluang kerja remote" |
| `Katalog` on canvas, no domain brief | "Periksa keranjang sebelum melanjutkan pemesanan", "Selesaikan pembayaran dengan ringkasan yang jelas", plus a baseline screen |

Ordering reads the original brief, PRD, blueprint identity and screen plan, frame prompts, journey successors, navigation labels, the selected frame names and the latest user request. Cards are never hardcoded per project; the recipes are deterministic and reuse the existing domain lexicon.

A `complete_flow` prompt asks for the concrete visual state of the next step (for example, "Rancang state visual ringkasan pesanan setelah keranjang diisi ..."). It does not claim a clickable prototype: until the P10 runtime exists, the request is a visual state, as P5 requires.

## Intent coverage

All six categories have a live recipe: `add_screen` from the existing screen/domain lexicon, `add_state` (quota exhaustion, payout refusal, budget overflow), `add_validation` (return date, upload size), `improve_screen` (portfolio landing), `complete_flow` (cart to summary) and `refine_domain` (travel history status). Targets are verified against `frameNames` before they are attached; an unknown name never becomes a composer target.

## Fallback and caching

Suggestion derivation is synchronous and reads only data the workspace already loaded. There is no model call, fetch, or timer on render, pan, zoom or rerender. `studioSuggestionRevision` includes project id, design mode, blueprint version, PRD hash, project title, frame names, frame prompt hashes, selected frame names, latest request and brief hash. Identical revisions return the same array instance; the cache is bounded to eight entries.

Domain-specific screens are emitted only with at least two independent domain mentions. A single stray noun in a title no longer claims the product domain; journey successors and platform baselines take over. Duplicate filtering uses token containment and aliases, not exact strings, and targeted actions are deduped by intent plus target. When a card targets a frame, only that frame is attached; a new-screen card clears stale targets.

Clicking a card fills the composer, attaches the target and focuses the textarea. It never submits and never charges a credit — submission remains an explicit user action.

## Targeted tests

- `studio-p5-context-actions.test.ts` (11 tests): contextual travel/payout/portfolio cards, six intents, exact target attachment, intent resolution, prompt length bounds, no frames, no unrelated frames, uniqueness, cache stability, no `fetch`, revision invalidation.
- `studio-suggestion-row.test.tsx` (12 tests): sentence cards, full prompt reachability, horizontal layout, intent icons, keyboard focus in both axis pairs, scroll buttons, target attachment, no submit, clearing stale targets, editable draft.
- `studio-screen-suggestions.test.ts` and `studio-screen-suggestions.integration.test.ts`: updated to the card-copy contract without loosening assertions.
- `studio-shortcut-carousel.test.tsx`, `studio-composer.test.tsx`, `studio-chat-workspace.test.tsx`, `studio-chat-panel-p4.test.tsx`: regression checks for the touched composer/panel surfaces.

Verification run: 65 tests pass across the five suggestion suites and 40 across the three composer/panel suites; `pnpm exec tsc --noEmit` clean; `pnpm biome check` clean on all 14 touched files. No browser QA, per P5.
