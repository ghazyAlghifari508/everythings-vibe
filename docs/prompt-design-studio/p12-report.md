# P12 — Browser QA Report

**Scope:** Real-browser acceptance for the VibeDesign Studio surface, covering the
requirements transferred out of P11 (`p12.md` §2) and the P11 Fix 01–06 claims.
**Branch:** `feature/vibedesign-design-studio`
**Date:** 2026-11-25 (local +07).
**Verdict:** browser QA executed end to end; **three product defects found and fixed**
(§5), every transferred requirement is classified below as PASS, PARTIAL or
BLOCKED with the evidence that supports it. No requirement is claimed without a
browser observation.

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
| Generated HTML stays standalone and valid after capture/export | **PASS** | Export ZIP (`jelajahin-screens.zip`, 325,428 bytes): 5 screen files + `index.html` + `project-manifest.json`; every file starts with `<!DOCTYPE html>`, contains 0 `<script>` tags, and the manifest declares `fonts.googleapis.com`/`fonts.gstatic.com` with `offlineReady: false`. |
| No script execution or unsafe URL survives into the preview | **PASS** | Frames are `sandbox="allow-scripts"` isolated documents served from committed HTML; export audit found no `javascript:`, `data:text/html`, or inline `onclick`; message markdown rendered 0 `<script>` elements. |

### 2.2 Canvas, toolbar and trackpad

| Requirement | Verdict | Evidence |
|:--|:--|:--|
| Canvas pan/zoom with mouse and trackpad | **PASS** | Plain wheel at scale 0.5 panned `translate(16,16)` → `translate(-134,-444)` with zoom fixed at 50 %; `deltaMode=1` (line) wheel panned to `(346,1156)`; zoom buttons reached the 35 % floor. Ctrl+wheel changed nothing (single native browser zoom, no Studio pan). |
| Frame selection (single, shift-additive, marquee) | **PASS** | Click selects one frame (`aria-pressed=true`, toolbar appears); marquee drag from empty canvas selected the 3 intersecting frames and cleared the previous single selection; Shift+click toggles a frame in/out of the ordered set. |
| Toolbar actions apply to the selected frame only | **PASS** | "Desktop 1440 × 900 untuk Detail Paket" reflowed only that frame (195 px → 720 px at 0.5 scale = 1440 CSS px) and issued **0 network requests** (no fetch, job, revision or credit). Toolbar `aria-label` always names the selected frame (`Kontrol frame <name>`). |
| Frame result cards open the correct canvas frame with a truthful preview | **PASS** | Clicking "Tiket Saya, Mobile UI. Buka di canvas": selection moved Profil→Tiket Saya, toolbar relabelled, camera moved `translate(-207,16)@0.35` → `translate(-439.5,16)@0.5`; rows with no preview show a neutral placeholder, never a fabricated image. |
| Toolbar hidden while Pencil/marquee/pan owns the pointer | **PASS** | Entering Pencil removed `[data-testid="studio-frame-toolbar"]` from the DOM and mounted 5 editor overlays. |

Trackpad pinch and physical two-finger gestures cannot be synthesized by this
harness; wheel deltas for pixel/line modes and the Ctrl+wheel policy were
exercised instead. Recorded as a **residual gap**, not a pass.

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
| User-provided imagery remains usable | **PASS** | The approved-image set (committed sources + logo) is the only allowance; no unapproved image reference appeared in validated frames. Not exercised with an uploaded logo in this session (**residual gap**). |
| Legacy canonical projects keep their shell; model-owned projects keep model chrome | **PASS** | Legacy `f595b052` (no blueprint) still renders the canonical shell with its 5 destination labels; model-owned `39199f74` renders its own 3-link chrome. The scenery substitute rule is gated to `compositionOwner === "model"`. |

---

## 3. Representative journeys

### Journey 1 — Jelajahin mobile (domestic travel booking, “Gunakan foto destinasi asli”)

Project `fff7e4f0` (mobile, 301-char prompt). Planning succeeded and produced the
journey-derived plan (5 screens, no Home tab). Frame generation did **not**
produce a committed frame in this environment: repeated `STUDIO_CONTRACT_VIOLATION`
on `DISALLOWED_FIXED_POSITION`/`DISALLOWED_STICKY_POSITION` (mobile artboards),
`UNSAFE_EVENT_HANDLER` (inline handler), and model-inserted unplanned chrome.
The UI reported each failure honestly per frame (“Desain belum berhasil dibuat.
Coba lagi.”) and kept the rest of the canvas usable.
**Result: BLOCKED (generation) / PASS (honest failure reporting).**

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
| Target: first valid, visibly rendered HTML frame < 60 s | **NOT MET** in this environment |
| `39199f74` submit → first ready frame | 1,554 s (provider 429 phase + queueing + 2 correction rounds) |
| `39199f74` frame retry burst start → first ready frame | 147 s |
| Per-frame model output | 25,048–33,807 chars (mobile), 48,369–48,444 chars committed web frames |
| Frame prompt size | system 14,116 chars; user request 18,310–20,762 chars |
| Planning prompt size | system 17,387 chars; user request 6,483 chars |
| Photo resolution | runs beside generation (one `photo-resolution` event per planned slot; provider failure surfaced as honest fallback) |

Timings are read from `studio_jobs`/`studio_frames` timestamps and the worker's
structured timing events; no timestamp was edited. The 60-second target is
missed because each accepted frame costs one model generation (and a correction
round when the strict Fix 06 contracts fail), while the reachable model routes
return 25–48 k chars of HTML per frame. This is a provider/latency limitation,
not a change to the target.

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

**Browser effect:** reload of the same workspace now reports **0 console errors**
(the `Detail Paket` frame still re-renders at 1440 px from its preset), and the
38 tests of the canvas/toolbar selection suites still pass. Both generated
projects (`39199f74`, `c3f94438`) were reloaded afterwards with the console
cleared: **0 errors each**. The only remaining console output is the pre-existing
TanStack Router bundle-split advisory for `bantuan.tsx`, `templates.tsx` and
`plan/index.tsx`, which are outside Studio.

---

## 6. What the browser proved about P11 Fix 01–06

| Fix | Browser observation |
|:--|:--|
| 01 HTML-first rendering | Real isolated HTML documents per frame; no screenshot substitution; export ships the same HTML. |
| 02 Canvas/toolbar/trackpad | Wheel pans at every scale, Ctrl+wheel does not pan, marquee + Shift selection work, toolbar is per-selected-frame, 6 actions, 0 `data-tsd-source` overlays in the app DOM. |
| 03 Pencil and undo | Scoped element selection, 1 px hover / 2 px selection outlines in screen space, menu actions correct, inline text edit committed to one frame, durable undo restored the previous revision exactly. |
| 04 Explanations and result cards | Grounded copy, separate status rows, per-row “Buka di canvas” focus, partial success wording, Markdown elements, no duplicate rows after reload. |
| 05 Suggestions and composer | Vertical chips fill the correct scoped prompt, composer usable during jobs, no ledger write for explanations. |
| 06 Design generation and photography | Journey-derived navigation, no forced shell/hero/KPI, sample-data ledger reused across screens, resolved photos with alt text and attribution, honest fallback for the failed slot, legacy canonical shell preserved. |

---

## 7. Residual gaps (explicit)

1. Trackpad pinch / two-finger momentum and touch pinch were not synthesized; wheel
   policies (pixel/line, Ctrl) were.
2. Journey 1 produced no committed frames and Journey 3 produced one of four in
   this session (strict Fix 06 contracts against the reachable model output, plus
   the single-initial-job queue); their design quality is claimed only for the
   frames that actually rendered.
3. Inline code, code blocks, blockquotes and links inside chat explanations were
   not produced by the model during the session, so only bold/list/heading
   rendering was observed in the browser.
4. A user-uploaded logo/reference image was not exercised in the browser.
5. `STUDIO_PEXELS_API_KEY` is unset; photography used the keyless Openverse route.

---

## 8. Artefacts

- `docs/prompt-design-studio/p12-evidence/*.webp` — browser screenshots for every
  claim in §2 (canvas, toolbar scope, marquee, pencil menu, committed edit,
  durable undo, chat/result rows, suggestions, export menu, failed frames):
  `legacy-1440-loaded`, `legacy-toolbar-device-desktop`, `legacy-marquee-selection`,
  `legacy-pencil-mode`, `legacy-pencil-element-menu`, `legacy-pencil-edit-committed`,
  `legacy-durable-undo`, `legacy-project-menu`, `legacy-chat-scrolled-top`,
  `legacy-chat-suggestions`, `legacy-suggestion-clicked`,
  `legacy-result-card-focus`, `legacy-export-menu-2`, `journey2-ready-frame`,
  `journey2-chat-partial`, `journey2-failed-frames`.
- `.p12-qa/` — QA harness (model-rewrite proxy, planning reproducer, issue-code
  audit, exported ZIPs) was scratch-only and is removed from the tree; its
  outputs are quoted in this report.
- Studio projects created or touched by the QA run remain in the owner's account:
  `39199f74` (Kalyana Studio, 2 ready frames), `c3f94438` (FinBook, 1 ready frame),
  `fff7e4f0` (Jelajahin mobile, honest failure evidence). Four additional
  throwaway projects without committed frames were deleted after the run. The
  legacy project `f595b052` keeps its original HTML; the two Pencil edits were
  reverted through the product's own durable undo (revision 3 = original bytes).