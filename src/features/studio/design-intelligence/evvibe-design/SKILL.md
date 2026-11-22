# evvibe-design — internal design intelligence

This package is VibeDesign Studio's own design intelligence. It is consumed by
Studio's engine at runtime through `buildEvvibeDesignContext(stage, options)`,
not by a coding agent, and it is not user-selectable: there is no design-skill
picker, no per-project version column and no optional alternative standard.

It is deliberately not a copy of the universal quality rules. Those live in
`src/features/studio/services/studio-quality-rules.ts` and are already composed
into every planning and frame system prompt. This package supplies what the
baseline does not: product-family reasoning, website and mobile composition
families, navigation justification, component anatomy, imagery contracts, and
the reasoning test that rejects decoration.

## Precedence

```
security and HTML safety
  > explicit user requirements
  > valid PRD / product constraints
  > selected DESIGN.md / theme reference
  > existing shared project blueprint
  > EvVibe design intelligence   <- this package
  > default product guidance
```

Nothing here may override a validated design token, a user colour choice or a
PRD fact. `EVVIBE_DESIGN_PRECEDENCE` states the same chain inside the prompt.

## Files

| File | Role |
| --- | --- |
| `skill-contract.ts` | Stage union, per-stage character budgets, reference type, precedence and the reasoning law. No imports, no side effects. |
| `stage-context.ts` | Per-stage delivery order, budgeted whole-section selection, the `<EVVIBE_DESIGN_INTELLIGENCE>` wrapper. |
| `index.ts` | Public surface: `buildEvvibeDesignContext`, `planEvvibeDesignContext`, stage map, budgets. |
| `references/design-reasoning.ts` | The mandatory reasoning sequence and the "say no to this component" list. |
| `references/web-design.ts` | Website and web-application families, public-navbar composition, section variety. |
| `references/mobile-design.ts` | Mobile screen classes A–F, app-bar content choice, back-affordance justification. |
| `references/navigation-patterns.ts` | Navigation models, contextual versus primary screens, controlled assembly. |
| `references/typography-and-layout.ts` | Intrinsic sizing, `min-width: 0`, bounded tables, atomic values, media frames, tap targets, safe areas. |
| `references/component-library.ts` | Purpose / use / not-use / anatomy / responsive / a11y for each adopted pattern. |
| `references/media-and-imagery.ts` | Photograph requirement, SVG boundaries, the fixed image asset contract. |
| `references/accessibility.ts` | Landmarks, heading order, grouping, state in words, tables, reflow. |
| `references/anti-slop.ts` | Prohibitions, the "would removing this change anything?" test, and what stays allowed. |
| `examples/good-vs-bad.ts` | Status, metrics, cards, composition, text, media, density contrasts. |
| `examples/website-patterns.ts` | Three-link navbar + card wall versus a composed public page. |
| `examples/mobile-patterns.ts` | Top-level versus detail mobile screens; choice rows that do not squeeze. |

## Stage budgets

`EVVIBE_DESIGN_STAGE_BUDGET_CHARS` — hard ceilings in characters, not goals. A
section that does not fit is dropped whole and reported in
`plan.omittedIds`; text is never cut mid-rule.

| Stage | Budget | Sent with |
| --- | --- | --- |
| `planning` | 20 000 | `STUDIO_PLANNING_SYSTEM_PROMPT`, once per plan |
| `generation` | 17 000 | `STUDIO_FRAME_SYSTEM_PROMPT`, byte-identical for every frame |
| `initial` | 9 000 | first frame prompt for a screen |
| `add-screen` | 9 000 | added-screen frame prompt |
| `revision` | 8 800 | revision user prompt |
| `correction` | 4 400 | single repair round |

## Integration points

- `services/studio-prompt-contracts.ts` — composes `planning` and `generation`
  into the two mandatory system prompts.
- `services/studio-screen-prompts.ts` — `initial` / `add-screen` (viewport
  aware) and `revision` (previous HTML present) addenda.
- `services/studio-frame-correction.ts` — `correction` addendum carrying only
  the layout-fix rules next to the reported issues.

## Review ledger

Reviewed for the component reference. Only patterns that can be expressed as
static HTML/CSS are adopted; no runtime source is copied.

| Source | Licence | Verdict |
| --- | --- | --- |
| [shadcn/ui](https://ui.shadcn.com/) | MIT | Adopted: Field/choice-row anatomy, bounded data table, card structure. |
| [HeroUI v3](https://www.heroui.com/) | Apache-2.0 | Adopted: choice hierarchy with separate control/label/description/price tracks. |
| [Magic UI](https://magicui.design/) | MIT free tier, Pro separate | Reference only: unequal grids; no mosaic default, no motion runtime. |
| [React Bits](https://reactbits.dev/) | MIT + Commons Clause | Rejected: script-driven motion, redistribution restrictions. |
| [Thinking Orbs](https://www.thinkingorbs.com/) | MIT | Rejected: canvas/WebGL indicator, no static equivalent needed. |
| [affectUI](https://www.affectui.com/components) | Mixed free + Pro | Reference only: empty state, status pill, stat card taxonomy; no Pro source copied. |
| [TUFFUI](https://tuffui.com/) | MIT, 88 components | Adopted: status pill tones, segmented control, result carousel, empty state, disclosure. |
| [CUI](https://yappologistic.github.io/CUI/) | — | Rejected: native C toolkit, no web surface to reuse. |
| [SakaniUI](https://www.sakaniui.com/) | MIT, React | Adopted: stepper and command-menu anatomy; rejected its liquid-glass treatment as a default. |

## Enforcement

Prompt text is not enforcement. The rules above are backed by the existing
three-tier validator, and only one new deterministic check was needed:

| Tier | Behaviour | Examples |
| --- | --- | --- |
| hard | Fails the frame; never repaired by the model | unsafe script/handler, unresolved image asset, duplicate id, missing accessible label |
| repairable (high confidence) | One bounded corrective regeneration | ellipsis-clipped essential text, broken atomic price, media frame conflict, shrinking carousel, non-wrapping narrow row, **card-only public composition** |
| advisory | Reported, never triggers regeneration | sparse body, repeated status label, oversized nested padding, decorative cursor |

`CARD_ONLY_COMPOSITION` lives in `validateGeneratedHtml` because it needs the
blueprint: on a `public-website` intent, three or more boxed text-only sections
with no media, control, link or list is a card wall, not a composition. It is
deliberately narrow so a genuine editorial page cannot trip it.

Subjective visual concerns (a gradient that is too loud, a bespoke illustration
that is not to taste) stay advisory: they are never a reason to regenerate a
whole document.

## Verification

```
pnpm vitest run src/features/studio/tests/studio-design-intelligence.test.ts
```

The suite proves the standard reaches the real pipeline, that each stage gets
its own bounded context, that web and mobile differ, that DESIGN.md and theme
precedence survive, and that the image contract rejects fabricated sources.