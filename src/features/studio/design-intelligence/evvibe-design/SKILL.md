# evvibe-design — internal design intelligence

VibeDesign Studio's own design intelligence, consumed by Studio's engine at
runtime through `buildEvvibeDesignContext(stage, options)`. Not for a coding
agent, not user-selectable: no picker, no version column, no competing
standard. Every planning, frame, add-screen and revision request gets the
stage context it needs and nothing more.

## Responsibility split

| Owner | Owns | Never does |
| --- | --- | --- |
| `studio-quality-rules.ts` (universal contract) | Non-negotiable generation and safety boundaries | Choose a layout |
| `evvibe-design` core (`references/`) | Design reasoning and general UI/UX knowledge | Impose a fixed composition |
| Platform/context addendum | What the current screen's platform and family need | Repeat the universal contract |
| User / project context | PRD, brief, DESIGN.md, theme, blueprint | Yield to skill guidance |
| Correction context | Only the reported defects | Carry general design guidance |

Precedence: security and HTML safety > explicit user requirements > PRD >
DESIGN.md / theme > shared blueprint > this intelligence > default guidance.

Fixed visual composition is prohibited here: no universal three-link navbar,
no default hero-plus-three-cards portfolio, no title-only app bar on every
mobile screen, no mandatory KPI row. The references describe priorities; the
engine decides section count, hierarchy, navigation, hero, cards, header,
media placement, controls and density.

## Files

| File | Role |
| --- | --- |
| `skill-contract.ts` | Stage union, budgets, reference type, precedence, reasoning law. |
| `stage-context.ts` | Per-stage delivery order, viewport/intent filtering, budgeted whole-section selection, wrapper. |
| `element-revision.ts` | Compact guidance for a single selected-element edit (P8 consumes it). |
| `index.ts` | Public surface. |
| `references/design-reasoning.ts` | Reasoning sequence, domain priorities, when to say no. |
| `references/web-design.ts` | Website and web-application families, public-navbar and section rules. |
| `references/mobile-design.ts` | Screen classes A–F, app-bar content choice, back-affordance law. |
| `references/navigation-patterns.ts` | Navigation models, primary vs contextual screens. |
| `references/typography-and-layout.ts` | Layout/type technique for the universal boundaries. |
| `references/component-library.ts` | Component anatomy worth reusing, and what was rejected. |
| `references/media-and-imagery.ts` | Photograph requirement, SVG boundaries, image asset contract. |
| `references/accessibility.ts` | Landmarks, order, semantics, state, reflow, locale. |
| `references/anti-slop.ts` | Unearned decoration, and what stays allowed. |
| `references/revision-scope.ts` | What a revision may touch and what must survive. |
| `examples/website-patterns.ts` | Card wall versus composed public page (public-website only). |
| `examples/mobile-patterns.ts` | Discovery vs detail vs settings; a choice row that fits. |
| `examples/good-vs-bad.ts` | Status, metrics, cards, shape, text, media, density contrasts. |

## Stages

| Stage | Budget | Delivered with | Why |
| --- | --- | --- | --- |
| `planning` | 14 000 | planning system prompt (platform-neutral, cacheable) | reasoning, navigation, media, anti-slop, accessibility |
| `planning-platform` | 4 000 | planning user prompt, viewport-gated | the matching website *or* mobile family, never both |
| `generation` | 9 000 | frame system prompt, byte-identical per frame | layout technique, component anatomy, media, anti-slop |
| `initial` | 5 000 | first frame prompt | platform family plus the matching worked example |
| `add-screen` | 5 000 | added-screen frame prompt | navigation + platform family only |
| `revision` | 4 000 | revision user prompt | change scope + contrasts; the system prompt already holds the standard |
| `correction` | 0 | — | the system prompt and the reported defects already cover a bounded repair |

Platform and intent filtering is the adaptivity mechanism: `web-design` only in
web stages, `mobile-design` only in mobile stages, `website-patterns` only for
`public-website`. A web-application frame receives the contrasts example
instead; a marketing page receives the website example. No mapping from intent
to a fixed page layout exists anywhere in the package.

## Consolidation

P1 repeated media sizing, text wrapping, atomic values, hit areas and status
rules in both the universal contract and the skill. P1.1 keeps each rule in one
place:

- Boundaries (no page overflow, atomic price groups, 44px targets, no forced
  breaks) stay in `STUDIO_BASE_QUALITY_INVARIANTS` and are referenced, not
  restated.
- The skill kept only the technique that satisfies them, the design decisions
  the contract does not make, and the image asset contract the validators
  enforce.
- Component knowledge is educational anatomy, not a runtime catalog.

## Correction policy

No skill text is added to a repair request. Correction attempts stay bounded at
`STUDIO_FRAME_CORRECTION_MAX`, and the policy depends on what the operation has
to preserve:

| Operation | Committed design | Oversized candidate |
| --- | --- | --- |
| Initial frame, added screen, retry of a never-successful frame | none | bounded fresh regeneration from the blueprint (`NEW_FRAME_BOUNDED_REGENERATION`) |
| Revision or retry of a frame with committed HTML | yes | repair refused with `STUDIO_REVISION_TOO_LARGE`; the committed design is kept (`REVISION_CONTEXT_TOO_LARGE`) |

The policy is passed explicitly from the call site (`new-frame` /
`preserve-existing`) and never inferred from prompt wording, frame status or
metadata completeness: a frame is disposable only when it has no committed
HTML. A repair that fits always proceeds in place (`FULL_DOCUMENT_REPAIR`) and
carries the user's requested change as a scoped instruction, so the repair
cannot widen into a redesign.

## Large-document revision

Revision prompts never truncate an existing document. The complete document is
sent when it fits `STUDIO_PREVIOUS_HTML_MAX_CHARS`. Above that limit, only
lossless compaction is attempted — HTML comments and inter-tag whitespace,
never inside `pre`, `textarea`, `script` or `style` — and it is used only when
the parsed structure, attributes and text are identical before and after.
Anything that cannot be reduced safely fails as `STUDIO_REVISION_TOO_LARGE`,
which keeps the last committed revision and costs no provider request. Scoped
patch application is P8 work.

## Enforcement

Prompt text is not enforcement. The validator keeps three tiers, and only one
structural check was added:

| Tier | Behaviour | Examples |
| --- | --- | --- |
| hard | Fails the frame; never repaired by the model | unsafe script/handler, unresolved image asset, duplicate id, missing accessible label |
| repairable (high confidence) | One bounded corrective regeneration | ellipsis-clipped essential text, broken atomic price, media frame conflict, shrinking carousel, non-wrapping narrow row, **card-only public composition** |
| advisory | Reported, never triggers regeneration | sparse body, repeated status label, oversized nested padding, decorative cursor |

`CARD_ONLY_COMPOSITION` inspects the content region's own children: on a
`public-website` intent, three or more text-only blocks, each carrying an
explicit card marker, a border or a shadow, with no media, link, list or
control. A background colour alone is not card evidence — full-width editorial
colour-block sections are a legitimate composition — and the check never
demands photography, a hero, a CTA or a fixed section count. It stays a bounded
repair signal, not proof that a design has no slop; subjective aesthetics stay
advisory.

## Remaining limitations

- Background-only card walls are not detected; JSDOM offers no layout geometry,
  so containment cannot be measured, and guessing would misfire on editorial
  sections.
- Existing frames have no generic scoped patcher; an oversized preserved repair
  fails instead of being applied partially. P8 owns scoped element application.
- Provider input tokens are not observable in the mocked suites; prompt sizes
  are reported in characters.

## Review ledger

| Source | Licence | Verdict |
| --- | --- | --- |
| [shadcn/ui](https://ui.shadcn.com/) | MIT | Field/choice-row anatomy, bounded table, card structure. |
| [HeroUI v3](https://www.heroui.com/) | Apache-2.0 | Choice hierarchy with separate control/label/description/price tracks. |
| [Magic UI](https://magicui.design/) | MIT free tier, Pro separate | Reference only: unequal grids; no motion runtime. |
| [React Bits](https://reactbits.dev/) | MIT + Commons Clause | Rejected: script-driven motion, redistribution restrictions. |
| [Thinking Orbs](https://www.thinkingorbs.com/) | MIT | Rejected: canvas/WebGL indicator. |
| [affectUI](https://www.affectui.com/components) | Mixed free + Pro | Reference only: empty state, status pill, stat card taxonomy. |
| [TUFFUI](https://tuffui.com/) | MIT, 88 components | Status pill tones, segmented control, result rail, empty state. |
| [CUI](https://yappologistic.github.io/CUI/) | — | Rejected: native C toolkit, no web surface. |
| [SakaniUI](https://www.sakaniui.com/) | MIT, React | Stepper and command-menu anatomy; liquid glass rejected as a default. |

## Verification

```
pnpm vitest run src/features/studio/tests/studio-design-intelligence.test.ts
```

Covers the real planning path (web and mobile), stage separation and bounds,
intent adaptivity, correction near the document limit, the element-edit
boundary, DESIGN.md precedence, the image contract, and the absence of any
component-browsing stage.