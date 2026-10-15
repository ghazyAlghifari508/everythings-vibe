# VibeDesign captured DOM preview

## Approved strategy

Use the persisted rendered HTML as a visual snapshot, not an interactive replay or screenshot. Keep original HTML separate for source, copy, and download. Remove original executable scripts and event handlers only in the ephemeral preview document. Preserve styles, images, fonts, responsive CSS, and signed resource capabilities.

## Evidence

Chromium loaded the live Framer homepage and its module responses. The main runtime module contains `import(n)`. The lexical rewriter deliberately leaves computed imports unchanged. When served at `/api/scrape/asset?cap=...`, relative module specifiers therefore resolve to `/api/scrape/<chunk>.mjs`, not the original CDN directory. A replay of the captured DOM reproduced two such requests and a sandbox localStorage failure.

The runtime shim also failed to recognize relative proxy URLs because its regex required two leading slashes in that branch. A DOM-executed regression test reproduced the nested URL before the fix. Server and runtime rewriting now share the same proxy guard.

Unknown runtime assets previously used unsigned `?url=` URLs. That route requires a session; opaque-origin iframe requests do not satisfy that ambient-auth contract. The visual snapshot neither runs website scripts nor installs that runtime fallback. Every rewritten visual resource uses an exact signed capability; nested CSS resources continue to be signed server-side.

## Browser comparison

One Chromium comparison used the same live Framer captured DOM and recorded asset bodies for replay and snapshot, at a 1440 × 900 viewport. Assets absent from the capture were retrieved in the test browser. This diagnostic is not an authenticated application E2E test and does not benchmark server proxy latency.

| Metric | Replay | Visual snapshot |
| --- | ---: | ---: |
| Requests | 164 | 21 |
| ScriptDuration | 1.197164 s | 0.002545 s |
| TaskDuration | 2.649657 s | 0.747045 s |
| JSHeapUsedSize | 38,246,004 bytes | 10,879,960 bytes |
| Invalid application module paths | 2 | 0 |
| Page errors | 1 | 0 |

These are one-run diagnostic measurements, not repeated performance benchmarks or total laptop RAM measurements. Both previews had 6,684 characters of rendered body text. The main heading rectangle was identical: x=120, y=164, width=721, height=108, opacity=1. Screenshot review confirmed visible navigation, heading, buttons, hero imagery, and typography; full-page pixel fidelity has not been established.

A static external website was also replayed: the snapshot issued zero requests and no page errors. Its visible text differed from replay; full visual fidelity for that site needs further investigation before treating that case as passed.

The static CERN World Wide Web page was subsequently compared: both strategies had 983 body-text characters, zero requests, zero page errors, and identical heading geometry. Snapshot TaskDuration was 0.057740 versus replay 0.073378 seconds in this one run.

The module-heavy `https://vite.dev/` was tested with the same diagnostic. Replay reported `Failed to construct 'URL': Invalid base URL`; snapshot had no page error. Both had 3,339 body-text characters and identical heading rectangles (x=41, y=197, width=400, height=134.40625). Requests were 40 versus 33; ScriptDuration 0.022490 versus 0.001991 seconds; heap 5,140,232 versus 3,202,184 bytes. TaskDuration increased from 0.320482 to 0.371411 seconds, so reduced requests/script execution do not establish universally faster rendering.

Chromium fixture integration also verifies four authorized module responses spanning relative static imports, export-from, literal dynamic imports, nested dependencies, and original `import.meta.url` resolution in an opaque-origin iframe. A separate browser case verifies that removed telemetry makes no request and a broken image produces degraded rather than empty readiness when text remains visible. Full repository tests passed (225 files, 2,168 tests) before these two additional browser cases; those cases passed separately. Typecheck and changed-file Biome checks passed. Production build passed with existing browser externalization and large-chunk warnings.

## State and security

Readiness checks visible text nodes, loaded images, SVG/canvas/video geometry, or background images in the initial viewport, excluding hidden ancestors. It bounds element scanning at 5,000 elements. Parent pings are bounded by the existing readiness constants. Empty roots and opacity-hidden content fail the browser contract; an original script that removes the body does not execute in the snapshot. Resource errors are limited to images/stylesheets; optional scripts do not mark visible content degraded. Fatal blank reports have a centered retry. Retry renews the preview and explicitly remounts the current snapshot, without a new scrape.

The iframe retains `sandbox="allow-scripts"` without same-origin. Snapshot CSP allows only the nonce-bearing application reporter to execute, denies connect/frame/object/form activity, and restricts visual resource destinations to the application proxy plus local data/blob media as appropriate. Capability validation, owner lookup, expiry, rate limits, MIME validation, size bounds, DNS/private-network validation, and redirect validation remain in the existing asset boundary.

## Remaining verification

- Authenticated application E2E, including full-resolution fonts/images through the actual proxy.
- Broader visual checks below the fold, canvas/video preservation, and responsive capture limitations.
- Readiness false-positive cases: decorative SVG, background-only content, transparent media, occlusion, and application-rendered fatal text.
- Source tab clears iframe srcDoc, stopping captured-document activity; returning to Preview restores the same iframe element with a new document. Component regression verifies this lifecycle; authenticated browser media verification remains outstanding.
- Repeat CPU/heap measurements and quantify long tasks.

Do not describe this verification as pixel-perfect or a completed end-to-end delivery.

Local authenticated QA reached `ERR_CONNECTION_REFUSED` on port 3000. The briefly started dev process was stopped at the user's request; no further dev server will be started. Headless Chromium diagnostic and fixture checks do not replace that application-level QA.
