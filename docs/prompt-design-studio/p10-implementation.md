# P10: Select-Element, Scoped AI Revision, Preview, Apply, and Undo

Implemented Prompt 10. No browser QA, Playwright E2E, merge, or deployment was
performed. The brief's final sentence forbids commits and pushes, but the session
instruction and `AGENTS.md` require atomic commits and a push; that instruction
takes precedence and is applied at handoff.

## Architecture

| Concern | Module |
|---|---|
| Element identity, resolution, base hashes | `services/studio-element-document.ts` |
| Isolated inspection HTML + CSP | `services/studio-element-inspection.ts` |
| Bounded postMessage contract + bridge script | `utils/studio-element-bridge.ts` |
| Deterministic patch engine | `services/studio-element-patch.ts` |
| Deterministic intent match, then model fallback | `services/studio-element-generation.ts` |
| Persistence, ownership, idempotency, frame lock | `services/studio-element-storage.ts` |
| Prepare / generate / reject lifecycle | `services/studio-element-revision.ts` |
| Apply / Cancel / Undo state machine | `services/studio-element-transition.ts` |
| HTTP actions and inspection reads | `services/studio-element-http.ts` |
| Client lifecycle, detach, reload, undo rail | `hooks/use-studio-element-editing.ts` |
| Live inspection iframe + selection overlay | `components/canvas/studio-element-surface.tsx` |
| Before/after preview dialog | `components/workspace/studio-element-preview.tsx` |

The canvas stays image-based. `StudioElementSurface` is mounted only while element
inspection is active (`StudioCanvasControls` exposes `Select Element` next to the
existing pan/frame tools) and inside the preview dialog; it renders the same
persisted frame HTML inside a sandboxed iframe instead of a screenshot.

Scope boundary respected: there is no drag, resize, or property inspector. The
only editable surfaces are removal, one text node, a known image/alt/title/
aria-label attribute, and a validated fragment replacement.

## Target identity policy

`indexStudioElements` parses the frame HTML once with jsdom `includeNodeLocations`,
skips chrome (`html`, `head`, `body`, `script`, `style`, `meta`, `link`, `base`,
`template`, `noscript`, `iframe`, `object`, `embed`) and anything inside
`svg`, `template`, `noscript`, or an editor overlay, and caps the index at 2500
elements.

Each entry carries:

| Field | Source |
|---|---|
| `projectId`, `frameId`, `baseRevision` | Request context |
| `baseHash` | SHA-256 of the exact frame HTML the selection was taken from |
| `elementId` | Authored `data-studio-element-id`; else `id:<dom-id>`; else `node:<hash(outerHTML)>`; a duplicated value degrades to `path:<hash(selector)>` |
| `selector` | `#id` when the id is a safe CSS identifier, otherwise a full `body > tag:nth-child(n)` chain used **only** to confirm the resolved node, never as the sole identity |
| `tag`, `role` | Live DOM |
| `label` | `aria-label`, first heading, trimmed text, `alt`, then tag; trimmed to 120 chars for chips |
| `signature` | SHA-256 of the element's own source bytes |
| `parentId` | Nearest ancestor identity, or `null` |
| `bounds` | Selection rect reported by the sandboxed frame, for the overlay only |

Resolution (`resolveStudioElement`) fails closed unless project, frame, revision,
`baseHash`, element id, selector-uniqueness, resolved-node identity, signature,
parent, tag and role all still agree. There is one candidate or none; similar text
or a similar selector never substitutes. Failure surfaces as
`STUDIO_STALE_REVISION` and the UI asks for re-selection. Sibling insertion does not
change any other element's id because ids derive from authored ids, DOM ids, or the
element's own bytes rather than `nth-child` position.

## Iframe security model

| Control | Implementation |
|---|---|
| Sandbox | `sandbox="allow-scripts"` only; no `allow-same-origin`, so the frame keeps an opaque origin (`event.origin === "null"`) and cannot reach parent storage or DOM |
| Referrer | `referrerPolicy="no-referrer"` |
| Script execution | All `script`, `iframe`, `object`, `embed`, `base`, `meta[http-equiv]`, `template`, `noscript`, `animate`, `set`, and `foreignObject` nodes removed; every `on*` handler stripped; `srcset` and event attributes dropped; only a single bridge script with the per-load channel nonce is injected |
| CSP | `default-src 'none'; script-src 'nonce-<channel>'; script-src-attr 'none'; style-src 'unsafe-inline' https://fonts.googleapis.com; img-src https: data:; font-src https://fonts.gstatic.com data:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'` |
| Form/navigation/popover isolation | `action`, `form`, `autofocus`, `popovertarget` removed; `submit` and `click` prevented in capture phase |
| Outbound protocol | `studio:element:select`, `studio:element:bounds`, `studio:element:clear` only, all strict Zod objects requiring `channel`, `projectId`, `frameId`, `baseRevision`, `baseHash` |
| Inbound commands | None. The parent never posts into the frame, so no HTML/JS command channel exists |
| Parent validation | `acceptStudioSelectionMessage` requires the exact `contentWindow` reference, origin `"null"`, a matching envelope, and a single known `elementId`; identical ids across frames/versions are rejected |
| Assets | Frame assets are resolved server-side from the owner's project rows; image references in patches must be `https:` or `data:image/(png|jpeg|webp)` |
| Export | Editor instrumentation (`data-ev-inspect-id`, `tabindex`, overlay nodes) exists only in the inspection response. `indexStudioElements` also excludes `[data-ev-editor-overlay]`, and persisted `studio_frames.html_code` is never rewritten by selection |

Bounds are reported in the frame's own CSS pixels; the iframe is rendered at the
frame visual width inside the existing scaled container, so the overlay shares the
same coordinate space without compensating for zoom/pan. Scroll and resize inside
the frame re-emit bounds through a single `requestAnimationFrame` slot. `bounds`
events update only the already-selected element; a new element requires an explicit
`select` event, so a scrolled frame cannot silently retarget the composer chip.

## Scoped edit contracts

Deterministic first, model second, fail closed:

| Intent | Contract |
|---|---|
| `remove` | Only an unambiguous remove/delete instruction with no compound verb (`dan`, `and`, `except`, `ubah`, `ganti`, …). Deletes exactly the resolved node |
| `text` | `ubah teks menjadi "<v>"` / `change text to "<v>"` (≤ 8000 chars) |
| `attribute` | `name ∈ {src, alt, title, aria-label}`; images validated by scheme |
| `replace` | Validated fragment ≤ 40 KB; rejects `html/head/body/doctype`, unsafe tags (`script`, `style`, `link`, `meta`, `base`, `iframe`, `object`, `embed`, `template`, `noscript`, `svg`, `math`), nested `[data-ev-editor-overlay]`, form/popover escapes, and any fragment whose parsing reparents surrounding content |

Anything else calls the model through the existing `ai-orchestrator` fallback chain
with a prompt containing only the selected element's source, its parent tag/siblings,
the design tokens extracted by `extractDesignSystemTokens`, and explicit
"change only this element" boundaries. The model must answer with one of the four
JSON edit kinds; the response is Zod-parsed and then applied through the same patch
engine, so an out-of-scope answer is rejected before any write. Unrelated frames are
never sent. A whole-document rewrite is impossible by construction: the input is
`beforeHtml`, the output is `beforeHtml` with exactly one node range replaced.

Sibling sections are preserved byte-for-byte because the patch splices the original
string at the resolved node's offsets instead of re-serializing the document.

## Persistence and revision behavior

`studio_element_revisions` (migration `drizzle/0048_studio_element_revisions.sql`)
stores one row per scoped request:

| Field | Meaning |
|---|---|
| `id` | Candidate identity used by Apply/Cancel/Undo and the preview dialog |
| `project_id`, `user_id`, `frame_id`, `frame_name` | Tenant and frame boundary |
| `request_id`, `request_hash` | Client idempotency key plus hash of prompt/target/edit |
| `base_revision`, `base_hash` | Optimistic-concurrency snapshot |
| `target` | Full `StudioElementTarget` snapshot, including bounds and label |
| `prompt`, `edit` | Instruction and the resolved structured edit |
| `status` | `generating → preview → applied \| cancelled`, or `rejected`; `applied → undone` |
| `before_html`, `after_html` | Candidate payloads; `before_html` is the exact base frame |
| `summary`, `error_code` | Factual user-facing copy and failure classification |
| `applied_revision`, `undo_revision` | Resulting frame revisions |

Flow:

1. Prepare locks the project row, verifies ownership, `baseRevision` + `baseHash`,
   rejects a frame with a queued/planning/generating job, resolves the target
   against persisted HTML, and rejects a changed `request_id` payload
   (`STUDIO_IDEMPOTENCY_CONFLICT`).
2. Generation writes `after_html` + `status: preview` only while the row is still
   `generating`; a cancelled row aborts the write (`STUDIO_CANCELLED`). Failures mark
   the row `rejected` and never touch the frame.
3. Apply/Undo re-verify base under `FOR UPDATE` plus the frame update's own
   `revision` + `html_code` predicate, then write `revision + 1` and append a
   `studio_revisions` row. Two concurrent candidates cannot both apply; the loser
   gets `STUDIO_STALE_REVISION` and its candidate stays `preview`.
4. Undo requires `applied` state, the applied revision, and `hash(after_html)` as the
   current base. It restores `before_html` as a new monotonic revision, never by
   rewinding versions, and refuses if a newer approval exists.
5. Cancel is idempotent, allowed from `generating`, `preview`, or `rejected`, and
   leaves persisted HTML untouched.
6. Duplicate Apply/Undo on an already-settled row returns the stored row instead of
   writing again.

Each transition writes one factual `studio_messages` entry per operation id, so chat
history shows preview/applied/cancelled/undone states without a second message per
attempt. Element revisions never touch `credit_operations` or
`credit_ledger_entries`: revision work is free under the existing credit policy, so
rejected, stale, cancelled, and duplicate candidates cannot bill anything.

## Composer and workspace integration

`useStudioElementEditing` owns the target snapshot, pending candidate, undo rail,
request identity in `sessionStorage`, and refresh sequence. A new selection
supersedes the multi-frame selection: the composer renders one chip
(`Layar / Label ×`) and hides frame-suggestion rows. Removing the chip clears only
the draft target; persisted HTML is untouched, and a pending preview stays reachable
from the preview panel. Selecting on the canvas opens the chat panel so the chip is
visible. When the frame revision moves, the hook detaches the target and asks for
re-selection rather than rebinding to the new version.

`StudioElementPreview` is a Radix dialog with a factual summary, side-by-side
`Sebelum` / `Usulan` inspection surfaces at the frame's visual width, and
`Batalkan` / `Terapkan`. It cannot close while an action is in flight; closing
without action cancels the candidate.

## Adopted UI components

| Source inspected | Decision |
|---|---|
| Existing EvVibe primitives | Reuse `Button`, `Dialog`, `Spinner`, `Icon`, composer chips, canvas controls, and chat panel |
| [shadcn Dialog](https://ui.shadcn.com/docs/components/radix/dialog) | Adopted the installed Radix dialog for focus trap, Escape, and modal semantics in the preview panel |
| [HeroUI](https://www.heroui.com/) | Chip-style target labels stay in the existing composer markup; no second chip primitive added |
| [Magic UI](https://magicui.design/docs/components) | Inspected `Compare`; it is an image-split slider, wrong for HTML before/after. Not adopted |
| [TUFFUI](https://tuffui.com/) | Approval/diff components inspected; existing dialog plus inspection iframes already express the apply decision |
| [React Bits](https://reactbits.dev/) | Animation catalog inspected; no motion runtime added for a confirmation flow |
| [Thinking Orbs](https://www.thinkingorbs.com/) | Status ornaments inspected; existing spinner covers the real pending state |
| [CUI](https://yappologistic.github.io/CUI/components/) | Native C component catalog; not a compatible React dependency |
| [SakaniUI](https://www.sakaniui.com/docs) | Separate token-driven design system; not introduced |
| Doop (`FrameView`, `frameBridge`, `layerEdits`, `PromptBar`) | **AGPL-3.0**. Interaction concepts only; no source copied, no license obligation triggered |
| OpenDesign (`comments/anchor`, `target-index`, `validate-save-target`, `edit-mode/bridge`) | Apache-2.0. Studied anchor validation and save-target checks; reimplemented on VibeDesign's own identity model |
| Onlook (iframe selection → source mapping) | Apache-2.0. Concept only; VibeDesign maps DOM → persisted HTML ranges, not to source files |

No new dependency was added for P10.

## Migration

`drizzle/0048_studio_element_revisions.sql`, its snapshot, and the journal entry add
the table with tenant/frame foreign keys (cascade on delete), the unique
`(user_id, project_id, request_id)` index, and the `(user_id, project_id, frame_id)`
index. Apply with `pnpm db:migrate` before running the updated app. No existing
frame, revision, message, or generated HTML is rewritten; the table starts empty and
legacy frames simply have no scoped history.

## Verification

Final targeted run: **5 files, 51 tests passed**, plus the existing frame-route suite.

```text
pnpm vitest run src/features/studio/tests/studio-element-bridge.test.ts src/features/studio/tests/studio-element-client.test.tsx src/features/studio/tests/studio-element-document.test.ts src/features/studio/tests/studio-element-http.test.ts src/features/studio/tests/studio-element-revision.integration.test.ts
pnpm vitest run src/features/studio/tests/studio-frame-route.test.ts
pnpm exec tsc --noEmit
pnpm biome check <touched files>
```

| P10 acceptance | Exercised evidence |
|---|---|
| Stable element IDs | Document unit: authored/generated ids survive unrelated sibling insertion |
| Target lookup | Document unit: index → resolve on the same base |
| Wrong frame IDs | Document unit: mismatched frame rejected |
| Stale versions | Document unit + integration: revision/hash mismatch → `STUDIO_STALE_REVISION` |
| Ambiguous selectors | Document unit: duplicated selector/id requires re-selection, never first match |
| Removing a section | Document unit: exact node removed, surrounding bytes identical |
| Preserving siblings | Document unit: text/replace patches leave siblings untouched; integration: other frame unchanged |
| No modification before Apply | Integration: preview writes no frame revision |
| Cancel behavior | Integration: cancel leaves frame + revisions untouched, in-flight cancel aborts without publishing |
| Undo / version restore | Integration: apply → undo yields monotonic revisions `[6, 7]`; undo after a newer approval refused |
| Target removed before revision | Document unit: removed/forged identity rejected |
| Multi-frame selection with one scoped element | Client: one scoped target wins over multi-frame selection; request snapshot captured |
| Unsafe HTML rejection | Bridge + document: scripts, handlers, embeds, `meta refresh`, unsafe fragments, scope-escape `<style>` |
| Invalid postMessage payloads | Bridge: wrong frame/project/revision/hash/channel/type/elementId/bounds, forged source, non-opaque origin |
| Cross-project authorization | Integration: cross-project and cross-user targets and transitions rejected |
| Concurrent frame revision conflict | Integration: only one concurrent candidate applies; in-flight conflict preserves approved HTML |
| Export excludes editor overlays | Integration: persisted HTML and export document contain no inspection instrumentation |
| No duplicate billing for rejected/stale | Integration: `credit_ledger_entries` empty after duplicate/stale/cancelled attempts |

## Known limits and explicit boundaries

- Pixel-perfect element targeting is **not** claimed. Bounds, scroll tracking, and
  overlay alignment are unit/bridge verified only; browser QA belongs to P13.
- Selection requires a frame with persisted HTML. Screenshot-only or
  generation-in-flight frames offer no inspection surface.
- Element identity survives content-preserving edits and sibling insertion, but a
  structural rewrite of the same element (new tag, new parent, changed bytes) makes
  an outstanding target stale by design; the user re-selects.
- The model path is bounded to one element's source plus tokens. Requests that
  genuinely need multi-section redesign must use the existing frame-level chat flow.
- `replace` accepts fragments, not stylesheet or script edits; destructive scope
  escapes are rejected instead of repaired.
- One candidate per frame at a time: a new prepare is refused while a job is active,
  and `assertStudioElementIdle` also blocks Apply while a queued generation exists.
- `studio-document-persistence-p5.integration.test.ts` exceeded the 5 s default
  timeout when 12 database-backed suites ran concurrently; it passes in isolation
  (2 tests, 3.5 s). That file is unrelated to P10 and was left unchanged.