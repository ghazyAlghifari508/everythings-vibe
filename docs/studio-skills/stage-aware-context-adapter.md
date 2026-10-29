# Stage-aware Studio skill context adapter

The upstream design skills (Impeccable, Frontend Design, UI UX Pro Max, Anti-Slop,
Taste) are shipped verbatim from pinned revisions. Their documents are large —
Anti-Slop is ~112 KB of Markdown, UI UX Pro Max ~51 KB plus CSV datasets — and
before this change the full assembled adapter was injected into every planning,
frame and correction prompt. Production logs showed `skillChars: 97166` for
Anti-Slop and `skillChars: 52898` for UI UX Pro Max, and the frame prompt is sent
once per screen plus once per repair round.

This adapter changes **delivery only**. It never rewrites a skill.

## Architecture

```
pinned SKILL.md + supporting docs (untouched, SHA-256 checked)
                    |
                    v
        studio-skill-context.server.ts
        split into whole ATX sections, classify per stage
                    |
      +-------------+-------------+
      |             |             |
   planning      frame        correction / revision
      |             |             |
      +-------------+-------------+
                    |
                    v
  same upstream identity, provenance-labelled sections
```

`buildStudioSkillContext(id, { stage, focus })` splits each pinned document into
whole sections at ATX headings (fence-aware), tags them, and greedily selects
whole sections under a hard character budget. A section that does not fit is
omitted in full and reported in `plan.omittedSections`; text is never cut
mid-sentence. Sections that are not selected simply do not appear. The emitted
prompt labels every section with its origin (`<!-- upstream … -->`), so any new
text can be diffed against the pinned asset.

The adapter is not a replacement skill. There is no generated summary and no
improvised instruction: `plan.selectedSections` only ever indexes verbatim
`STUDIO_SKILL_ASSETS` content, and the audit test asserts `nonVerbatimSections`
is empty for every stage.

## Budgets

`STUDIO_SKILL_STAGE_BUDGET_CHARS` in `src/features/studio/types/studio-constants.ts`:

| Stage | Budget (chars) | Token estimate | Why |
| --- | --- | --- | --- |
| planning | 20 000 | ~5 000 | product/visual direction matters; catalog detail does not |
| frame | 28 000 | ~7 000 | layout, components, accessibility and platform rules per screen |
| revision | 20 000 | ~5 000 | same as planning, but the existing identity dominates |
| correction | 12 000 | ~3 000 | the failed contract is in the user prompt; only fixing rules are resent |

The frame budget stays far below the 12 000 output-token cap and leaves room for
the PRD, blueprint and DESIGN.md that share the context window. Actual token
usage is recorded by the `planning-output` / `frame-output` timing events from
`outcome.inputTokens` when the provider reports it; the audit's token numbers are
the documented 4-chars-per-token estimate.

## Precedence

`STUDIO_SKILL_PRECEDENCE` is exported with the context plan and echoed by the
adapter header:

```
security/runtime constraints > explicit user requirements > PRD > DESIGN.md
  > shared blueprint > selected skill guidance
```

The numbered chain already ships in the planning and frame user prompts; the
adapter only points at it, so skill guidance cannot override user colors or
validated design tokens.

## Prompt-prefix caching

The gateway is 9router's OpenAI-compatible `/v1/chat/completions` (`ai-client.ts`).
Its surface has no `cache_control` / prompt-caching parameter, so no
provider-specific caching is implemented and no cache benefit is claimed. What
was verified deterministically: the frame system prefix (base contract + selected
skill sections) is byte-identical across repeated frames of the same skill and
stage, which is the precondition for any prefix reuse the gateway or upstream
provider may perform. That invariant is locked by
`studio-skill-stage-context.test.ts`.

## Component-first review (standalone HTML)

| Candidate | Outcome |
| --- | --- |
| shadcn/ui | React + Radix + `cn()` runtime; not renderable in a script-free single-file document. Only Tailwind token/class patterns transfer, and those already ship in the shared blueprint. |
| HeroUI | React components + `@heroui/styles`; same limitation. |
| Magic UI / React Bits | React/TSX (some need framer-motion); same limitation. |
| Thinking Orbs | Canvas/WebGL orbs require a script; Studio frames are static. |

No generic UI instruction was added. The verified component surface stays
semantic HTML + inline CSS/Tailwind from the shared blueprint, and
`studio-component-guidance.test.ts` renders the canonical shell for three
blueprints and asserts the only executable content is Studio's Tailwind token
config.

## Reproduce

```
pnpm vitest run src/features/studio/tests/studio-skill-context-audit.test.ts
pnpm vitest run src/features/studio/tests/studio-skill-stage-context.test.ts
pnpm studio:assets:check
```

The audit test prints a machine-readable JSON report (per skill: original source
chars, legacy adapter chars, and per-stage chars/tokens).
