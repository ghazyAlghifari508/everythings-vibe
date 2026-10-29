# Existing Codebase — P3 Component Discovery Record

Scope: the recovery UI touched by `docs/prompts-cb-existing/p3.md` (the failed /
pending analysis status card, its single retry action, and the credit-recovery
action). Produced per `.agents/rules/skills-mcp.md` §2 rule 6 ("record the
discovery result and the reason a ready-made solution was insufficient").

Exploration of the listed registries (`ui.shadcn.com`, `heroui.com`,
`magicui.design`, `reactbits.dev`, `thinkingorbs.com`) was done against the
installed primitives in this repository rather than by live browsing, because
the task forbids browser QA and the recovery surface is a status card, not a new
visual system.

## 1. Repository baseline (search existing components first)

| Existing asset | Path | Use in the recovery UI |
| --- | --- | --- |
| `Button` (CVA) | `src/components/ui/button.tsx` | "Coba analisis lagi" action; `buttonVariants` styles the "Tambahkan Kredit" anchor without abusing `asChild` |
| `Alert` / `AlertDescription` | `src/components/ui/alert.tsx` | In-area failure message (the only error surface) |
| `Icon` (Hugeicons wrapper) | `src/components/ui/icon.tsx` | `AlertCircleIcon` (failure), `Loading01Icon` (pending) |
| `CodebaseConclusion` | `src/features/codebase/components/planning/codebase-conclusion.tsx` | The existing analysis status component; already reused by `ScreenConnect` and `WorkspaceConnectionScreen` |
| `ScreenConnect` / `ScreenIncompleteSync` | `src/features/codebase/components/workspace/` | Initial sync flow; the P3 card keeps its `bg-snow text-onyx` CTA language |
| `Orb` / `AgentThinking` (Thinking Orbs) | `src/components/ui/orb.tsx`, `src/components/ui/agent-thinking.tsx` | Already used for chat streaming status; left in place, not added here |

## 2. Third-party libraries evaluated

| Area | Candidates | Verdict |
| --- | --- | --- |
| Failure message surface | (a) repo `Alert`; (b) shadcn `Alert`; (c) HeroUI `Alert` | **Chosen: repo `Alert`.** It is the shadcn primitive vendored into `src/components/ui`, already themed with the repo tokens (`border-graphite`, `border-crimson/40`). HeroUI is installed and used elsewhere, but pulling a second alert implementation into the same card would duplicate the primitive. |
| Primary retry action | (a) repo `Button`; (b) HeroUI `Button`; (c) raw `<button>` | **Chosen: repo `Button`.** `design-layout-consistency.md` §8.2 requires the `Button` primitive and forbids duplicating button markup. |
| Pending status indicator | (a) existing `Loading01Icon` spinner; (b) `Orb` (Thinking Orbs); (c) Magic UI / React Bits animated text | **Chosen: the existing spinner.** Thinking Orbs is sanctioned only for status animation, and the spinner already communicates "running" without fabricating progress; `Orb`/`AgentThinking` remain reserved for the chat stream they were built for. |
| Status card container | (a) existing `section` card; (b) shadcn `Card`; (c) Magic UI `BentoGrid`/`ShimmerButton` | **Chosen: the existing `section` card.** p3 §5 forbids decorative or oversized error treatments; a bento/shimmer wrapper is decoration, not status. |

## 3. New dependencies required

**None.** Every element of the recovery UI is composed from primitives already
present in `src/components/ui/` plus Hugeicons through the `Icon` wrapper.

## 4. Custom-implementation rationale

No new custom component was created. The only handwritten pieces are the copy
strings and the readiness projection (`workspace-readiness.ts`), which are
domain logic, not UI primitives. Where a standard pattern was needed (button,
alert) the repo primitive is used.
