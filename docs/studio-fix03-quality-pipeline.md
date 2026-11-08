# FIX 03 — Studio quality pipeline

Scope: `docs/prompt-design-studio/p3.md`. Standalone generated documents, not a Studio UI rebuild. FIX 02 CSS ownership remains authoritative.

## Component-first discovery (before implementation)

Official sources inspected in this pass; no third-party source copied, no new dependency. Static HTML/CSS composition only, never React hooks, JSX, Embla, or animation runtimes inside an artboard.

| UI need | Existing component | Library reference | Compatibility | License | Chosen implementation | Reason |
|---|---|---|---|---|---|---|
| Product / media card | Canonical role-scoped media + cards | [shadcn Card](https://ui.shadcn.com/docs/components/card), [HeroUI Radio anatomy](https://heroui.com/en/docs/react/components/radio-group) | Structure only | shadcn MIT; HeroUI v3 Apache-2.0 | Keep media role, add bounded product-row composition | Image, description and atomic price get separate tracks; crop depends on subject |
| Carousel | `HorizontalCarousel` | [shadcn Carousel](https://ui.shadcn.com/docs/components/carousel) | React/Embla rejected; native overflow transferable | MIT | Existing native scroll-snap track, explicit item basis | Cards keep readable width, no forced shrinking or autoplay |
| RadioGroup / Checkbox | Native fields, existing field pattern | [shadcn Field](https://ui.shadcn.com/docs/components/field), [HeroUI RadioGroup](https://heroui.com/en/docs/react/components/radio-group) | Native controls replace React Aria runtime | MIT / Apache-2.0 | Fieldset/legend, full clickable option row, description and price tracks | Full essential labels and checked state survive narrow widths |
| Segmented controls | `SegmentedControl / Tabs` | [shadcn Tabs](https://ui.shadcn.com/docs/components/tabs), [TUFFUI Choice Controls](https://tuffui.com/components/choice-controls) | Existing native buttons, no state hooks | shadcn MIT; TUFFUI site states MIT | Reuse scrollable segments | Avoid crushing labels |
| Input groups / responsive action bar | `SearchInput`, `Responsive ActionGroup`, `QuantityStepper` | [shadcn Input Group](https://ui.shadcn.com/docs/components/input-group), [Button](https://ui.shadcn.com/docs/components/button) | Static structure only | MIT | Reuse separate tracks; atomic price/quantity, wrapping action group | No absolute icon collision, no price/CTA fight |
| Navigation | Canonical shell + blueprint navigation | [shadcn Navigation Menu](https://ui.shadcn.com/docs/components/navigation-menu) | Existing deterministic shell | MIT | Reuse canonical chrome unchanged | Model must not duplicate app navigation |
| List / table | Existing bounded DataTable | [shadcn Table](https://ui.shadcn.com/docs/components/table) | Static table + scroll region | MIT | Existing table wrapper; lists when appropriate | Domain does not imply a dashboard template |
| Empty state | Semantic content + contextual action | [shadcn Empty](https://ui.shadcn.com/docs/components/empty) | Plain content, no runtime needed | MIT | Guidance only, no extra component | Explain actual empty data, not fake skeletons |
| Modal / drawer | Existing Studio Radix dialog, generated static state | [shadcn Drawer](https://ui.shadcn.com/docs/components/drawer) | Runtime focus trap not transplanted into static output | MIT | No Studio UI changes; show only requested static state | Do not pretend standalone artboards implement modal interaction |
| Badge / progress | Existing semantic statuses/native progress | [shadcn Badge](https://ui.shadcn.com/docs/components/badge), [Progress](https://ui.shadcn.com/docs/components/progress) | Labelled static state | MIT | No default verified badge; retain meaningful stock/payment/selection/progress | Color never sole status signal; repeated status advisory only |
| Content layout blocks | Existing role + shared blueprint | [SakaniUI](https://www.sakaniui.com/), [Magic UI Marquee](https://magicui.design/docs/components/marquee) | React effects excluded | Sakani license not reverified; Magic free catalog distinct from Pro | Reuse existing shell; task-specific composition | No decorative bento/KPI quota, no copied source |

Additional mandatory candidates evaluated:

- [React Bits Scroll Stack](https://reactbits.dev/components/scroll-stack): pinned scrolling/card animation; runtime incompatible and unnecessary for readable product options. Not adopted; license not relied on.
- [Thinking Orbs](https://www.thinkingorbs.com/#orbs): current docs offer React, plain JS and SwiftUI, MIT link. Functional agent-status library, not a product/form/media primitive. Not adopted; no fabricated activity.
- [affectUI catalog](https://www.affectui.com/components): checkbox, cards, tables, progress and navigation candidates exist; catalog distinguishes free and commercial content. No source copied; no blanket MIT assumption or premium copy.
- [TUFFUI](https://tuffui.com): AI-agent components, choice controls and semantic status pills; site explicitly states MIT. Existing native controls already cover the needed behavior.
- [CUI](https://yappologistic.github.io/CUI/): official page describes native C components, approximately 170 with spring motion and keyboard support. Not a standalone HTML/React registry; no code adopted, license not relied on.
- [SakaniUI](https://www.sakaniui.com/): token-driven React design system and content blocks; no second design system or glass effects needed.

License evidence: [shadcn MIT](https://raw.githubusercontent.com/shadcn-ui/ui/main/LICENSE.md), [HeroUI v3 Apache-2.0](https://raw.githubusercontent.com/heroui-inc/heroui/v3/LICENSE). These current sources supersede conflicting historical license descriptions in older discovery records.

## Root cause and implementation boundaries

The initial audit found discarded diagnostic warnings, no repairable category, contradictory mobile-single-column and universal image-cover instructions, a default verified badge inside the component catalog, fixed finance dashboard composition, and legacy generation/revision paths that bypassed the quality gate. Shared identity existed but lacked numeric project spacing/type/content-width decisions. The selected-skill system prompt did not independently carry baseline quality into correction.

P3 adds only missing layout decisions; existing palette, radius, density, navigation and component descriptions remain their single sources. Screen roles carry composition, hierarchy, media intent and responsive choices rather than duplicating shared identity. Optional layout data preserves persisted blueprint compatibility.

## Planning, generation and correction

- Optional `blueprint.layout`: bounded numeric gutter/content width and strictly ascending spacing/type scales. Persisted blueprints without this field retain FIX 02 defaults. Existing identity, density, navigation and screen roles are reused, not duplicated.
- Planning chooses shared geometry once; each screen role describes its own hierarchy, component/media roles and responsive intent. No global mobile-single-column or finance-KPI quota.
- Frame, revision and correction system prompts include baseline quality even with skill `none`. Project-specific user prompts no longer repeat that baseline. Existing skill selection and precedence remain intact.
- Legacy project creation/revision and canvas operations now use `generateValidatedFrameHtml`. Failed validation cannot be persisted as a successful generated revision.
- Raw document boundaries are checked before JSDOM/canonical normalization. A truncated document cannot become valid merely because serialization supplied closing tags.
- Assembly failure is attributed to Studio and fails without asking the model to repair it. Model defects retain the existing single bounded correction and full previous-document context; advisory findings do not trigger correction.

## Deterministic quality checks

`inspectStudioStructuralQuality` checks applied computed declarations with per-element caching, not unused CSS text or invented browser measurements. Findings expose `code`, `severity`, `confidence` and `message`.

| Category | Examples | Gate behavior |
|---|---|---|
| Hard / high confidence | Unsafe handlers/scripts, missing accessible labels, invalid document, broken canonical contract | Reject or use existing bounded model correction; assembly defects fail directly |
| Repairable / high confidence | Essential ellipsis clipping; zero-sized clipping ancestor; forced breaks inside price/quantity; conflicting declared media heights; shrinking carousel without scrolling; nonwrapping rows exceeding declared width | Correct once, revalidate, then reject if still invalid |
| Advisory / medium confidence | Duplicate status in the same parent, loading placeholder, possible oversized padding, optional polish | Record without retry; functional statuses remain allowed |

Hidden alternatives, screen-reader text, deliberate scrolling and intentional media crops are not treated as structural defects. Duplicate statuses in unrelated records do not imply duplicate status within a component. Existing canonical zero-specificity media defaults remain overridable; no `!important`, global width hack, React runtime, new component library or parallel design system added.

Existing timing output includes hard/repairable/advisory counts, issue stages and whether correction is required. These are actual validation results, not simulated progress or an aesthetic score.

## Regression coverage and runtime proof

- `studio-quality-enforcement-p3.test.ts`: schema boundaries, applied versus unused clipping CSS, each structural finding, healthy options/values/carousel/media, contextual advisory statuses.
- `studio-quality-gate-p3.test.ts`: all six skill selections, revision failure, bounded correction, advisory-only success, invalid source rejection before normalization, assembly ownership, shared token consistency and refresh stability.
- Existing generation/planning budget, FIX 02 CSS ownership, output diagnostics, component guidance, layout quality, service and skill-stage tests cover neighboring contracts. Stale service fixtures now supply parser-readable reference tokens and isolate mock queues. Obsolete prompt-string identity assertions were removed rather than pinned to new wording; valid behavior assertions were retained.
- Native smoke exercised three different screen bodies (discovery, options/checkout, tracking) through token enforcement, canonical finalization, validation and refresh. It checked declared media ratio, nonshrinking carousel width, 18 skill/stage baseline combinations and rejection of structural defects. No browser or image network request.

Verification: final native smoke passed; targeted Vitest run passed **117 tests across 11 files**. Biome checked all 24 touched TypeScript files without changes or diagnostics; `pnpm exec tsc --noEmit` passed. The throwaway smoke script was removed after execution; permanent regression tests retain behavior coverage.

## Token/performance and validation limits

No extra provider request on valid/advisory-only output. Repair remains at most one correction, with existing request, timeout and context limits. Shared numeric layout adds a small blueprint payload; removing repeated user-prompt baseline avoids duplicate instructions. Structural validation adds computed-style work proportional to inspected controls, media and layout rows; no latency or token-saving benchmark is claimed.

Static JSDOM does not calculate line boxes, viewport-specific layout, actual tap geometry, image intrinsic dimensions, image loading/fallback behavior or pixel-perfect cropping. No live AI generation, browser QA or Playwright E2E was performed. Visual quality, real asset availability and interactive preview behavior are not certified by these checks. Browser QA was explicitly prohibited by P3.

