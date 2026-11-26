# P11 Fix 02 — Implementation Report

## 1. Wheel gesture root cause and exact policy change

Root cause: `classifyWheelGesture()` in `src/features/studio/utils/studio-canvas-gesture.ts` guessed the input device from `ctrlKey`/`metaKey`, `deltaMode`, fractional `deltaY`, and `WHEEL_DISCRETE_NOTCH_THRESHOLD_PX = 40`. A large integer notch (`abs(deltaY) >= 40`) became `"zoom"`, so ordinary mouse scrolling and many trackpad flicks zoomed instead of panned. The native listener in `useStudioCanvasInput` then called `useCanvasZoom.onWheel()`, while smaller deltas took a separate pan path that normalized only one axis through `normalizeWheelDelta`.

Policy now:

- Studio uses one non-passive native listener. Ordinary canvas wheel is pan-only on both axes, independent of delta magnitude or camera scale. Pixel deltas are unchanged, line deltas use the existing line height, and page deltas use the canvas width and height, respectively.
- Ctrl/Cmd+wheel, events already consumed by descendants, and genuine scrollable or editable controls are not intercepted. Passive artboard selection buttons still count as canvas gesture surfaces. The workspace keeps its existing body scroll lock.
- A consumed cancelable wheel prevents default, interrupts any in-flight Focus animation at its current scale, and batches movement into one update per animation frame. Touch pinch remains available to the browser; Studio does not implement its own pinch zoom.

`classifyWheelGesture()`, `WheelGestureType`, `WheelGestureLike`, and `WHEEL_DISCRETE_NOTCH_THRESHOLD_PX` were removed after repo-wide reference checks. `useCanvasZoom.onWheel()` and `normalizeWheelDelta()` remain for the other canvases that use them.

## 2. Toolbar visibility root cause and fix

Root cause 1: `studio-canvas.tsx` gated `toolbarFrameId` on `frames.length === 1`, so the toolbar disappeared as soon as a second frame existed.

Root cause 2: the same gate used `!hasActiveGesture`, negating the function object rather than calling it. That condition was always `false`, independently of the frame count.

The toolbar uses the single selected frame ID, not project size. It requires resolved ready status and renderable HTML, and hides during Pencil ownership, a marquee drag, or hand panning. Marquee start/end are reactive even when the selected set is unchanged. Leaving Pencil clears its target without clearing the frame. Selecting a frame that happens to use another device no longer starts a Focus animation.

## 3. Selection-state stabilization

The workspace persists one ordered ID list per account and project and derives its single selection from that list. A passive HTML artboard keeps its own selection button and outline on the transformed frame, including while its isolated document loads, refreshes, or fails. Noninteractive status strips do not steal pointer hits; retry controls still handle their own clicks. The inert iframe neither receives a normal click nor dispatches it into the app. Shift-click and marquee remain additive.

## 4. Devtools inspector investigation

The installed `@tanstack/devtools-vite` transform emits `data-tsd-source="<path>:<line>:<column>"`; the installed TanStack Devtools client reads that attribute from the application DOM and renders its file-path highlight. This matches the reported overlay. No competing source-path inspector registration was found in the app or Vite config; the original browser's extensions and actual hotkey activation were not reproduced. This is not evidence of an exploit.

Source injection is active only on the Vite development server when `VITE_ENABLE_STUDIO_SOURCE_INSPECTOR=1`. Preview and all builds, including `vite build --mode development`, cannot enable injection. The production Devtools stripping plugin stays enabled; `src/routes/__root.tsx` already guards the Router/Query Devtools UI with `import.meta.env.DEV`.

For source debugging, opt in and restart Vite. The default inspector shortcut is Shift+Alt+Ctrl (Shift+Option+Command on macOS), and its label is an application source path. Pencil starts with the pencil tool or `E`, selects HTML inside an authorized generated frame, and never shows an EvVibe source path.

## 5. UI component reuse details

Reused `StudioFrameToolbar`, HeroUI `Tooltip.Trigger`, shared `Icon`/Hugeicons and `STUDIO_DEVICE_PRESETS` (1440 × 900, 768 × 1024, 390 × 844). The same six actions stay in a single vertical screen-space toolbar with 44 px controls, an active device state, Tab and arrow/Home/End navigation, and bounded scrolling on short viewports. The placement uses the full toolbar footprint and reserves the chat/launcher, tool palette and zoom bands.

- Device buttons reflow the same mounted HTML with no fetch, new job, revision, credit charge, chat reset or generation shimmer. Non-native buttons require renderer readiness.
- Focus uses the selected frame's geometry, accounts for panels and prioritizes a readable top-aligned view for tall frames. Reduced motion applies the camera immediately.
- Preview navigates to `/design/$id/preview` with the selected frame and device in validated search state.
- Refresh reads the project status first. A changed HTML revision triggers its normal read-only renderer request; unchanged HTML is explicitly refetched for the selected frame. The previous document remains until its replacement is ready. Refresh makes no mutation, creates no revision, and does not reset editing history.

## 6. Actual test outcomes

The initial regression run reproduced 10 failures across wheel input, toolbar context and geometry, and Vite registration. The HTML renderer failure regression separately showed that a ready frame lost its artboard selection button.

The final targeted Vitest run passed **267 tests in 21 files**. Coverage includes 3- and 5-frame fixtures, real workspace and toolbar components, HTML renderer lifecycle and viewport signals, all six actions, unchanged and updated committed revisions, reduced-motion Focus, and Vite plugin registration for development, preview, production build and build with development mode.

`pnpm exec biome check` passed on all 28 touched TypeScript files. `pnpm exec tsc --noEmit` returned exit 2 with the same six diagnostics as before the fix: `src/features/studio/services/studio-design-blueprint.ts:110` and `tmp-ai-debug.ts:9–11`.

No new TypeScript errors originate from the files changed here. No browser QA, Playwright, or live screenshots were run, per instruction. No commit, push, merge, or deploy was performed.

## 7. Remaining P12 browser verification needs

1. Use physical trackpads and mouse wheels on passive HTML and canvas background, with vertical, horizontal, diagonal and momentum scroll at min/max scale. Check that the page behind the canvas stays still and that chat, menus and genuine scrollable controls retain native scroll.
2. Use Ctrl/Cmd+wheel, trackpad pinch and touch pinch on representative browsers. Confirm a single native zoom response with no Studio pan or scale change, including interruption of a running Focus by an ordinary wheel gesture.
3. In 3- and 5-frame projects select first, middle, last, partially visible, newly revealed and tall frames. Check hit testing, outline alignment, Shift selection, marquee cancel/commit, hand pan, Pencil enter/exit and navigation back to the workspace.
4. Check toolbar placement with chat open and closed, resized desktop, short landscape and narrow viewports; check tooltip positioning, focus visibility, keyboard traversal and 44 px targets. Exercise every action including reduced-motion Focus, P10 frame/device return, and read-only Refresh after a committed edit.
5. In ordinary `pnpm dev`, check that `data-tsd-source` and file-path overlays are absent. Enable the opt-in, restart, and compare the expected source inspector with Pencil. If the original overlay persists without opt-in, repeat in a clean browser profile to isolate extensions.
6. Smoke-test the built production app with the flag set. Confirm that neither the devtools UI nor source-path attributes are delivered.
