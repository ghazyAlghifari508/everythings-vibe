# P10 Report — Interactive Prototype Viewer

Status: implemented and verified with non-browser tests. No browser QA in this phase, per `p10.md`; it is deferred to P11.

## Viewer architecture

```
Canvas toolbar Preview ──► /design/$id/preview?frameId&device&returnTo
                                   │ loader: ownership-checked shell (names, routes)
                                   ▼
                          StudioPrototypeViewer (session reducer, device, drawer)
                                   │ GET /api/studio/frame?prototype=1  (read only)
                                   ▼
        isolated document = committed HTML
            → manifest extraction (validated, reconciled)
            → shared isolation (scripts/handlers/embeds/forms stripped, CSP)
            → trusted runtime (nonce-tagged, the only script)
                                   ▼
        sandbox="allow-scripts" iframe ⇄ validated postMessage ⇄ parent
```

- The route is `/design/$id_/preview` (file `routes/design/$id_.preview.tsx`). `$id_` makes it a sibling, not a child, of the canvas route, so the canvas unmounts and Back is a normal navigation to `/design/$id`.
- Canvas camera, frame selection and chat draft already persist in their own per-project stores (`studio-canvas-view`, `selectedFrameIds` storage, `useStudioChatDraft`), so they are restored on return.
- The central area is the device only: no dotted canvas, composer, selection outline or inspection overlay.

## Interaction capabilities

Closed action set, validated by `studioPrototypeInteractionSchema`: `navigate`, `back`, `open_dialog`, `close_dialog`, `select_tab`, `expand`, `collapse`, `toggle`, `set_mock_state`, `filter_collection`, `validate_form`, `submit_mock_form`, `show_feedback`.

Generated HTML declares intent with inert `data-proto-*` attributes. It never carries scripts or handlers. The runtime provides:

- cross-page navigation by stable screen id and prototype-local Back history;
- dialogs with focus move, focus trap, Escape and focus restore;
- tabs with arrow-key navigation and `aria-selected`; disclosure with `aria-expanded`;
- accessible form validation (`aria-invalid`, `role="alert"` messages, `aria-describedby`, focus on first error);
- search and tag filtering over mock records with an empty state;
- mock checkout: required state (e.g. payment method), simulated delay, outcome, state change, navigation;
- shared mock state across pages through `data-proto-bind` / `data-proto-bind-input` / `data-proto-show-if`.

Not claimed: real payments, authentication, email, backend writes, or arbitrary JavaScript.

## Components adopted

| Need | Source |
|---|---|
| Desktop browser shell | Magic UI `safari` (registry JSON, adapted: children slot, pointer-transparent bezel) |
| Mobile bezel | Magic UI `iphone` (adapted: children slot; island/speaker removed so the shell never covers content) |
| Tablet bezel | eldoraui `ipad` registry SVG (rotated to portrait, screen punched through) |
| Device segmented control | HeroUI `ToggleButtonGroup` / `ToggleButton` (already used by VibeScrape) |
| Page list scrolling | HeroUI `ScrollShadow` |
| Compact page switcher | HeroUI `Drawer` |
| Refresh tooltip | HeroUI `Tooltip` (same pattern as the P9 toolbar) |
| Icons | Hugeicons through `@/components/ui/icon` |

Reviewed and not adopted: React Bits, Thinking Orbs, affectUI, TuffUI, CUI and SakaniUI expose no device mockup, so they were not needed. The mockup SVG fills use Magic UI's neutral greys, which sit inside EvVibe's monochrome palette; the surrounding chrome uses EvVibe tokens (`obsidian`, `graphite`, `steel`, `snow`, `fog`). No new dependency.

Files adapted from registries: `components/preview/device-safari.tsx`, `device-iphone.tsx`, `device-ipad.tsx`.

## Route structure

- Page: `src/routes/design/$id_.preview.tsx`. Search is validated by `studioPrototypeSearchSchema`; `returnTo` is resolved by `resolveStudioPreviewReturn`, which only ever returns that project's own canvas, so it cannot become an open redirect.
- Loader: `loadStudioPrototype` → `readStudioPrototypeShell`, filtered by `studio_projects.user_id`. An unowned or missing project reads as not found.
- Document: `GET /api/studio/frame?prototype=1&projectId&frameId&channel` handled by `readStudioPrototypeHttp`, wired ahead of the existing frame reads.
- The viewer keeps URL (`frameId`, `device`) in step with the sidebar via `replace` navigation.

## Page sidebar

`deriveStudioPrototypeScreens` lists only `ready` frames that have HTML. Identity is the frame id; the route is the planned primary destination, else a slug of the name, with a numeric suffix on collision. Never invents a page. A page removed while the viewer is open produces an honest notice and lands on a real page. Wide viewports show a right column; below `lg` the same list is a `Drawer`. Refresh and each load re-sync the list from the server, so new screens appear.

## Mock-state policy

- Prototype session state lives only in viewer memory (`reduceStudioPrototypeSession`), separate from production state; it is never persisted or sent to a server.
- Bounded: ≤ 40 keys, ≤ 200 chars per value, ≤ 4000 chars total, ≤ 50 history entries, ≤ 24 screens, ≤ 200 interactions.
- Values are string, number or boolean only. Fields detected as password, card, CVV, OTP, account number etc. are flagged `data-ev-sensitive`; the runtime never binds, stores or posts them.
- Refresh and reset: bumps a counter, clears state to the documented defaults, reloads the latest committed HTML, keeps page and device. No model call, no generation job, no credit, no stored revision, no write.

## Security boundaries

- `sandbox="allow-scripts"` only: no same-origin, forms, popups, top navigation or downloads.
- CSP per document: `default-src 'none'`, `script-src 'nonce-<channel>'`, `connect-src 'none'`, `form-action 'none'`, `frame-src 'none'`.
- Shared isolation with the element inspector (`studio-document-isolation.ts`): scripts, embeds, `on*`, `action`, `formaction`, `javascript:` URLs, remote stylesheets and `href`s removed; assets inlined from the owner's project only.
- Runtime is a closed `switch`: no `eval`, `Function`, `innerHTML`, `window.open` or location writes. Embedded strings are JSON with `<` escaped.
- Parent accepts a message only when source window, `"null"` origin, channel and screen id all match and the strict schema passes. The only parent→child message is a bounded `proto:init`.
- `data-ev-ix` / `data-ev-sensitive` already present in stored HTML are stripped before the manifest is built.
- The endpoint is read-only; ownership is enforced in the query.

## Generation integration

- New `prototype-interactions` reference and a `prototype` design-intelligence stage (own 3 600-char budget). `buildStudioFramePrompt` appends it to every frame request, so it does not grow the cached `frameSystem` prefix and the P1.1 size guards remain unchanged.
- `STUDIO_SYSTEM_PROMPT` no longer forbids interactivity wholesale. It still forbids scripts, handlers and automatic navigation, and directs the model to declare working controls with `data-proto-*`.
- Manifest is rebuilt from the committed HTML on every load. A direct edit, AI revision or deleted element therefore cannot leave a broken target: a dialog, tab panel, region, collection or form that no longer exists drops its interaction and reports `MISSING_TARGET_ELEMENT`.

## Legacy limitations

- Existing frames are not regenerated. Canonical navigation (`data-destination`, `data-studio-back`, `data-studio-action`) and `#screen` links are mapped deterministically to real screens (`legacyMapped`).
- `href="#"` links with no destination stay inert; the runtime says so ("Tautan ini belum terhubung") and the viewer shows a count.
- A frame with no interactions shows an explicit note that its static controls are inactive. Nothing claims historic static HTML became interactive.
- A link whose target page does not exist stays registered with `screenId: null` and reports unavailable instead of succeeding.

## Export compatibility

Standalone HTML/ZIP export is unchanged: committed static HTML only, no runtime, no `data-ev-ix`, no editor UI, no credentials. The ZIP `project-manifest.json` now carries `interactivity: { prototypeRuntime: false, note }` stating that cross-page navigation, dialogs, forms and mock state exist only in the VibeDesign viewer. Native behaviour (links, `<details>`, native controls) survives; `data-proto-*` markers stay inert.

## Behaviour change to P9

The P9 Preview button was honestly disabled until this route existed. It is now enabled by default and `routeAvailable: false` is the explicit opt-out; the toolbar still disables it without a handler. `StudioWorkspace` wires it to the route. The two P9 tests that pinned the "unavailable" default were updated to the new contract.

## Tests

`studio-prototype-contracts-p10.test.ts`, `studio-prototype-runtime-p10.test.ts` (jsdom, runs the real runtime script) and `studio-prototype-server-p10.test.ts` cover: screen identity and unknown targets, closed action schema and bounds, manifest registration, unknown actions, deleted-element reconciliation, legacy mapping, sensitive fields, session history/Back/reset/removed page, bridge sender/channel/schema rejection, device viewport and scale, return-path safety, dialogs, form validation, tabs, search/tag filter, mock checkout, no dynamic code in the runtime, JSON-safe embedding, ownership (unowned reads as not found), unready frames, invalid channel, revision change, legacy static frame, read-only DB (no insert/update/delete/transaction), and export cleanliness.

Not covered, by design: real browser rendering and pointer behaviour (P11).
