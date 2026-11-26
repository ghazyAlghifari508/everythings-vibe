# P4 implementation report

## Components adopted

- HeroUI `Disclosure` (already a dependency): the "Lihat" result card.
- HeroUI `ScrollShadow` (already in use): conversation scroll area. No custom scroll system.
- HeroUI `Spinner` through the existing `@/components/ui/spinner`.
- Radix `Dialog` (already a dependency): the narrow-screen drawer, with focus trap, Escape and focus return.
- `react-markdown` + `remark-gfm` (already dependencies, same pair the PRD and codebase viewers use): assistant Markdown. `skipHtml` and `disallowedElements=["img"]` are set, and its URL transform drops `javascript:` and `data:` links, so no model HTML reaches the DOM.
- Hugeicons through `@/components/ui/icon`.

Browsed and not adopted: SakaniUI (AI chat block, chain of thought), affectUI (chat composer, thinking loader, message actions). Their chat blocks bring their own streaming and token systems; the existing composer, scroll area and disclosure already cover the need, and none fits the EvVibe theme without a rewrite. No new package was added.

## Root causes

| Symptom | Cause |
| --- | --- |
| Panel touched top/left/bottom, divider, canvas compressed | Desktop panel was a flex sibling `aside` with `border-r` and the canvas sat in a `flex-1` neighbour. |
| Opaque navbar and chat toggle in the header | `8c60bf9e` replaced the floating header (`pointer-events-none`, per-control surface) with `border-b bg-charcoal` and added the toggle. |
| "Anda — Diterima", "Design agent — Selesai", "DESIGN AGENT" | Hard-coded author and `statusLabels` row above every message plus a panel heading. |
| Full raw prompts, identical user/assistant look | `whitespace-pre-wrap` paragraph for both roles. |
| Job-status text | `describeStudioMessageProgress` returned strings such as "Rencana layar: ... 4 halaman selesai diproses". |
| Instant open/close | Desktop branch returned `null` when closed; no transition. |

## Conversation content strategy

`composeStudioAssistantContent` (`services/studio-conversation-content.ts`) replaces the job-status describer. It runs inside the existing `synchronizeStudioConversation` transaction, so it adds no request and blocks nothing.

- Initial turn: product, audience and scope rationale, visual direction, one bullet per screen from `screenPlan` (`composition.primaryTask` or `role`), navigation sentence from `navigationRole`, deferred scope when the plan recorded it.
- Add turn: purpose of the added screen from its blueprint entry, plus its parent or primary-navigation siblings.
- Revise turn: the requested change (quoted, sanitised) and the real outcome.
- Partial: names the screens whose frames or jobs actually failed (`progress.failedScreens`).
- Failure: factual recovery line only. Provider text, job `error` and `errorCode` are never read.
- Model- and user-authored text is stripped of Markdown/HTML syntax before interpolation.

Nothing is claimed beyond persisted data: no publishing, bank transaction, backend integration or research is ever mentioned. The planning response already carried the rationale and per-screen roles, so no second LLM call exists. Frame generation does not wait on narrative text.

`progress` gained optional `kind` and `failedScreens`. Rows written earlier parse unchanged and are rewritten on the next synchronisation.

## Layout and animation

- Header: transparent band, `pointer-events-none`, each control has its own translucent surface. The chat toggle is gone from it.
- Panel: `absolute top-[4rem] bottom-3 left-3`, width `clamp(320px, 28vw, 400px)`, `rounded-xl`, hairline border, `bg-obsidian/95` with `backdrop-blur-sm`. Canvas is `absolute inset-0` beneath it.
- Collapse control sits in the panel's upper right (`ArrowLeftDouble`). The reopen control is a separate floating button below the project menu.
- Transition: 200 ms opacity + 12 px translate with `transition-[opacity,transform,visibility]`, `motion-reduce:transition-none`. Drawer uses Radix `data-state` keyframes, disabled under `prefers-reduced-motion`.
- The desktop panel stays mounted while collapsed (`inert`, `aria-hidden`, `invisible`). Draft, attachments, expanded prompts, scroll position and in-flight polling therefore survive, and the canvas never remounts or regenerates.
- Narrow screens (< 1024 px): drawer dialog. Expanded prompts and scroll position live above the dialog so reopening restores them.
- The canvas opening view and Fit All accept a left inset equal to the panel width plus margins, so frames open beside the panel. Pan and zoom are untouched when toggling.

## Persistence

Messages remain in `studio_messages`; the stored user prompt is never altered (collapse is CSS `line-clamp`, verified by test that the full text stays in the DOM). Draft storage and request identity are unchanged. Expanded state is session UI state.

## Files

New: `studio-chat-conversation.tsx`, `studio-chat-markdown.tsx`, `studio-conversation-content.ts`, `studio-chat-layout.ts`, `studio-chat-message.ts`.
Changed: `studio-chat-panel.tsx`, `studio-workspace.tsx`, `studio-header.tsx`, `use-studio-chat-panel.ts`, `studio-canvas.tsx`, `use-studio-canvas-view.ts`, `studio-canvas-fit.ts`, `studio-conversation.ts`, `studio-conversation-progress.ts`, `studio-conversation.ts` types, `studio-constants.ts`, `styles.css`.

## Tests

`studio-chat-panel-p4.test.tsx` (floating contract, header, independent toggle, expand/collapse, short prompt, Markdown safety, no redundant labels, partial outcome, failure metadata), `studio-conversation-content.test.ts` (plan grounding, determinism, partial/failed honesty, sanitising, legacy rows), `studio-chat-message.test.ts`, `studio-chat-layout.test.ts`, plus an assertion in `studio-planning.integration.test.ts` that the reply names the planned screens and that model calls equal planning plus one per frame. Existing conversation, canvas, header and chat-workspace suites pass unchanged. No browser QA, as specified.

## Remaining limitations

- Result-card "Lihat" lists screen names; it does not scroll the canvas to a frame.
- Contextual next-action cards belong to P5 and are not added here.
- Replies are Indonesian-only copy, matching the rest of the Studio UI.
- Rows already stored keep their old text until the next job event or sync touches them.
