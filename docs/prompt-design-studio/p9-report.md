# P9 Report — Contextual Frame Toolbar

Status: implemented and verified. No browser QA in this phase, per `p9.md`.

## Component primitives

- `HeroUI Tooltip` + `Tooltip.Trigger<"button">` for every icon, matching the existing `StudioComposer` pattern.
- Hugeicons through the shared `Icon` wrapper: `ComputerIcon`, `Tablet01Icon`, `SmartPhone01Icon`, `CenterFocusIcon`, `PlayIcon`, `RefreshCwIcon`.
- Two semantic `<fieldset>` groups inside a `role="toolbar"`: device controls and frame actions. No new design system, no text labels in the canvas.
- Buttons are screen-space `size-11` targets outside the transformed canvas surface; zoom never scales them. Each button has `aria-label`, `aria-pressed` where applicable, keyboard focus styling, and `disabled` state.

## Viewport semantics

- Presets come from P6: desktop `1440×900`, tablet `768×1024`, mobile `390×844`.
- A device click only updates `frameDevices` (`sessionStorage`, keyed by user/project, pruned against existing frame ids) and passes `device` into the existing `StudioFrame` renderer. It never changes HTML, `revision`, generation jobs, credits, frame identity, or the renderer key.
- `resolveStudioFramePresentation` performs the real width change; non-native devices are disabled until the live renderer reports `phase === "ready"`, and P6's readiness gate still prevents an early swap.
- Layout is the existing flex artboard row, so a width change reflows siblings without changing frame ids or selection. Measured artboards feed bounds; before measurement the chosen device preset supplies bounds.

## Camera calculations

- `computeFrameScreenRect` applies the same `pan + padding * zoom` transform as the canvas surface.
- `computeFrameToolbarPlacement` picks the side with more room, respects the chat inset and right tool palette, clamps to viewport bounds, and recalculates on pan/zoom/resize.
- `computeFrameFocus` implements `focusFrame(frameId)`: centres one artboard within the usable band (chat, header, bottom and tool insets), clamps to min/max zoom, and keeps a `0.5` readable width floor for tall mobile frames with top alignment. `useStudioCanvasView` animates the camera with a cubic ease over `260 ms`, skips animation for `prefers-reduced-motion`, and cancels a pending animation on new focus/unmount.

## Positioning strategy

- Toolbar renders only for exactly one ready selected frame. It hides for multi-select, pencil/element mode, active element menu, active marquee/pan gesture, and unavailable frames.
- Root stops `pointerdown` and `keydown` propagation; canvas input already ignores interactive control targets, so a toolbar click cannot select a frame, pan the canvas, or submit chat.
- No permanent settings panel: six icons in two compact groups only.

## Refresh behavior

- `onRefreshFrame` bumps a per-frame `refresh` token included in `studioRendererKeyId` and calls `syncProjectStatus()`. The renderer refetches the latest committed HTML; a device change is explicitly excluded from the key.
- No AI request, credit deduction, revision creation, shimmer, frame reset, chat-draft clearing, or `window.location.reload()` — the previous workspace reload was removed from `StudioWorkspace`.
- `useStudioLiveDocument` keeps the active document until the incoming document is ready, so the last successful visual stays visible.

## P10 integration

- `buildStudioPreviewTarget` validates `{ frameId, device, returnTo }` with a strict Zod schema and builds `/design/$id/preview?...` with the authorized project id, selected frame, current device, and a return path to `/design/<projectId>`.
- No fake preview modal. `previewRouteAvailable` defaults to `false`, so the Preview action is honestly disabled. The P10 route was not found in `src/routes/design` or `src/routeTree.gen.ts` when checked with `rg`; no navigation is claimed.

## Targeted tests

Run: `pnpm vitest run` on the six new P9 test files plus `studio-renderer-p6.test.ts` — 7 files, 46 tests passed.

Covered deterministic invariants: toolbar placement/camera transform and safe-area bounds, focus zoom/pan and frame index, strict preview search contract, session device storage and pruning, renderer refresh token with device exclusion, six labelled icon buttons with active state, disabled non-native device controls before live readiness, honestly disabled Preview, and pointer/click isolation. P6 tests cover real device width changes and the no-early-swap gate.

`pnpm biome check` on all 21 touched files passed. `pnpm exec tsc --noEmit` passed.
