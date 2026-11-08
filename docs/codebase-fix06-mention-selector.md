# FIX 06: Existing Codebase `@` Selector — Floating Surface, Real Documents Only

Scope: the `@` reference selector of the VibePlan Existing Codebase chat
composer. The composer markup, toolbar, Plan/Revise modes, slash commands, and
the revision workflow were not redesigned.

## What was wrong (current source, proven)

| Defect | Evidence in the code before the fix |
| --- | --- |
| Selector lived in the composer's layout flow | `codebase-chat-workspace-composer.tsx` passed the mention popover through `PromptBar`'s `popoverSlot`, and the panel used `className="mb-2 w-full max-w-md …"`. Opening it inserted a block child, growing the composer and pushing the textarea/footer down. |
| Fake document rows | `buildMentionCandidates()` always looped `for (const kind of ["feature", "prd", "ac", "tasks"])` and emitted `available: Boolean(artifact)`; the panel rendered `doc.available ? doc.fileName : "Belum dibuat"`, so missing PRD/AC/Task were selectable rows that could never resolve. |
| Repository files offered through `@` | The same builder appended `repositoryFiles` as a `File Repository` group with `@src/pages/Content.jsx`, `@package.json`, … plus a "Tidak ada file repository yang cocok." empty state. |
| Cross-feature leakage | Kinds were matched against whatever `artifacts` array arrived; nothing verified that an artifact belonged to the active feature (`projectId`). |

## Chosen floating primitive

| Source | Candidate | Verdict |
| --- | --- | --- |
| ui.shadcn.com | `Popover` (`@radix-ui/react-popover`) | **Chosen.** Portal + floating-ui positioning with `side`/`align`/`sideOffset`/`collisionPadding`, non-modal operation, `PopoverAnchor` for a virtual anchor, and `--radix-popover-trigger-width` for a stable width. It is the same primitive family as the existing `dropdown-menu.tsx`, so the wrapper follows repo convention and dark-mode tokens. |
| heroui.com | HeroUI v3 `Popover` | Rejected. In `@heroui/react@3.2.6` the root *is* a `DialogTrigger` (`react-aria-components/Dialog`) whose content must be a direct child trigger pair, i.e. a modal dialog anchored to a focusable trigger. This surface must stay non-modal and anchored to the composer edge while the caret keeps typing in the textarea. HeroUI's stylesheet is also not imported by the app (`src/styles.css`), so its variants would not apply. |
| heroui.com | HeroUI `Tooltip` | Rejected: hover/focus semantics, not a searchable selectable surface. |
| magicui.design, reactbits.dev | animated popovers | Rejected: decorative motion; the brief forbids new glow/animation chrome. |
| thinkingorbs.com, affectui.com, tuffui.com, CUI, sakaniui.com | agent/chat shells and steppers | Rejected: they ship whole chat surfaces, which the brief forbids rebuilding. |

Dependency added: `@radix-ui/react-popover@^1.3.1`. `pnpm add` also refreshed
pre-existing `"latest"` specifiers (TanStack Query/Devtools patch-minor bump);
no other package.json constraint changed.

## Floating architecture

`src/components/ui/popover.tsx` wraps `Root`, `Anchor`, `Trigger`, and a
portaled `Content` (`z-50`, `rounded-lg border border-graphite bg-obsidian`).

`src/features/codebase/components/chat/codebase-chat-workspace-composer.tsx`
now renders:

```
Popover (open = isMentionOpen, modal = false)
├── relative w-full
│   ├── PopoverAnchor  ← absolute inset-x-0 top-0 h-0  (virtual anchor)
│   └── PromptBar      ← unchanged composer
└── CodebaseComposerMentionPopover → portaled PopoverContent
```

- **Anchor:** a zero-height, absolutely positioned element on the composer's
  top edge. It is out of flow, so the composer keeps its exact width, height,
  textarea size, toolbar and submit positions. Its width is the composer width,
  which feeds `w-[var(--radix-popover-trigger-width)]` — the surface width never
  follows the amount of text in the textarea.
- **Placement contract** (`MENTION_POPOVER_PLACEMENT`): `side="top"`,
  `align="start"`, `sideOffset={-6}` (bottom edge overlaps the composer's top
  border by 6px), `collisionPadding={12}`. No global `top`/`left` coordinates;
  Radix collision handling flips/shifts the surface on short viewports and the
  composer is never resized.
- **Height/scroll:** the list is capped by
  `max-h-[min(18rem,var(--radix-popover-content-available-height))]` and scrolls
  on its own.
- **Portal:** content renders under `document.body` behind a
  `[data-radix-popper-content-wrapper]`, so no `overflow` ancestor (transcript
  scroller, pristine column) can clip it.
- **Non-modal:** `modal={false}` keeps typing alive in the textarea while the
  selector is open; `onOpenAutoFocus` is prevented for caret-driven opens so
  the draft selection is never stolen, while a button click focuses the search
  field. Outside pointer-down and Escape dismiss it (Radix layers), and the `@`
  trigger itself is excluded from dismissal so the toggle keeps working.

## Document filtering source

`buildMentionCandidates()` now takes only `{ artifacts, featureName, projectId }`
and pushes a candidate **only when the artifact exists**:

- `artifacts` arrives from `useWorkspaceArtifactPresentation`, which builds the
  list from the persisted active-feature state (`featureTree`, `prdContent`,
  `acContent`, `hasTasksInDb`). Missing documents simply are not in the array,
  so no `available` flag and no "Belum dibuat" rows exist any more.
- Each artifact's kind comes from `inferArtifactTargetKind`; ids are the real
  `feature-<id>` / `prd-<id>` / `ac-<id>` / `tasks-<id>` identities, so the
  recorded binding is the stable artifact id, not a synthesized filename.
- Cross-feature guard: an artifact whose id names a different project than the
  active `projectId` is skipped, so a second plan in the same repository can
  never be referenced from this one.
- `filterMentionCandidates(documents, query)` does the search filtering; the
  query comes from the inline `@` token or from the search field, and the field
  override is stored with the token key it was typed under, so editing the
  draft hands filtering back to the textarea without a reset effect.
- With no documents, typing `@` opens nothing (the literal `@` stays in the
  draft) and an explicit `@` click shows a single compact line — never a fake
  selectable list.

## Repository files are gone from `@`

`ComposerFileMentionCandidate`, the file group, `File Repository`, the
"Tidak ada file repository yang cocok." copy, and the repo-file branch of
`buildMentionCandidates` were deleted, together with `mentionFiles` plumbing in
the composer/workspace props and the keyboard navigator.

Backward compatibility is preserved where it matters: references saved by
older sessions are still `kind: "file"` bindings, and
`reconcileSelectedReferences` keeps resolving them (available/stale chip with
`Tidak ada di snapshot aktif`), so nothing crashes and no new file mentions can
be created. The chips component still renders a file chip if one exists.

## UI copy

- Dialog `aria-label`: `Pilih dokumen`.
- Search placeholder: `Cari dokumen...`.
- Row labels: `Feature`, `PRD`, `Acceptance Criteria`, `Task`.
- Trigger: `aria-label`/`title` `Sisipkan referensi dokumen (@)`.
- Command help line: `@Dokumen` → `Sisipkan referensi dokumen planning`.
- Removed: `Lampirkan referensi artefak atau file`, `File Repository`,
  `Belum dibuat`, `@Dokumen / @file`.

## Keyboard & focus

| Action | Textarea (typing `@`) | Search field (button open) |
| --- | --- | --- |
| Filter | inline token | field value |
| ArrowUp/ArrowDown | moves highlight | moves highlight |
| Enter/Tab | selects, never submits | selects, never submits |
| Escape | closes | closes |
| After select | token removed, reference added, composer refocused | focus returns to composer |

No global key listener was added; the existing composer keyboard hook owns
navigation for both entry points, and every mention button keeps
`type="button"` so no native submit fires.

## Files

| File | Change |
| --- | --- |
| `src/components/ui/popover.tsx` | New Radix popover wrapper (portal, `z-50`, tokens). |
| `package.json`, `pnpm-lock.yaml` | `@radix-ui/react-popover` dependency. |
| `services/composer-mentions.ts` | Candidates built only from existing, active-feature artifacts; `filterMentionCandidates`; file candidates/`available` flag removed; stricter artifact reconciliation. |
| `services/composer-interactions.ts` | Re-exports updated (no file candidate type, adds filter). |
| `hooks/use-composer-keyboard.ts` | Documents-only navigation, shared key handler for textarea + search, token-keyed search override. |
| `hooks/use-composer-menus.ts` | Exposes filtered documents, empty-state flag, search autofocus, search key handler; clears the field on toggle/close. |
| `components/chat/codebase-composer-mention-popover.tsx` | New portaled floating selector. |
| `components/chat/codebase-composer-popovers.tsx` | In-flow mention panel + file group deleted; help copy fixed. |
| `components/chat/codebase-chat-workspace-composer.tsx` | `Popover` shell + zero-height anchor; mention surface moved out of `PromptBar`'s layout slot. |
| `components/chat/codebase-chat-workspace.tsx` | Prop wiring for the new selector contract. |
| `components/chat/codebase-composer-toolbar.tsx` | Trigger copy + `data-composer-mention-trigger` marker used by outside-dismiss guard. |
| `tests/composer-mention-floating.test.tsx` | New structural positioning/portal/scroll suite. |
| `tests/composer-redesign-mentions.test.tsx` | Rewritten for documents-only behaviour, keyboard/escape/outside-click, duplicates, revise target, plan mode, legacy file references. |
| `tests/composer-redesign-modes.test.tsx` | File mention replaced by document mention; ResizeObserver stub. |

## Tests

`composer-mention-floating.test.tsx` (2) + `composer-redesign-mentions.test.tsx`
(14) cover the 25 required checks without browser automation:

1. Composer child count is identical open vs closed (no in-flow child).
2. Surface is under `[data-radix-popper-content-wrapper]` and outside the
   composer shell.
3. Upward placement (`side === "top"`).
4. Slight overlap (`sideOffset < 0`, |offset| ≤ 12).
5. Viewport collision padding configured.
6. Anchor-derived width + `max-h`/`overflow-y-auto` list.
7–8. No file rows, no `File Repository` copy.
9–12. Only existing documents listed; missing PRD/AC/Task never appear.
13. Cross-feature artifacts excluded.
14. Search filters real documents.
15. Click records the exact artifact binding.
16. Arrow/Enter selection from the textarea.
17. Escape closes.
18. Outside pointer-down closes.
19. Draft only loses the `@` token; prose untouched.
20. Composer keeps focus after selection.
21. Revise mode resolves the mentioned document (`targetKind: "ac"`).
22. Plan mode submission unchanged (`targetKind` undefined).
23. Re-picking a document keeps one reference.
24. Legacy file references stay renderable/stale, no throw.
25. Selecting never sends or submits.

## Verification

- `pnpm vitest run` on `composer-mention-floating`, `composer-redesign-mentions`,
  `composer-redesign-modes`, `prompt-bar`: 4 files / 43 tests pass.
- Workspace regression batch (`chat-workspace`, `thinking-flow`,
  `workspace-draft-isolation`, `planning-lifecycle`,
  `adaptive-question-selection-persistence`, `clarification-persistence-retry`,
  `clarification-persistence-save`): 7 files / 135 tests pass.
- `pnpm biome check` on every touched file: clean.
- `pnpm exec tsc --noEmit`: clean except the pre-existing
  `src/features/studio/tests/studio-composer.test.tsx:241` lib mismatch
  recorded by FIX 05.
- `pnpm build`: success.

Pre-existing failure (not this change's surface, recorded for honesty):
`codebases-pages.test.ts` → "selects the latest usable snapshot regardless of
file count" asserts the snapshot `inArray(...)` source text inside
`codebase-detail-page.tsx`. That selection now lives in
`services/workspace-snapshot.server.ts` (earlier resync refactors, e.g.
`45b6ff82`), and FIX 06 does not touch either file.

No Playwright, browser automation, screenshot, or manual browser QA was used.