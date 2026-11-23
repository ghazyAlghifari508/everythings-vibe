# P8 implementation report

P8 is complete at source and targeted-test level. No browser QA was run; P11 owns visual verification. No records were altered by hand to fabricate a successful revision.

## Existing root causes

1. **Candidate workflow** — `prepareStudioElementRevision` finished in `preview`/`generating` and waited for a separate Apply dialog. Valid model output could not reach the live frame without a second user action.
2. **Split design guidance** — `studio-element-generation.ts` used its own scoped prompt; the compact `evvibe-design` element-revision guidance from P1.1 was not delivered in the real edit path. A full-page standard would invite whole-page restyles.
3. **Revision history error lifecycle** — a failed or stale history request could leave a persistent error message; a late response could also overwrite state produced by a newer mutation.
4. **Direct text source** — the menu only had a truncated `target.label`. Treating that as editable text would silently drop nested children, icons and inline formatting.
5. **Inline editor focus race** — Radix `DropdownMenu` moves focus into the closing menu after `onSelect`. The textarea received `blur` immediately after mount, so an unchanged draft cancelled the editor before the user could type.
6. **Renderer drift** — the old `StudioElementSurface` rendered raw `frame.htmlCode`, not P6's compiled inspection document, so history and canvas could disagree.

## Direct editing implementation

- `StudioElementEditMenu` exposes `Edit Text` only when `textEditable ?? supportsDirectTextEdit(target)` is true **and** the target is not a void element (`img`, `input`, `br`, ...). `StudioLiveSurface` enables it only when the inspected DOM node exists and has no child elements, and passes the **full** text from the active live document (`textValue`), never the truncated label.
- Enter / blur commit; Shift+Enter inserts a newline; Escape cancels; blank (`trim() === ""`) and unchanged text are no-ops and create no revision.
- The menu is keyed by element id, base revision and frame id, so a new revision cannot inherit stale editor state.
- `onAction("edit-text", target, text)` is handled by `useStudioElementEditing.submit()` with an explicit deterministic edit. `prepareStudioElementRevision` passes `{ projectId, frameId, baseRevision }` to `patchStudioElement`; the existing deterministic `text` / `remove` operations are reused. No second patch engine.
- User text is escaped by the patch engine (`<script>` becomes text, parsed document has no `script` element). Nested markup, siblings, typography and layout remain untouched.
- Focus guard: refs to the menu content and trigger ignore the Radix close-time blur, and a single `requestAnimationFrame` restores focus to the textarea.
- `Delete` uses the same deterministic path with `{ kind: "remove" }` and persists a revision plus Undo.

No model request, generation job, credit-ledger entry or full-frame regeneration occurs for Edit Text or Delete; integration tests assert empty `studioJobs` and `creditLedgerEntries` for both.

## Skill integration and actual context size

- `src/features/studio/design-intelligence/evvibe-design/element-revision.ts` exports `EVVIBE_ELEMENT_REVISION_GUIDANCE`: **609 characters**. It covers one element only, existing system, no new chrome, real text, accurate accessible names, and refusal when the request cannot fit the element.
- `buildStudioElementEditSystemPrompt()` interpolates the guidance **exactly once**. Measured full system prompt: **1,357 characters**; a test asserts it stays below 2,400.
- The actual AI path (`generateStudioElementEdit`) uses this prompt; a test renders the real `buildStudioElementEditSystemPrompt()` and verifies the guidance appears once. No component catalog, no full planning skill, no browsing stage, no extra LLM call to select guidance.
- Model output is restricted to `remove`, `text`, `attribute` (`src|alt|title|aria-label`) or a single-root `replace` fragment. Scripts, `style` tags, global CSS, overlays, sibling edits and whole documents are rejected.

## AI Auto Apply lifecycle

```
submit(snapshotted target)
  -> durable revision row (generating)
  -> scoped patch schema + HTML/security + target/scope validation
  -> base revision / frame hash recheck inside transaction
  -> applyStudioElementRevision(tx, ..., "apply")
  -> frame htmlCode + revision + status "applied" in one transaction
  -> live renderer receives the new revision
  -> compact feedback strip offers Undo
```

- New edits no longer return `preview`; they return `status: "applied"` directly. No separate candidate modal or Apply click.
- `applyStudioElementRevision` is the single atomic write path shared by auto apply, legacy explicit apply and Undo. It keeps `assertStudioElementBase`, a revision+HTML guarded frame update and tenant checks.
- Historical `preview` / `generating` rows are **not** auto-applied. Explicit `apply` is retained only for legacy candidates; `cancel` remains available and is idempotent.
- Validation failure keeps the previous frame; no broken intermediate frame is published. The progress strip (`Menyiapkan revisi elemen…`) replaces a whole-frame shimmer, and the existing design stays visible.

## Scoped safety guarantees

- Every query and mutation is tenant-scoped (`user_id` + `project_id`); cross-user and cross-project targets are rejected, including candidate actions.
- Optimistic base revision and hash checks reject stale AI output after a newer direct edit. Concurrent in-flight edits against the same base cannot both publish; the loser is rejected, never silently overwrites.
- Dedupe by request hash prevents retried double-apply; no credit charge on rejection, dedupe or direct operations.
- Out-of-scope patch, shared-class/global-style escape, unsafe HTML and unrelated frames are rejected; tests verify sibling frames are byte-identical.
- Editor instrumentation (`STUDIO_INSPECTION_ATTR`, bridge scripts, CSP, overlays) exists only in the ephemeral P6 document; persisted HTML and export stay clean.

## Undo semantics

- `StudioElementFeedback` shows `Perubahan diterapkan` + `Undo` for a successful edit. Undo calls `transitionStudioElementRevision(..., "undo")`, which writes a new revision whose `beforeHtml` is restored through the same guarded atomic helper.
- Undo is available for direct text edit, direct deletion and AI Auto Apply. Revisions increase monotonically; Undo after a newer approval is rejected rather than overwriting newer work.
- Undo state is derived by `useStudioElementEditing.refresh()` from persisted `applied` rows, so it survives reload, renderer refresh, device switching and history reopening. A stale history response is explicitly prevented from erasing newer undo state.
- Explicit policy: Undo targets the latest applied element revision for that target. Older historical revisions remain viewable in history; no silent bulk rollback of unrelated edits is performed. Legacy previews never claim undo support.

## Revision history fix

- `refresh()` treats an empty array as a valid result, clears a previous error on success, and uses `AbortSignal` so an in-flight request cannot land after unmount or a newer mutation.
- After an authoritative `submit()` / `transition()` response the hook no longer issues a follow-up `refresh()` that could overwrite `pending` / `undo` with stale history.
- The endpoint is unchanged and authorization stays project/user-scoped; migration `drizzle/0048_studio_element_revisions.sql` is present and the local table exists. Storage preview schema still parses legacy `preview` rows strictly. Failures surface in the compact strip and remain recoverable through retry without breaking chat or frame generation.

## Renderer consistency

- Edits keep the P6 single mounted iframe per frame; no remount on entering Pencil, no full-frame shimmer, no new request for device switching. The same renderer serves canvas and history.
- Updated element identities are reconciled from the new HTML; selection overlay, bounds and device viewport are retained. Stale bridge responses are rejected by channel/project/frame/revision/hash checks, so they cannot overwrite newer revisions.
- No editor-only metadata is written to `frame.htmlCode` or the export document (tested).

## Adopted UI components

Existing EvVibe / mature primitives were reused; no new design system or custom dialog was introduced.

- Radix `DropdownMenu` primitives (`Trigger`, `Content`, `Item`, `Separator`) for the context menu.
- Local `Button` for the inline editor's `Batal` action and workspace buttons.
- Hugeicons `Icon` for menu actions.
- Existing composer attachment chip and tooltip pattern for selected-element attachment/removal.
- Existing toast primitives stay available for ordinary errors; P8's success feedback is an inline strip instead of a large toast.

## Test results

Targeted runs (no repo-wide suite):

| File | Result |
| --- | --- |
| `studio-element-p8.test.tsx` | 11 passed |
| `studio-element-client.test.tsx` | 6 passed |
| `studio-element-revision.integration.test.ts` | 11 passed |
| `studio-element-editing-p7.test.tsx` | passed |
| `studio-live-surface-p6.test.tsx` | passed |
| `studio-element-bridge-p7.test.ts` | passed |
| `studio-revision-preservation.test.ts` | passed |
| `pnpm exec tsc --noEmit` | clean |
| `pnpm biome check` on touched files | clean |

Coverage: exact text commit, literal markup handling, Escape / unchanged / blank cancellation, no Edit Text for components, compact guidance once in the real prompt path, deterministic prompt recognition, auto-apply feedback without Apply dialog, legacy candidate apply/cancel, attachment add/remove, atomic apply, monotonic Undo, cross-user/project isolation, dedupe, stale base, concurrent conflict, scope escape rejection, direct edit and delete determinism, export cleanliness, renderer reconciliation and history error/empty states.

## Remaining limitations

- No browser QA or visual regression run; P11 owns it. "No shimmer" is enforced by code and tests, not visual observation.
- Direct text editing is intentionally limited to one non-void DOM text node with no child elements; complex components use scoped AI patches instead.
- Undo covers the latest applied revision per target; older history is read-only, not batch-reversible.
- Legacy `preview` candidates still require explicit Apply/Cancel and cannot retroactively claim Auto Apply or Undo.
- Whole-frame generation unchanged in this phase: it still uses jobs and credits; P8 only removes those costs from deterministic element operations.
