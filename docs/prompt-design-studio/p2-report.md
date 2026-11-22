# P2 implementation report

## Ownership

Previously the frame prompt forbade authored chrome; Studio stripped duplicate model chrome and installed fixed platform bars, rendered legacy `ctaDestination` as a filled website action, and capped mobile composition at phone width on wide viewports. New plans use `compositionOwner: "model"`. Screen/destination mappings, contextual parents, current state, optional primary action and shared identity remain validated; the model owns chrome and component geometry. No mandatory header, sidebar, tab set or link count. Native HTML remains static; external component catalogs are not part of the runtime.

The existing structural diagnostics, card-wall check, theme precedence and bounded correction remain. Semantic frames receive shared variables, low-specificity containment and focus defaults without global card sizes, fixed mobile width, or page-level overflow hiding. Historical projects continue on the canonical path without migration; new committed documents are read directly by preview and export. Revision correction still preserves committed context.

## Photography

The existing planning request describes up to three photos per screen; no extra model request. The worker resolves independent screen slots concurrently. It reuses the DNS-pinned `fetchAsset` transport, scopes the API credential to search, rejects redirects, and validates result shape, query/alt relevance, provider URLs, MIME, bytes and JPEG dimensions. Stock is illustrative; exact brand, portfolio, book or person imagery requires a supplied asset. Existing logo/upload and committed-image paths retain precedence. No logo is inferred or auto-selected as stock.

Sources: [Pexels API](https://www.pexels.com/api/documentation/), [Terms of Service](https://www.pexels.com/terms-of-service/), [cache guidance](https://help.pexels.com/hc/en-us/articles/900006470063-What-steps-can-I-take-to-avoid-hitting-the-rate-limit). Configure `STUDIO_PEXELS_API_KEY` on the worker. Credit is linked beside each stock image. Cache search metadata for 24 hours, deduplicate in-flight lookups, and do not distribute standalone photo binaries in ZIP. Export lists the external dependency; the stock photo needs connectivity. Supplied local assets keep their existing bundling path. Pexels does not warrant third-party permissions.

The model positions named slots. Studio fills them with a verified image or a neutral, sized fallback with a recorded reason. Unknown image references are rejected rather than fetched. Capture revalidates the CDN response. An image removed by the provider after generation can still degrade a subsequent preview/export; there is no offline stock mirror.

## Performance and verification

One live CDN sample: JPEG 33,775 bytes, validated dimensions 650 × 650, 108 ms including transport and validation (separate transport-only call: 367 ms). Search used a controlled transport: no live search credential configured. Search and download share a 2.8-second per-lookup deadline; four candidates, at most one search retry on server errors, 12 distinct concurrent in-flight lookups. Photo failures do not consume correction attempts by themselves. Runtime logs measure photo resolution and prompt characters. Measured two-screen travel planning request: 17,382 system + 5,335 user characters; frame system: 13,452 characters. These are character counts, not tokens. First usable frame under 60 seconds and visual quality were not measured end to end. No browser QA in P2.

Targeted regression run: 76/76 across 13 files (semantic composition, canonical compatibility, provider and placement, planning, revision, export and transport). Additional integration run: 89/90 before restoring the explicit local asset-reference wording; the isolated affected suite then passed 27/27. The separate legacy navigation suite was not used as a clean result: its exact product-identity assertion expects no `layoutIntent`, which the pre-P2 normalization already supplies. TypeScript and targeted Biome check passed.

## Downstream phases

- P3: adaptive planning and photo intent for newly added journeys. P4–P5: chat presentation and contextual shortcuts, no renderer dependency.
- P6 and P9: shared responsive renderer and viewport switching. P7–P8: selection and editing against authored markup without canonical DOM assumptions.
- P10: connect semantic destination/action IDs to a safe prototype runtime. P11: actual browser, accessibility, design-diversity and live latency acceptance.
