# P12 — Browser QA Report

**Scope:** Real-browser acceptance for the VibeDesign Studio surface, covering the
requirements transferred out of P11 (`p12.md` §2) and the P11 Fix 01–06 claims.
**Branch:** `feature/vibedesign-design-studio`
**Date:** 2026-11-25 (local +07).
**Verdict:** Browser QA completed for the observed surfaces; **five product defects were found and fixed** (§5). The result is **not a full acceptance pass**: the 60-second frame target was missed, Journey 1 produced one of five frames, and physical trackpad gestures, several Markdown nodes, and uploaded imagery remain unverified. One browser accessibility advisory remains (§7). No claim of zero bugs or complete acceptance is made.

---

## 1. Method

### 1.1 Environment

| Component | Value |
|:--|:--|
| App server | `vite dev --port 3001` (own instance, `NINE_ROUTER_URL` from `.env.local`) |
| Studio worker | `pnpm studio:worker` (separate process, `STUDIO_DEBUG_ISSUES=1` during diagnosis) |
| Database | local PostgreSQL `novaplan` (real ledger, real frames) |
| Browser | Google Chrome (headless new) launched by the QA harness with a dedicated `--user-data-dir` and a DevTools protocol port; viewport 1440×900 for canvas work, 762×484 for the first pass |
| Auth | signed `better-auth.session_token` for the project owner, same HMAC scheme as `e2e/project-delete.spec.ts` |
| Model gateway | `prdfy-combo` on `NINE_ROUTER_URL` |

The session's MCP `chrome-devtools` server could not launch (its shared browser
profile is held by another concurrent browser-QA session: *"browser profile in
use by another instance"*). A second, isolated server entry
(`chrome-devtools-qa`, `--isolated`) was added to `~/.omp/agent/mcp.json` so
future sessions cannot collide; this session drove its own Chrome instance over
the same DevTools protocol instead. Every observation below comes from that real
browser: DOM state, network requests, console, and screenshots in
`docs/prompt-design-studio/p12-evidence/`.

### 1.2 Provider evidence (verbatim)

The gateway combo was quota-blocked for the first hour of the session:

```
[antigravity/gemini-3.8-flash-high] [429]: Individual quota reached. Please upgrade
your subscription to increase your limits. Resets in 135h42m35s. (reset after 107h 23m 15s)
```

Jobs failed honestly with `STUDIO_PROVIDER_RATE_LIMITED` → "Rencana layar belum
berhasil disusun. Coba lagi." To keep the QA running during the outage, a
throwaway model-rewrite proxy (`.p12-qa/model-proxy.mjs`, never deployed, removed
afterwards) pointed the combo at reachable routes. Findings from that phase are
recorded with the model named; they are *not* product defects:

- `tokenharbor/deepseek-v4.1-flash:free` — planning contract passed standalone
  twice, frame output hit the 12,000-token ceiling (`finishReason: "length"`,
  `ceilingReached: true`) → honest `INCOMPLETE_OUTPUT`.
- `cf/@cf/openai/gpt-oss-120b` — planning JSON truncated mid-object (parse
  rejected).
- `cf/@cf/meta/llama-3.3-70b-instruct-fp8-fast`, `gh/gpt-5.4-nano`,
  `tokenharbor/mimo-v2.6-flash:free`, `n/ngodeai/deepseek-v4.1-flash-1017` —
  probes only (verbosity/JSON adherence), not used for acceptance.

The owner then repaired the combo; `prdfy-combo` answered as
`gemini-3.8-flash-n` for all acceptance runs below.

---

## 2. Requirement-by-requirement verdict

Legend: **PASS** = observed in the browser and matching the requirement;
**PARTIAL** = observed with a documented gap; **BLOCKED** = not observable in
this environment, with the reason.

### 2.1 HTML-first renderer

| Requirement | Verdict | Evidence |
|:--|:--|:--|
| First frame is real HTML, not a JPEG/screenshot | **PASS** | Legacy project `f595b052`: 5 `iframe[data-testid="studio-live-document"]` with `srcdoc` 84,345 / 94,701 / 72,194 / 61,304 / 64,757 chars. Model-owned project `39199f74`: ready frame rendered from `srcdoc` 70,779 chars. No `<img>`-as-screenshot artboard anywhere. |
| No authored script or unsafe URL survives into the preview | **PARTIAL** | The generated frame content audited in DevTools had no event-handler attributes or unsafe URLs. The preview `srcdoc` contains one Studio-injected Pencil message-bridge script and uses `sandbox="allow-scripts"`; therefore the runtime preview is not script-free. Exported HTML contained 0 `<script>` tags. |

### 2.2 Canvas, toolbar and trackpad

| Requirement | Verdict | Evidence |
|:--|:--|:--|
| Canvas pan/zoom and frame selection with mouse and trackpad | **PARTIAL** | Mouse wheel pan/zoom policies, Ctrl+wheel, single/Shift selection, and marquee were exercised. Physical trackpad pinch/two-finger gestures could not be synthesized, so trackpad gesture acceptance remains unverified. |
| Frame selection (single, shift-additive, marquee) | **PASS** | Click selects one frame (`aria-pressed=true`, toolbar appears); marquee drag from empty canvas selected the 3 intersecting frames and cleared the previous single selection; Shift+click toggles a frame in/out of the ordered set. |
| Toolbar actions apply to the selected frame only | **PASS** | "Desktop 1440 × 900 untuk Detail Paket" reflowed only that frame (195 px → 720 px at 0.5 scale = 1440 CSS px) and issued **0 network requests** (no fetch, job, revision or credit). Toolbar `aria-label` always names the selected frame (`Kontrol frame <name>`). |
| Frame result cards open the correct canvas frame with a truthful preview | **PASS** | Clicking "Tiket Saya, Mobile UI. Buka di canvas": selection moved Profil→Tiket Saya, toolbar relabelled, camera moved `translate(-207,16)@0.35` → `translate(-439.5,16)@0.5`; rows with no preview show a neutral placeholder, never a fabricated image. |
| Toolbar hidden while Pencil/marquee/pan owns the pointer | **PASS** | Entering Pencil removed `[data-testid="studio-frame-toolbar"]` from the DOM and mounted 5 editor overlays. |

Physical trackpad pinch, two-finger momentum and touch pinch were not synthesized;
only wheel deltas for pixel/line modes and the Ctrl+wheel policy were exercised.

### 2.3 Pencil and editing

| Requirement | Verdict | Evidence |
|:--|:--|:--|
| Annotations/edits scoped to the intended frame | **PASS** | Editing "Alamat Email E-Tiket" in frame *Profil* changed only that row: revision 1→2, `html_code` 43,503 → 43,505 chars; the other four frames kept byte-identical HTML and revisions. |
| Revisions preserve committed content, credits and stable screen ids | **PASS** | Only the single source range changed; the durable undo restored the exact previous HTML (revision 3, 43,503 chars, old string back at offset 27,960). Frame ids and order unchanged. |
| Failed/partial revisions report honestly and never overwrite newer work | **PASS** | Draft text typed into the frame is not persisted until commit (Enter only inserted a newline; committing on blur published the change). Stale/expired toast never reported success after the operation had already been superseded; the durable entry lives in *Menu project → Riwayat revisi*. |
| Undo affordance | **PASS** | Toast “Teks diperbarui”, **Undo**, close; after the 6 s timeout the same action remains as “Undo revisi elemen: Profil” in the project menu and restored the previous revision. |

### 2.4 Chat explanations and result cards

| Requirement | Verdict | Evidence |
|:--|:--|:--|
| Explanations grounded in real screens; no invented research/publication/payment/auth claims | **PASS** | Explanations name only committed screens and their facts ("Jurnal Studi Kasus Pernikahan: Meresapi alur visual utuh dari pernikahan Arya & Maya di Pine Hill Lembang"), plus an explicit prototype disclaimer. No claim of live payment, authentication or delivery; prices are labelled `Contoh` / “contoh.id”. |
| Operational status separate from explanatory content | **PASS** | “Selesai” rows and “1 layar perlu dicoba ulang” are rendered as `<output>` status rows below the result card, not inside the explanation paragraphs. |
| Single-screen, multi-screen, add-screen, revision, failed and partial jobs distinguishable | **PASS** | Observed “4 layar dibuat”, “1 layar dibuat” and “2 dari 3 layar dibuat” with per-row `Web UI · Belum berhasil` / `Web UI` states and a failure sentence naming the failed screen (“Beranda & Narasi Studio belum berhasil diproses. Pulihkan dari canvas; layar yang sudah selesai tetap tersedia.”). |
| Safe Markdown: paragraphs, lists, bold, headings, inline code, links; no unsafe HTML | **PARTIAL** | Rendered turn contained 9 `<strong>`, 5 `<ul>`, 9 `<li>`, 1 `<h3>`, 0 `<script>`, 0 raw-HTML/iframe injection inside messages. No inline `code`, `pre`, blockquote or link appeared in the generated copy during this session, so those node types were not observed (they are covered by unit tests, not by a browser observation). `hr` is intentionally dropped. |
| Long messages keep the composer in view; original prompt recoverable | **PASS** | Chat scroller 1,908 px high inside a 614 px pane; the composer stayed at `y=814` (bottom 862 < 900) at both scroll extremes, and the original user prompt is a collapsible message at the top of the turn. |
| Concurrency: stale updates cannot replace newer explanations; no duplicate rows after reload | **PASS** | Reload produced the same 5 result rows and the same two headings (no duplication). Stale-worker protection is a deterministic contract (unit/integration tests); no browser counter-example was observed. |

### 2.5 Vertical suggestions and composer

| Requirement | Verdict | Evidence |
|:--|:--|:--|
| Suggestions in the intended vertical flow, submitting the correct prompt | **PASS** | Two chips stacked vertically above the composer. Clicking “Uji validasi data kontak yang belum lengkap” filled a scoped revision prompt naming the selected frame (“Pada layar Profil untuk Jelajahin… Pertahankan navigasi, warna, tipografi, header, dan komponen yang sudah ada.”), enabled submit, and did **not** auto-send (URL unchanged). |
| Composer usable while jobs run; queued message not overwritten by frame progress | **PASS** | While a job was generating frames, the workspace composer accepted text, the send button enabled, and frame-progress updates did not touch the draft. |
| No extra credit charge for displaying explanations | **PASS** | Ledger sum for the account was `-220` before opening/reloading chat panels and `-220` after; opening, scrolling and re-reading explanations performed no ledger write. |

### 2.6 Design generation and photography (Fix 06)

Acceptance sample: `39199f74` — “Kalyana Studio: Portofolio Fotografi Pernikahan
Bandung”, model-owned blueprint, 3 planned screens, **2 ready frames**.

| Requirement | Verdict | Evidence |
|:--|:--|:--|
| Navigation follows the product journey (no mandatory Beranda/Home tab; detail/checkout/confirmation not promoted) | **PASS** | Planned destinations: “Beranda & Narasi” (primary), “Cerita Pernikahan”, “Temu Konsultasi” — journey-derived, three primary links because the brief has three primary destinations, no invented Home/Profil tab. Mobile Jelajahin plans were “Jelajah Destinasi → Detail Paket Wisata → Formulir Pemesanan → Pembayaran Paket → Tiket Saya” with parents derived from the flow. |
| No forced navbar, hero, KPI row, card quota, back-bar or fixed header-action count | **PASS** | Ready frame: 0 occurrences of KPI/MRR/churn/dashboard; 6 `<section>` editorial blocks, `h1` “Hening Pinus & Janji Arya Bersama Maya”; no card-wall composition. Finance/analytics defaults were not injected into a narrative brief. |
| Search controls filter a real collection or are absent/disabled | **PASS** | Portfolio frames contain no search input; the mobile travel plan carries the search binding contract (`data-proto-action="filter_collection"` + `data-proto-collection`) enforced by the semantic validator. |
| Sample names, prices, dates, currency, statuses consistent across screens and visibly illustrative | **PARTIAL** | Blueprint `sampleData` (`IDR`, `D MMMM YYYY`, dates 14 September 2024 / 28 Oktober 2024 / 15 Februari 2025) reused verbatim in frames; legacy project shows one package (Bali Escape 4H3M, Rp3.900.000) and one booking code (JLHI-8X42KI) across Detail Paket / Pemesanan / Tiket Saya, with `Contoh` labels on illustrative fields. Finance frame keeps one currency format (`Rp 1.630.100.000`, dot grouping) and the declared statuses (`Menunggu Persetujuan`, `Lunas`, …) but renders the table period labels as `Per 31 Okt 2024` while quoting the same dates as `31 Oktober 2024` elsewhere in the frame — same values, two month spellings against the declared `DD MMMM YYYY`. Recorded as a minor deviation, not a data inconsistency. |
| Approved photography resolved into the planned slot with ratio, cropping, alt text, attribution | **PASS** | Ready frame: 2 slots filled with resolved Openverse/Flickr photos (`live.staticflickr.com/...`), `object-fit:cover`, `width/height`, planned alt text, and visible credit “Foto: Tejal Patel · Openverse — CC BY 2.0” linking source + licence. |
| Provider failure → honest fallback text, never SVG/gradient impersonating a photo | **PASS** | The third planned slot (`heirloom-rings`) resolved to **no** image and renders “Foto tidak tersedia” inside the slot with 0 `<svg>` and no CSS background substitute. |
| User-provided imagery remains usable | **PARTIAL** | The browser run found no unapproved image references, but did not upload or use a user-provided logo/reference image. Usability of uploaded imagery is unverified. |
| Legacy canonical projects keep their shell; model-owned projects keep model chrome | **PASS** | Legacy `f595b052` (no blueprint) still renders the canonical shell with its 5 destination labels; model-owned `39199f74` renders its own 3-link chrome. The scenery substitute rule is gated to `compositionOwner === "model"`. |

Chrome DevTools reported one accessibility issue on the generated travel frame:
its disabled search input has an `aria-label`, but no `id` or `name`. It is not a
JavaScript console exception and the input is disabled, but the markup issue remains.

---

## 3. Representative journeys

### Journey 1 — Jelajahin mobile (domestic travel booking, “Gunakan foto destinasi asli”)

Project `fff7e4f0` (mobile, 301-char prompt). Planning produced the intended five-screen
journey with no Home tab. After a real browser retry through the frame's **Coba lagi**
action, *Jelajah Destinasi* became a committed HTML frame; the other four frames did not
complete in this run. Browser preview showed two resolved Openverse photos with visible
attribution, one provider-unavailable photo slot with honest fallback text, a disabled
search input, and primary navigation limited to “Jelajah” and “Tiket Saya”. The canvas
continued to display honest frame-specific errors for the remaining screens.
**Result: PARTIAL (1/5 frames ready); the ready frame's observed Fix 06 contracts pass.**

### Journey 2 — Public website / portfolio

Project `39199f74` (“Kalyana Studio: Portofolio Fotografi Pernikahan Bandung”).
Partial success after the §7 fix: 2 of 3 frames ready (48,369 / 48,444 chars),
one failed. Narrative composition verified (hero + story + gallery, no
dashboard/KPI defaults, no plain card wall), photography resolved with
attribution and one honest fallback slot, chat explained “2 dari 3 layar dibuat”
with the failed screen named.
**Result: PARTIAL (2/3 frames) — requirements observed on the ready frames pass.**

### Journey 3 — Finance workspace

Project `c3f94438` (“FinBook: Internal Finance & Treasury Workspace”, web, 199-char
prompt). Planning produced task-appropriate screens rather than marketing chrome:
*Buku Kas & Transaksi*, *Input Transaksi Baru*, *Ringkasan Saldo & Kategori*,
*Ekspor Laporan Bulanan*. One frame reached `ready` (47,872 chars) during the
session; the others were still generating when the QA window closed.

Observed on the ready frame:
- 2 real data tables with scoped headers (`Pos Kategori / Realisasi (IDR) / Porsi`;
  `Bulan / Periode / Pemasukan (Kredit) / Pengeluaran (Debit) / Arus Kas Bersih (Net) / Status Audit`),
  12 rows, 0 scripts, 0 decorative image.
- Atomic currency grouping across every amount (`Rp 1.630.100.000`, `Rp 113.400.000`,
  `Rp 21.150.000`); no mixed separators.
- Workflow status labels that reflect real conditions (`Sehat Likuid`, `Mendekati Pagu`,
  `Sesuai Pagu`, `Terkendali`, `Menunggu Persetujuan`) instead of decorative badges.
- One deviation: period labels read `Per 31 Okt 2024` while the same dates appear as
  `31 Oktober 2024` elsewhere in the frame (§2.6).

**Result: PARTIAL (1 of 4 frames ready) — composition, currency grouping and status
labels pass; date spelling is a minor deviation.**

### Journey 4 — Revision and export

Revision exercised on `f595b052` (Pencil → Edit Text → commit → durable undo, §2.3)
with a resolved-photo project revision left to Journey 2/3 output; export
exercised on the same project (ZIP audit, §2.1). Credits and dependencies still
resolve: balance unchanged by explanations, export manifest lists the two font
hosts and marks the bundle not offline-ready.
**Result: PASS for revision/export mechanics; photo-frame revision BLOCKED with
Journey 1.**

---

## 4. Performance and honesty

| Measurement | Value |
|:--|:--|
| Target: first valid, visibly rendered HTML frame < 60 s | **NOT MET** |
| Jelajahin submit → frame valid pertama (`frame-visible`) | 21,003,694 ms (5 h 50 min 3.694 s) from the original job creation; includes queueing and unsuccessful earlier attempts. |
| Final retry job queue wait | 8,254,459 ms (2 h 17 min 34 s) before worker acquisition. |
| Final retry job total | 245,665 ms (4 min 5.7 s); includes one correction round. Still exceeds target. |
| Final retry frame prompt size | system 14,116 chars; initial user request 19,509 chars; correction request 41,302 chars. |
| Final retry frame output | 28,591 chars on attempt 1; 28,363 chars on corrected attempt 2; validation passed on attempt 2. |
| Photo resolution during that job | Three parallel slot events: 595 ms, 640 ms and 1,647 ms; two resolved and one returned `provider-unavailable` with honest fallback. |
| Other measured journeys | `39199f74` submit → first ready frame 1,554 s; retry burst 147 s. Frame prompts 18,310–20,762 user chars in the earlier acceptance runs. |
| Planning prompt (earlier measured journey) | system 17,387 chars; user request 6,483 chars. |

The successful Jelajahin frame required a second generation attempt after the first
output failed HTML validation. The original queued job also accumulated 2 h 17 min of
queue wait. All timings and prompt sizes above come from the browser's `frame-visible`
event and worker structured events; no timestamps were changed. The 60-second target
remains unchanged and is **not met**, including on the corrected retry alone.

---

## 5. Defects found and fixed

### D1 — Model-authored font stylesheet rejected as an unapproved image channel

**Repro:** model-owned project whose frame links the design-system font
(`<link href="https://fonts.googleapis.com/css2?family=...`), as the canonical
shell does. Validation fails with
`photo-contract: Use standalone CSS; external stylesheets cannot introduce unapproved images.`
even though the frame places every photo slot correctly.

**Cause:** `applyStudioPhotoSlots()` rejects any `<link rel="stylesheet">` without
`data-studio-font`; only the header injected by `enforceDesignSystemOnHtml()`
carried that marker, and a model-authored font link was never normalised.

**Fix:** `studio-design-system-html.ts` now marks stylesheet links whose href is
the sanctioned font host (`fonts.googleapis.com`, the host of
`CanonicalDesignSystem.typography.googleFontUrl`) with `data-studio-font="1"`.
Any other external stylesheet still fails the contract.

**Test:** `studio-photo-placement.test.ts` — font link rejected before
normalisation, accepted after, unrelated host still rejected.

**Browser effect:** `39199f74`'s frames moved from `failed` to `ready` after the
fix (two committed frames, see §2.6).

### D2 — Contract complaints collapsed into `UNCLASSIFIED` in structured logs

**Repro:** worker log for a rejected frame showed
`issueCodes: ["UNCLASSIFIED","UNCLASSIFIED",…]` with `hardCount: 0`, hiding which
Fix 06 contract actually failed.

**Cause:** `studioIssueCode()` had no pattern for the semantic-navigation and
photo-contract messages added in P11 Fix 06.

**Fix:** added patterns for duplicate project chrome, unplanned/duplicate
destination, current-destination mismatch, unbound search, missing landmark,
missing logo, planned-photo-slot missing/duplicate, unapproved image, external
stylesheet and carousel-shrink.

**Test:** `studio-design-intelligence.test.ts` — “classifies the
semantic-navigation and photo-contract complaints”.

### D3 — Hydration mismatch on every Studio workspace with a saved viewport preset

**Repro:** open a workspace whose frame carries a persisted device preset (set
“Desktop 1440 × 900” on one frame, reload). The browser console reports four
`A tree hydrated but some attributes of the server rendered HTML didn't match`
errors; the diff names the frame artboard:

```
+ style={{width:1440,height:900}}
- style={{width:"390px",height:"844px"}}
```

**Cause:** `useStudioFrameDevices()` read the session storage map inside the
`useState` initializer, so the first client render used the stored preset while
the server markup used the frame's native device — the two trees disagree on the
artboard size.

**Fix:** the hook now starts from an empty map and adopts the stored map in the
existing mount effect (`loadedKey` guards the write effect so the empty map can
never overwrite the preference). The first client render matches the server; the
preset applies immediately after mount.

**Test:** `studio-frame-devices-hydration.test.tsx` — `renderToString()` output
contains no stored preset, the preset applies after mount, and the following
write still persists.

**Browser effect:** reload of the same workspace now reports **0 JavaScript console errors**
(the `Detail Paket` frame still re-renders at 1440 px from its preset), and the
38 tests of the canvas/toolbar selection suites still pass. Both generated
projects (`39199f74`, `c3f94438`) were reloaded afterwards with the console cleared:
**0 JavaScript console errors each**. The only remaining console output is the
pre-existing TanStack Router bundle-split advisory for `bantuan.tsx`, `templates.tsx`
and `plan/index.tsx`, outside Studio. The later Jelajahin retry produced no JavaScript
console exception, but Chrome DevTools flagged its disabled search field for missing
`id`/`name` (§2.6).

### D4 — Provider no-progress watchdog timeout was not preserved through retry classification

**Repro:** when the 120-second no-progress watchdog fired during a Studio stream,
`streamChat()` emitted a generic `Error`. `tryStreamWithFallback()` then wrapped the
provider error, and downstream retry/error classification could lose the timeout type
because it inspected only the wrapper.

**Fix:** watchdog stall and total-deadline errors now carry `name = "TimeoutError"`;
the orchestrator retains the last provider error as `cause`. Studio's retryability and
public error classifiers inspect a bounded cause chain so wrapped provider timeouts
remain retryable and surface as `STUDIO_PROVIDER_TIMEOUT`, distinct from the Studio job
lease timeout.

**Regression coverage:** `ai-client.test.ts` advances fake timers through the 120-second
watchdog; `ai-orchestrator.test.ts` asserts the timeout remains as the wrapper cause;
`studio-p3-pipeline.test.ts` and `studio-frame-error-classification.test.ts` assert
retryability and error taxonomy for wrapped timeouts.

**Browser effect:** reran the Jelajahin frame retry from the canvas action. The corrected
attempt passed validation and rendered real HTML; generation took 245,665 ms total and
did not meet the under-60-second target (§4).

### D5 — Mobile prototype drawer opened outside the viewport

**Cause:** `StudioPrototypeDrawer` initially supplied controlled open-state props to the
`Drawer` root rather than `Drawer.Backdrop`, producing a `PressResponder` warning.
After moving the state props to the backdrop, Chrome still placed the dialog below
the viewport: its computed position was `static`, at `y=920` in a 557×920 viewport.
The drawer compound classes had no active positioning rules in this app.

**Fix:** moved `isOpen` and `onOpenChange` to `Drawer.Backdrop`, then added explicit
viewport positioning and sizing to the backdrop and right-side content. Selecting a
page still calls the page-selection handler and closes the drawer.

**Regression coverage:** `studio-prototype-pages.test.tsx` opens the drawer,
selects a page, asserts it closes, and checks that no `PressResponder` warning
was logged.

**Browser effect:** Chrome DevTools opened the drawer at a 557×920 viewport.
The captured screenshot shows the backdrop covering the viewport and the panel
fully visible against the right edge at full height. Selecting its page closed
the drawer. The post-fix console had no `PressResponder` warning. Screenshot:
`p12-evidence/mobile-prototype-page-drawer.png`.

---

## 6. What the browser proved about P11 Fix 01–06

| Fix | Browser observation |
|:--|:--|
| 01 HTML-first rendering | Real isolated HTML documents per frame; export contains no authored script or unsafe URL. The live preview has a Studio-injected Pencil bridge under `sandbox="allow-scripts"`, so the literal no-script runtime requirement is only partial (§2.1). |
| 02 Canvas/toolbar/trackpad | Wheel pan/zoom, Ctrl+wheel, marquee + Shift selection, and per-selected-frame toolbar were exercised; physical trackpad gestures remain unverified. |
| 03 Pencil and undo | Scoped element selection, 1 px hover / 2 px selection outlines, inline text edit committed to one frame, durable undo restored previous content. |
| 04 Explanations and result cards | Grounded copy, separate status rows, per-row “Buka di canvas” focus, partial-success wording, observed Markdown elements, no duplicate rows after reload. |
| 05 Suggestions and composer | Vertical chips fill the scoped prompt, composer remains usable during jobs, and explanation display makes no ledger write. |
| 06 Design generation and photography | One retried Jelajahin frame demonstrates journey-derived navigation, real resolved photos with attribution and an honest provider fallback; full five-frame consistency is not claimed. |

---

## 7. Residual gaps (explicit)

1. Physical trackpad pinch, two-finger momentum, touch pinch, and an uploaded user
   logo/reference image were not exercised.
2. The live preview includes a Studio-injected Pencil message bridge in an iframe
   sandboxed with `allow-scripts`. The generated frame HTML and exported files were
   audited separately; the runtime preview does not meet a literal no-script requirement.
3. Journey 1 produced one of five ready frames after retry; Journey 3 produced one
   of four in its measured run. Neither full multi-screen journey passed browser
   acceptance.
4. The session did not produce inline code, code blocks, blockquotes, or links in
   chat, so those Markdown node types were not observed in the browser.
5. Chrome DevTools reported the disabled generated search input without an `id` or
   `name`. It has an `aria-label`, but the markup issue remains unresolved.
6. `STUDIO_PEXELS_API_KEY` is unset; this run exercised the keyless Openverse route.

---

## 8. Artefacts

- `docs/prompt-design-studio/p12-evidence/*.webp` and `*.png` — real-browser screenshots
  for the canvas, toolbar scope, marquee, Pencil editing, durable undo, chat/result
  rows, suggestions, export, failed frames, and the Jelajahin retry. Retry artefacts:
  [`journey1-retry-canvas-ready.png`](./p12-evidence/journey1-retry-canvas-ready.png),
  [`journey1-retry-ready-frame.png`](./p12-evidence/journey1-retry-ready-frame.png),
  [`journey1-retry-prototype-preview.png`](./p12-evidence/journey1-retry-prototype-preview.png),
  [`journey1-retry-partial.webp`](./p12-evidence/journey1-retry-partial.webp), and
  [`mobile-prototype-page-drawer.png`](./p12-evidence/mobile-prototype-page-drawer.png).
- `.p12-qa/` — temporary QA harness and exported files were scratch-only and removed
  from the repository; the report records their observed outputs.
- Studio projects created or touched by the QA run remain in the owner's account:
  `39199f74` (Kalyana Studio, 2 ready frames), `c3f94438` (FinBook, 1 ready frame),
  `fff7e4f0` (Jelajahin, 1 ready frame after retry). Four additional throwaway projects
  without committed frames were deleted after the run. The legacy project `f595b052`
  keeps its original HTML; the two Pencil edits were reverted through the product's
  durable undo (revision 3 = original bytes).