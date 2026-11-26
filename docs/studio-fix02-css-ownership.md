# FIX 02 — Canonical CSS ownership, mobile shell layout & export fidelity

Scope: `docs/prompt-design-studio/p2.md`. Covers the Studio canonical assembly, generated
HTML/CSS contract, preview/export parity, and the repair path for already-generated screens.

---

## 1. Component & pattern discovery record (produced before writing new static patterns)

Per p2.md §7 and AGENTS.md, the existing catalog and the named external references were audited
before adding a single static pattern. React components are **not** importable into a standalone
artboard, so only shapes (structure + class decisions) were adapted, never runtime code.

### 1.1 Repository baseline (verified by reading the files)

| Existing asset | Path | Verified capability |
|---|---|---|
| Static pattern catalog + shared pattern CSS | `src/features/studio/services/studio-component-patterns.ts` | 7 patterns (`SearchInput`, `SegmentedControl/Tabs`, `Select/Dropdown/FormField`, `DataTable`, `MetricCard/Badge`, `Alert`, `Responsive ActionGroup`), every rule `:where(...)`-scoped |
| Prompt-side pattern guidance | `src/features/studio/services/studio-component-guidance.ts` | Injects the catalog + standalone HTML rules into the frame prompt |
| Canonical shell CSS | `src/features/studio/services/studio-canonical-style.ts` (new) | Single source of the shell stylesheet |
| Canonical chrome | `src/features/studio/services/studio-canonical-chrome.ts` | Deterministic app bar + tab bar markup, no React |
| Canonical icons | `src/features/studio/services/studio-canonical-icons.tsx` | Inline SVG strings for the shell |
| HeroUI runtime | `package.json` `@heroui/react@^3.2.6`, used in `src/components/ui/spinner.tsx`, `codebase-kanban-board.tsx`, `workspace-task-subnav.tsx`, `design-md-view-controls.tsx` | **Installed but React-only**: cannot be embedded in a standalone export (the guidance test asserts the artboard prompt never mentions `@heroui`) |

### 1.2 External references (official docs / registries, read in this pass)

| Library | Reference read | What it actually decides | Verdict for this task |
|---|---|---|---|
| shadcn/ui | `/shadcn-ui/ui` component docs (button size variants, card composition, tabs, carousel `basis-*` items) | Button sizes are an explicit axis: `xs h-6 (24px)`, `sm h-8 (32px)`, `default h-9 (36px)`, `lg h-10 (40px)`, `icon size-9 (36×36)`. Carousel items declare their own basis (`basis-1/3`), i.e. per-component width. | **ADOPT the shape**: per-component sizes, a carousel track that respects item width. Rejected as a dependency (React + Tailwind runtime). |
| HeroUI | `/heroui-inc/heroui` Button + Input docs | Same principle: `size: sm \| md \| lg` per component, `isIconOnly` for icon-only controls, variants instead of one shared box. | **ADOPT the shape** (size is a component decision). Rejected as a dependency for artboards. |
| SakaniUI | `sakaniui.com` docs + repo listing | Token-driven system where a surface is swapped by a **data attribute** (`data-surface="glass"`) rather than by a global override. | **ADOPT the convention**: `data-media="…"` scoping for media, so a shared default is opt-in per element. |
| affectUI | `affectui.com/docs` introduction | Pro commercial registry of marketing/section components. | **No candidate**: no form/carousel/action-group primitive needed here, and its licensing is commercial. |
| Magic UI / React Bits / Thinking Orbs | Evaluated in `docs/studio-pr1-component-discovery.md`, `docs/studio-p2-component-discovery.md`, `docs/studio-p3-component-discovery.md` | Decorative motion, animated backgrounds, orbs. | **Rejected**: p2.md forbids adding decorative effects/animations; the affected surfaces (stepper, media frame, carousel track) are functional. |
| TUFFUI | Not resolvable from official sources in this pass | — | **Not used**; no claim made. |

### 1.3 New dependencies

**None.** No package was added. Every change is plain CSS/HTML + existing modules.

### 1.3b License check for the adapted sources

No third-party source file was copied — the adaptation is limited to publicly documented structural
conventions (per-component size axes, a carousel track that respects item width, data-attribute
scoping). Licenses read from each repository's `LICENSE` file in this pass, all permissive:

- shadcn/ui — MIT (Copyright (c) 2023 shadcn)
- HeroUI — MIT (Copyright (c) 2020 Next UI Inc.)
- SakaniUI — MIT (Copyright (c) 2026 Samuel Okpere)

### 1.4 Patterns added (justified by §8 acceptance criteria, not by preference)

- `QuantityStepper` — acceptance #1 needs a proportional stepper. shadcn's `size-9` (36×36) icon
  button and a ~40px value track are the adapted shape; no shared 44px/14px padding.
- `HorizontalCarousel` — acceptance #7 needs a track that honours component widths
  (`flex:0 0 auto` children), the CSS-only equivalent of shadcn's `CarouselItem basis-*` (Embla is
  JS; artboards are static, so a native scroll-snap track is the correct adaptation).
- Media marks (`product`, `thumb`, `banner`, `promo`, `avatar`, `logo`, `photo`) are **not** a new
  pattern with markup: the catalog intentionally stays free of `<img>` elements so the model cannot
  copy a photo element (the shell owns the logo, and the frame prompt must not render one). The
  contract is documented in guidance + enforced by CSS.

---

## 2. Root cause — the rules that broke exported HTML

Every symptom in p2.md §1 traced to one design flaw in `shellStyle()`
(`studio-canonical-shell.ts` before this fix): the shell emitted `[data-studio-shell] … ` rules,
i.e. specificity **(0,1,0)**, and appended them at the *end* of `<head>`. A screen's own
`button{…}`, `h1{…}`, `body{…}`, `.card{…}` rule is (0,0,1)/(0,1,0) **earlier**, so the shell won.

| Reported symptom | Exact rule responsible | Effect |
|---|---|---|
| Controls flattened / stepper stretched | `:where([data-studio-shell] button, input, select, textarea){min-height:44px;padding:10px 14px}` at (0,1,0) | One size for **all** controls: `-`/`+` stepper buttons became wide flat bars, radios/checkboxes inherited border+radius+padding |
| Media ratios broken | `:where([data-media],figure img,img[src*="unsplash"]){aspect-ratio:16/9;width:100%;object-fit:cover}` | Every product photo (16/10), avatar, banner and logo was forced to 16:9 crop |
| Gutter conflict | `[data-studio-content]{padding:var(--app-gutter)}` at (0,1,0), gutter derived only from `canonicalShell.density` | The shell gutter overrode a project's own 16px container padding instead of the design owning it; density was never tied to the gutter the model designed |
| Typography overridden | `:where([data-studio-shell] h1/h2/h3){font-size:…}` at (0,1,0) | A screen's own `h1{font-size:32px}` lost to the shell default |
| Carousel/cards squeezed | `:where(.card,[data-card]){max-width:100%}` + `[class*="flex-"]>*{min-width:0}` at (0,1,0) | Cards inside a horizontal track were capped to the column instead of keeping their component width |
| Mobile content stuck left on desktop | `body{margin:0}` (0,0,1, emitted **after** the design's `body{max-width:440px;margin:0 auto}`) + no platform rule | A ~440px mobile mock rendered at the left edge of a 1440px window with no centring |

---

## 3. Strategy — an explicit CSS ownership boundary

Implemented in `src/features/studio/services/studio-canonical-style.ts` (new module; the shell
module now only assembles the DOM).

**Ownership split.** The shell owns *identity*: design tokens, app bar, tab bar, content region,
base box-model normalization. It does **not** own component geometry.

**Cascade strategy (no mass `!important`).**
1. Every non-identity declaration is emitted as `:where(...)` → specificity **0**. Any rule the
   screen declares (`.stepper button`, `h1`, `main`) wins automatically; a screen that declares
   nothing still gets a sane default. No `!important` was added anywhere.
2. The shell's own structural rules (`[data-studio-shell]`, `[data-studio-header]`,
   `[data-studio-navigation]`, `[data-studio-content]` geometry, focus-visible ring) keep their
   attribute specificity, because they are Studio-owned elements that must stay stable.
3. `body{margin:0}` → `:where(body){margin:0}`, so a design's own `body{max-width:…;margin:0 auto}`
   survives.

**Control rules split by role** (`controlRules()`):
- all controls: `font:inherit;color:inherit;max-width:100%` only (no dimension),
- fields: `input:not([type=checkbox|radio|range|file|color])`, `select`, `textarea` get the field
  shape (`border`, radius, surface, `padding:10px 14px`),
- buttons/`[role=button]`: neutral restyleable shape (`padding:8px 12px`), no imposed size,
- the **primary action only** (`[data-primary]`, `button[type=submit]`) gets `min-height:44px` —
  the one guaranteed touch target,
- native radio/checkbox/range keep their browser box untouched.

**Media is opt-in per element** (`mediaRules()`): `data-media="banner"` 16/9, `"promo"` 21/9,
`"product"`/`"thumb"` 4/3, `"avatar"` 1/1, `"logo"` `object-fit:contain` (no ratio),
`"photo"` `object-fit:cover` with the component's own ratio. The provider-wide
(`img[src*="unsplash"]`) and `figure img` 16/9 rules are gone; the `@supports` fallback now applies
only to the marked ratio buckets.

**Cards/carousels:** the card default no longer sets `max-width`; only `min-width:0` + border +
surface remain, at specificity 0. `[data-ui="carousel"]` provides `overflow-x:auto` and
`flex:0 0 auto` children, so a component width declared by the screen still wins.

**Mobile vs web output** (`platformRules()`): for `productIdentity.platform === "mobile"`, a
`@media (min-width:480px)` block sets `[data-studio-shell]{width:390px;margin-inline:auto}` and
paints the outside area with the project canvas colour. Below 480px nothing applies, so a 360–430px
phone uses its full available width (no accidental overflow, no artificial cap); the capture
viewport (390px) is unaffected, so canvas and export stay pixel-identical. Web output receives no
width cap and no mobile media query at all.

**Gutter:** `--app-gutter` stays `16px` (compact) / `24px` (comfortable) and is now documented in
the planning contract as *the* outer gutter (`studio-prompt-contracts.ts`), while the content
padding itself is `:where([data-studio-content])` → a project container padding wins instead of
stacking.

---

## 4. One final document for preview and export

Architecture before/after (p2.md §4):

```
AI generated HTML
      │
      ▼
enforceDesignSystemOnHtml            ← unchanged (injects tokens/blueprint/Tailwind config)
      │
      ▼
finalizeStudioFrameHtml(mode:"generate"|"refresh")   ← NEW single transformation
      ├─ assembleCanonicalShell   (canonical style + chrome, idempotent)
      └─ repairStudioCanonicalPositioning (mobile fixed/sticky chrome → flow)
      │
      ▼
persisted HTML  (studio_frames.html_code)
      │
      ├──────────────► readStudioFrameDocument ──► finalize(refresh) ──► canvas capture (390px)
      └──────────────► GET /api/studio/frame?document=1 ──────────────► ZIP export (standalone)
                       same function, same output for the same input
```

- `finalizeStudioFrameHtml` (`studio-frame-finalize.ts`) is pure, deterministic and idempotent.
- `finalizeStudioFrameDetail` / `readStudioFrameDocument` (`studio-frame-document.ts`) is the only
  server path that hands out a renderable/exportable document; a failed rebuild falls back to the
  persisted HTML (`source: "persisted"`) instead of breaking a preview or an export.
- The ZIP exporter (`studio-export.ts`) asks for that document per frame, then bundles assets. It
  **never** re-styles or re-renders HTML itself, so no second renderer with different rules exists.
- No React runtime is added to any standalone document.

### 4.1 Assets and dependencies decision

| Asset class | Handling | Evidence |
|---|---|---|
| Studio local assets (`/api/studio/asset?id=…&cap=…`) | Fetched and bundled into `assets/asset-N.{png,jpg,webp,svg}`, references rewritten to `./assets/…`; if any internal URL survives, the export **fails** instead of shipping a login-only reference | `rewriteBundledAssets` + tests #10 |
| Google Fonts, Unsplash and other absolute URLs | **Not** bundled; reported in `project-manifest.json` as `externalDependencies`, with `offlineReady: false` | `listExternalDependencies` + test #10 |
| Offline claim | Only claimed when no external origin remains | manifest field |
| Runtime available only during screenshot | The canvas capture removes every `<script>` and re-injects the Tailwind CDN and Lucide runtime itself. A standalone export cannot do that: it keeps the `cdn.tailwindcss.com` reference (icons are inline SVG in the canonical contract, so no Lucide runtime is needed; a legacy `data-lucide` frame would export without its icons). Both are reported through `externalDependencies`, so the ZIP never claims a runtime it does not ship | `captureStudioVisual` (script removal + re-injection) vs `inspectStudioHtml` (only the Tailwind config script is allowed in a frame) |

Bundling Google Fonts (CSS + font files, CORS) was rejected as scope- and risk-heavy; the honest
decision is to document the online dependency rather than claim offline readiness.

---

## 5. Repair path for already-generated screens

`finalizeStudioFrameHtml(html, { mode: "refresh" })` is the safe, idempotent transformation for
screens generated before this fix:

- it re-assembles **only** a document that already carries Studio's own markers
  (`data-studio-shell` or `#studio-canonical-style`) — `data-studio-content` is deliberately *not* a
  marker, because the frame prompt asks the model to mark its content region itself;
- re-assembly replaces the shell style/shell wrapper instead of appending, so headers, navigation
  and `<style>` tags are never duplicated;
- user/screen HTML inside the content region is preserved verbatim;
- `studio_revisions` is untouched (revisions are a separate table and are never rewritten);
- a document Studio never assembled keeps its original composition — no screen suddenly grows an
  app bar;
- the transformation is deterministic, so a previously valid screen does not change at random.

Trigger points: any read that hands the frame to a consumer (canvas capture, ZIP export). No AI
regeneration is used to fix CSS.

---

## 6. Files changed

| File | Change |
|---|---|
| `src/features/studio/services/studio-canonical-style.ts` | **New.** Ownership split, `:where` defaults, control/media/platform rules, palette + gutter helpers |
| `src/features/studio/services/studio-canonical-shell.ts` | Consumes the style module; the duplicated stylesheet body is deleted |
| `src/features/studio/services/studio-component-patterns.ts` | Stepper/ProductMedia/Carousel patterns; all pattern CSS `:where`-scoped |
| `src/features/studio/services/studio-component-guidance.ts` | Documents control sizing, `data-primary`, `data-media`, carousel and gutter ownership to the model |
| `src/features/studio/services/studio-prompt-contracts.ts` | `density` documents the 16/24px outer gutter it produces |
| `src/features/studio/services/studio-frame-finalize.ts` | **New.** Single deterministic final-document transformation |
| `src/features/studio/services/studio-frame-document.ts` | **New.** Server-side final document for preview and export |
| `src/features/studio/services/studio-frame-generation.ts` | Generation goes through the finalizer; the duplicated mobile repair is removed |
| `src/features/studio/services/studio-frame-visual.ts` | Captures the final document, not the raw persisted bytes |
| `src/features/studio/services/studio-frame-http.ts` | `GET …&document=1` serves the final standalone document |
| `src/features/studio/services/studio-export.ts` | Per-frame final document, bundled local assets, external-dependency manifest |
| `src/features/studio/hooks/use-studio-workspace-actions.ts` | Passes the project id to the exporter |
| `src/features/studio/tests/studio-css-ownership-p2.test.ts` | **New.** The 12 acceptance criteria |
| `src/features/studio/tests/studio-export.test.ts` | Updated for the project-scoped export signature |

---

## 7. Verification

### 7.1 Acceptance criteria → test

| p2.md §8 criterion | Test in `studio-css-ownership-p2.test.ts` |
|---|---|
| 1. assembly never overrides quantity-stepper size | `1. never imposes a shared size or padding on ordinary controls` |
| 2. project gutter vs shell gutter do not conflict | `2. derives the outer gutter from density without a second conflict` |
| 3. product media keeps its specific ratio | `3. keeps the ratio a product media component declares` |
| 4. logo/avatar are not forced to the banner ratio | `4. never forces a logo or avatar into the banner ratio` |
| 5. mobile shell centres on a desktop viewport | `5. centres a mobile app shell on a desktop viewport` |
| 6. web output carries no mobile width cap | `6. never caps a web screen to the mobile artboard width` |
| 7. horizontal carousel is not clipped globally | `7. does not clip a horizontal carousel with global card rules` |
| 8. assembly idempotent, navigation never duplicated | `8. is idempotent and never duplicates chrome` |
| 9. export keeps the HTML/style it should | `9. exports the same final shell the canvas renders` |
| 10. local assets never become broken internal URLs | `10. never leaves a login-only asset URL in the exported document` |
| 11. final HTML stable across processes | `11. produces byte-identical output for the same input` |
| 12. no regression on multi-screen generation | `12. keeps multi-screen generation consistent` |

Plus the existing suites that already guard this surface (`studio-canonical-shell`,
`studio-shell-platform-p2`, `studio-p3-defects`, `studio-quality-p4`,
`studio-output-fixtures-p1`, `studio-quality-evaluation-*`, `studio-export`,
`studio-component-guidance`), re-run unchanged.

### 7.2 Tooling

`pnpm vitest run <targeted files>`, `pnpm biome check <touched files>`,
`pnpm exec tsc --noEmit`.

Known environment limitation observed during verification: the **first** test of
`studio-output-fixtures-p1.test.ts` ("preserves a complete HTML document through assembly") exceeds
vitest's 5s default on this workstation even **without** this change (`git stash` baseline: 12.9s;
with the change: 7.2s). It is a cold-JSDOM startup cost, not a behavioural failure, and every other
test in that file passes. No assertion was weakened to hide it.

### 7.3 Honest limitation

**No browser QA / Playwright E2E was run** (p2.md §8 forbids it for this task). The evidence is
source inspection, static CSSOM assertions on the emitted stylesheet, targeted unit tests and
typecheck. Visual rendering of arbitrary AI output is therefore *not* proven by pixels here; what is
proven is that the specific interfering declarations no longer exist, that every component-level
declaration is at zero specificity, and that preview and export consume the same
document-producing function.
