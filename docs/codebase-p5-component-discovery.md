# Existing Codebase — P5 Component Discovery Record

Scope: the sync/analysis progress indicators in
`docs/prompts-cb-existing/p5.md`. Produced per `.agents/rules/skills-mcp.md`
§2 rule 6 and §9 rule 6 (record the discovery result and why a ready-made
solution was or was not used).

## 1. Repository baseline (search existing components first)

| Existing asset | Path | Finding |
| --- | --- | --- |
| `Icon` + Hugeicons `Loading01Icon` | `src/components/ui/icon.tsx` | `Loading01Icon` is a two-lobed **hourglass** path, not a ring. Spinning it is the reported defect. Used by the old active sync row. |
| `Orb` (Thinking Orbs) | `src/components/ui/orb.tsx` | Sanctioned status animation, but tuned for 16–20px chat streaming. Too heavy for an 11px status row; p5 explicitly forbids oversized orbs there. |
| `AgentThinking` / `ThoughtLine` | `src/components/ui/agent-thinking.tsx`, `thought-line.tsx` | Activity surfaces for chat streaming. They carry labels/timers a compact sync row does not need. |
| Private CSS ring spinner | `src/features/codebase/components/workspace/plan-codebase-states.tsx` | Correct shape, but private to the loading card and not exported. |
| Private SVG spinner | `src/components/ui/button.tsx` (`isLoading`) | Inline spinner for button loading only; not a reusable primitive. |
| HeroUI `Spinner` | `@heroui/react` (already a dependency; used by `Tabs`, `ScrollShadow`, `Tooltip`) | Ready-made SVG spinner with gradient ring and `size`/`color` variants. |

## 2. Candidates evaluated

| Need | Candidates | Verdict |
| --- | --- | --- |
| Sync-row running indicator | (a) Hugeicons `Loading01Icon`; (b) HeroUI `Spinner`; (c) Thinking Orb; (d) new CSS ring | **Chosen: HeroUI `Spinner` via `@/components/ui/spinner`.** It is an installed, ready-made component; (a) is the hourglass defect, (c) is oversized for the row, and (d) would re-implement an available primitive. |
| Reduced-motion behaviour | (a) unconditional `animate-spin`; (b) `motion-safe:animate-spin` + `motion-reduce:animate-none`; (c) JS `matchMedia` gate | **Chosen: (b).** CSS-only, no effect, and it matches the existing reduced-motion convention in Studio/Scrape. |
| Status icon set | (a) mixed icon libraries; (b) Hugeicons through `Icon` | **Chosen: (b)** for checkmark, neutral dot, and error. One visual system, hairline stroke, `currentColor`. |

## 3. New dependencies required

**None.** The spinner comes from HeroUI, which is already installed. The
wrapper lives in `src/components/ui/` because this is a business-logic-free
primitive shared by three codebase onboarding surfaces.

## 4. Custom-implementation rationale

`src/components/ui/spinner.tsx` is a thin wrapper, not a new animation: the app
does not import HeroUI's component stylesheet, so the wrapper supplies the
display/size utilities and the `motion-safe` gating the SVG needs, plus
`aria-hidden` by default. No spinner geometry, keyframes, or progress logic was
written from scratch.

## 5. Consequence

`Loading01Icon` remains in unrelated billing/studio surfaces; the codebase
onboarding surfaces (sync status rows, token preparation, analysis conclusion)
now share the single spinner primitive.