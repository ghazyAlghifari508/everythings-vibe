# P6 implementation report

Flicker is not claimed as visually eliminated. No browser QA was run, per P6; final verification belongs to the P11 browser suite.

## Confirmed flicker mechanism

Source-confirmed in `studio-frame.tsx` and the old `studio-element-surface.tsx`:

1. `inspectElement` selected one of two mutually exclusive branches, so entering Pencil **unmounted** the screenshot `<img>` and **mounted** `StudioElementSurface`.
2. `StudioElementSurface` started with `data = null` and only then fetched `/api/studio/frame?inspect=1`. For that whole fetch it rendered a `bg-obsidian` spinner (`Menyiapkan HTML terisolasi`) over a `bg-white` container.
3. After the fetch it mounted an `<iframe srcDoc>` with no readiness gate, so the iframe was visible while still blank (white) before styles, fonts and images landed.
4. The frame box was sized by the screenshot (`visual.width/height`), while the iframe was `size-full`, so any difference in document height showed as clipped or scrolling content.
5. Entering the tool refetched every time, because the effect keyed on `attempt`/`baseRevision` and reset `data` to `null` on each mount.

Pipeline differences found:

| Aspect | Screenshot capture | Old inspection document |
| --- | --- | --- |
| HTML source | `finalizeStudioFrameDetail` output | raw `frame.htmlCode` |
| Tailwind | CDN v3 runtime + brand colour tokens | server-compiled v4, no brand tokens |
| Lucide | runtime script executed | script removed, `data-lucide` icons empty |
| `vh` units | fixed 900/844 px viewport | iframe as tall as the frame |
| Readiness | fonts + `image.decode()` awaited | none |
| Lifecycle | cached asset per hash | refetched on every tool entry |

## Renderer architecture

```
Persisted HTML (frame.htmlCode, revision N)
        |
 /api/studio/frame?inspect=1   -> ephemeral live document (bridge, CSP, brand tokens, pinned vh)
        |
 useStudioLiveDocument          -> slots { active, incoming, failure }
        |
 StudioLiveSurface (one mounted iframe per pooled frame)
        |
   canvas (inert)  <->  inspect (interactive)      prototype: contract only, wired in P10
```

- `types/studio-renderer.ts`: modes, capabilities, device presets, readiness union, failure taxonomy, key, bridge message types.
- `utils/studio-renderer.ts`: renderer key id (project, frame, revision, HTML stamp, attempt, snapshot id), presentation resolver, notice resolver, bounded pool planner.
- `utils/studio-live-slots.ts`: pure double-buffer reducer.
- `hooks/use-studio-live-document.ts`: fetch lifecycle, ready timeout (15 s).
- `hooks/use-studio-live-pool.ts` + `StudioCanvas`: bounded pool.
- `components/canvas/studio-live-surface.tsx`: sandboxed iframes, message intake, selection overlay.
- `studio-element-surface.tsx` is now a thin wrapper over the same renderer for the revision before/after dialog, so history and canvas cannot drift.

Editor-only material (inspection ids, bridge script, CSP, `--ev-vh`, overlay node) exists only in the generated ephemeral document and the parent overlay. `buildStudioInspectionDocument` never writes back; the test suite asserts the persisted HTML is unchanged and contains none of it.

## Readiness contract

`idle -> loading -> ready | failed`. `ready` is reported by the trusted bridge only after `document.fonts.ready` and every image has loaded or errored. It carries `scrollWidth`, `scrollHeight`, `unresolvedAssets` (server + `naturalWidth === 0`) and `unrenderedIcons`. The visible layer changes only on `ready`:

- Entering Pencil flips `inert`/`pointer-events` on the **same mounted iframe**. No remount, no refetch (test: same node, same request count).
- The new document loads hidden and inert in the `incoming` slot. The old document stays visible until the new one is ready (revision change cannot blank the frame).
- The screenshot stays visible until the live layer is ready. Native device uses the screenshot's own height, so the swap cannot shift layout.
- No spinner or shimmer is shown for a completed frame entering inspection. A neutral status strip appears only for a real failure or limitation.

Prewarm: a selected, ready frame joins the pool and fetches its live document immediately, so Pencil does not pay the init cost on click.

## Responsive viewport strategy

Presets (`STUDIO_DEVICE_PRESETS`): desktop 1440x900, tablet 768x1024, mobile 390x844. Desktop and mobile equal the canonical capture widths, so the native device matches the screenshot.

- The iframe's real width is set to the preset; CSS media queries respond. A JPEG is never resized. A non-native device is adopted only once the live document is ready.
- Height follows measured `scrollHeight`, clamped to `STUDIO_CAPTURE_MAX_HEIGHT`. `onMeasure` feeds `Fit All`; siblings are laid out by the existing flex row, so a width change reflows neighbours instead of overlapping.
- Device is a `device` prop / `frameDevices` map. It is not in the renderer key, not in `frames`, and not sent anywhere: changing it makes no request (tested: request count unchanged, no job/retry URL).
- Legacy documents with poor responsive CSS: the bridge reports `scrollWidth`; if it exceeds the preset width the strip says `belum responsif pada <n>px ... HTML tidak diubah`. Nothing is regenerated.
- `vh` units are rewritten to `calc(n * var(--ev-vh))` with `--ev-vh` set by media query, so `min-h-screen` layouts match the capture instead of resolving against the page height.
- Device switcher UI and the toolbar are P9; P6 delivers the renderer API (`device`, `frameDevices`) only.

## Geometry

`utils/studio-renderer-geometry.ts` defines three explicit spaces: document (iframe CSS px, as reported by the bridge), artboard (iframe at scale 1, so document -> artboard is a clamp), screen (after canvas pan/zoom). Helpers: `clampStudioRectToArtboard`, `artboardRectToScreen`, `screenPointToArtboard`. Bridge bounds already reflect internal scrolling. The selection overlay lives inside the artboard, so the canvas transform scales it with the frame.

## Iframe isolation policy

- `sandbox="allow-scripts"` only: opaque origin, no `allow-same-origin`, no forms, popups, top navigation or downloads. `referrerPolicy="no-referrer"`.
- Server sanitizer unchanged and strengthened by the shared path: scripts, iframes, embeds, `base`, `meta[http-equiv]`, event handlers, `javascript:` URLs, form actions removed; CSP `default-src 'none'`, nonce-only script, `connect-src 'none'`, `form-action 'none'`.
- Messaging: opaque origin is `"null"`, which proves nothing alone. A message is accepted only if `event.source` is the tracked iframe window, `origin === "null"`, the strict Zod schema passes, and `channel` (per-document UUID), `projectId`, `frameId`, `baseRevision` and `baseHash` all match. Renderer and selection messages are separate schemas; a renderer message is never accepted as a selection and vice versa. No parent-to-child command channel exists.
- Only the nonce-authorized bridge runs. No generated script is enabled to support interaction.
- Per-document channels isolate sibling frames; a failure in one slot is local to it.

## Failure taxonomy

`html-unavailable`, `document-failed`, `bridge-timeout` are renderer failures only. Screenshot unavailable stays `visual-error` (existing). Asset failures are non-fatal counts. Renderer failures never touch `frame.status`; with a last-good preview the preview stays and a strip offers `Muat ulang tampilan` (bumps only the local attempt, no job). A screenshot failure with valid HTML recovers through the live document instead of regenerating.

## Resource management

Measured resource cost was not profiled in a browser (out of scope). Decision by bound: strategy B with bounded live pool. `STUDIO_LIVE_SURFACE_MAX = 3`; selected frames prewarm first, then recent on-screen frames. Frames reported off-screen by an `IntersectionObserver` (600 px margin) release their iframe and document; the inspected frame is pinned. Everything else stays a screenshot. Pool size is a constant to revisit after P11 measurements.

Known cost: a live fetch per pooled frame runs the server inspection build (jsdom + Tailwind compile). It is aborted on deselect and not repeated for mode or device changes.

## Component-first note

P6 adds no new control. The only visible UI is the existing `StudioFrameStatusStrip` and `StudioFrameRetryButton` (design-system `Button`), reused for the live-surface notice and reload action. The lifecycle is infrastructure; shadcn, HeroUI, Magic UI, React Bits, Thinking Orbs, affectUI, TUFFUI, CUI and SakaniUI were not browsed or adopted because nothing new was drawn, and no loading animation was added (no spinner or shimmer for a completed frame entering inspection). The device switcher control is P9 and will evaluate those libraries then.

## Asset invalidation

Frame HTML references assets by id, so an asset swap on a frame changes the HTML stamp and therefore the renderer key. Uploading an unrelated asset does not change the document and correctly does not reload it.

## Known limitations (reported, not hidden)

- Live Tailwind is the server-compiled v4 build, not the CDN v3 runtime used by capture; brand colours are shared, but pixel parity is unverified until P11.
- Lucide icons are not drawn in the isolated document; the strip reports the count (`unrenderedIcons`).
- Prototype mode is a contract entry only; its behaviour is P10.
- No device switcher UI (P9).

## Impacted files

New: `types/studio-renderer.ts`, `utils/studio-renderer.ts`, `utils/studio-live-slots.ts`, `utils/studio-renderer-geometry.ts`, `services/studio-live-viewport.ts`, `hooks/use-studio-live-document.ts`, `hooks/use-studio-live-pool.ts`, `hooks/use-studio-frame-renderer.ts`, `components/canvas/studio-live-surface.tsx`.
Changed: `studio-frame.tsx`, `studio-canvas.tsx`, `studio-element-surface.tsx`, `studio-element-preview.tsx`, `studio-element-bridge.ts`, `studio-element-inspection.ts`, `studio-element-http.ts`, `tests/studio-canvas-zoom-p5.test.tsx` (stale hook mock aligned with the real hook contract; assertions unchanged).

## Tests

- `studio-renderer-p6.test.ts`: key invalidation and device exclusion, double-buffer retention, stale ready/timeout ignored, presentation (real width, no pre-ready swap, height clamp, screenshot-failure recovery), notices.
- `studio-renderer-pool-p6.test.ts`: bounded pool, pinning, offscreen release, frame isolation, zoom/pan round trip and clamping, `vh` pinning.
- `studio-renderer-document-p6.test.ts`: persisted HTML untouched, overlays excluded, unresolved assets/icons, sandbox sanitization, bridge authorization matrix, legacy HTML.
- `studio-live-surface-p6.test.tsx`: screenshot retained while iframe hidden/inert, same iframe node and request count on tool switch, no iframe outside the pool, sandbox attributes, no request on device change, renderer failure leaves frame status and retry untouched.
- `studio-element-bridge.test.ts` and the frame/canvas suites pass unchanged.

No browser QA, headless visual checks or Playwright were run.
