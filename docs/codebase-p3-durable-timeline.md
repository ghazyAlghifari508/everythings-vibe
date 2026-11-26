# P03 — Durable workspace conversation and chronological timeline

Branch: `feature/vibeplan-existing-codebase`.
Status: implemented and verified with targeted tests. No browser QA in this phase
(the brief defers UI polish to P04–P06).

## Problem

The workspace kept conversation in React state (`chatMessages`) and rendered it
above every question, artifact and handoff block, so an assistant reply about AC
appeared above the clarification card. The initial prompt lived only in the Ask
handoff, so it vanished as soon as the composition of local state changed, and
nothing tied a message to the stage that produced it.

## Storage

`messages.workspace_event` (jsonb, nullable) is the persisted event record. The
existing `messages` / `conversations` tables are reused; no parallel history
table was added.

- Migration: `drizzle/0047_codebase_workspace_timeline.sql`
  (`ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "workspace_event" jsonb;`).
  Additive and idempotent. Existing rows keep `NULL`, so legacy conversations
  still select and stream exactly as before.
- One conversation per plan: `workspace:<projectId>`.
- Event identity is stable and content-addressed where the source has no natural
  id (`0:prompt:<projectId>`, `2:questions:<sha256>`, `3:artifact:<artifactId>`,
  `4:revision-request:<proposalId>`, `9:handoff:<projectId>`).
- Message id is `<conversationId>:<eventId>`, so a retry with the same request id
  upserts instead of appending. A retry that changes content, stage or type is
  rejected with `MESSAGE_IDENTITY_CONFLICT` instead of silently rewriting
  history.

Event shape (`src/features/codebase/types/workspace-timeline.ts`): `id`,
`codebaseId`, `projectId`, `type`, `stage`, `status`, `content`, optional
`operationId` / `artifactId` / `proposalId` / `questionId` / `questions` /
`answers`, plus `createdAt` / `updatedAt`. Parsed with Zod at every server and
client boundary.

## Reconstruction

`readWorkspaceTimeline(userId, scope)` runs in one transaction:

1. `assertWorkspaceScope` verifies the plan belongs to the user, the repository,
   mode `existing_codebase`, and is not soft-deleted.
2. Persisted events are read from `messages` for that conversation; legacy rows
   without `workspace_event` become `legacy:<messageId>` messages tagged `prd`.
3. Ask handoff, generation operations, feature/PRD/AC/Task artifacts and revision
   proposals are read for the same scope only.
4. `restoreWorkspaceEvents` fills in what the timeline is missing, never what it
   cannot prove: no assistant message is ever fabricated.
5. Restored events are persisted through the same idempotent upsert, so a reopen
   converges instead of duplicating.

Ordering is `createdAt`, then a fixed per-type rank (message → generation →
question set → answers → artifact → assistant/proposal → revision outcome →
handoff), then `id`. Terminal lifecycle states win ties against `running`, so a
late duplicate delivery cannot downgrade a completed stage.

Live state is merged with persisted state and recomputed on focus, after a saved
answer, and after every operation settles. A late completion from feature A is
dropped when feature B is selected (`activeProjectIdRef`, request epoch, and
scope filtering in both the hook and the merge).

## Rendering

`CodebaseChatWorkspaceTimeline` builds one ordered entry list from the events and
renders each entry with the existing components: `CodebaseChatWorkspaceMessages`
for a message, the question card, `CodebaseFileCard` for an artifact, the stage
action row, the revision banner and the handoff card. Nothing was rebuilt.
Artifacts already reachable through hydration are appended once when the
timeline does not reference them, so documents and Kanban never disappear while
the read settles.

Loading and failure are explicit: `timelineStatus === "pending"` renders a
loading line inside the active view, `"failed"` renders a retry row and keeps the
documents. A pending or failed history is never turned into an empty workspace.

## Component discovery

The brief names HeroUI, shadcn, Magic UI, React Bits, affectUI, TuffUI, CUI,
SakaniUI and ThinkingOrbs. Each was checked against this surface:

| Source | Candidate | Verdict |
| --- | --- | --- |
| Repository | `CodebaseChatWorkspaceMessages`, `CodebaseChatWorkspaceQuestions`, `CodebaseFileCard`, `CodebaseChatWorkspaceStageHandoffs`, `CodebaseChatWorkspaceHandoffCard`, `CodebaseChatWorkspacePendingRevisionBanner` | **Reused.** The brief forbids rebuilding the question and document cards, so every entry renders through the component that already owns that anatomy. |
| Repository | workspace scroll container (`overflow-y-auto` in `codebase-chat-workspace.tsx`) | **Reused.** One real scroll region, unchanged. |
| Repository | `ScrollShadow` (already used in `codebase-kanban-board.tsx`), `Orb` / `ThoughtLine` / `AgentThinking` | **Not applied here.** The kanban board and the single activity line already own these; the timeline adds neither a second shadow treatment nor a second activity indicator. |
| shadcn | `ScrollArea` | Rejected: replaces the container that already sizes and scrolls the workspace, for no behavioural gain. |
| Magic UI | [Animated List](https://magicui.design/docs/components/animated-list) | Rejected: it animates each row in sequence and auto-replays the list, which the brief explicitly forbids for history. |
| React Bits | [Animated List](https://reactbits.dev/components/animated-list) | Rejected: same replay/motion problem; the component's own docs list it as scrolling rows that spring into view with a gliding selection. |
| affectUI | [Thinking State](https://www.affectui.com/components/thinking-state) | Rejected: it reveals steps on a timer, which would fabricate progress the server did not report. |
| TuffUI | `checkpoint-timeline`, `deploy-timeline` | Rejected: they ship their own timeline chrome and event model, replacing the workspace instead of ordering it. |
| HeroUI | `ScrollShadow`, `ListBox` | Rejected: no equivalent list primitive is needed, and `ScrollShadow` would duplicate the kanban board's treatment on a different surface. |
| CUI | native C component toolkit | Rejected: not a React surface. |
| SakaniUI | glass/liquid-glass component system | Rejected: a second design system against the project's tokens. |
| ThinkingOrbs | status orbs | Rejected: the workspace already renders one activity line through `src/components/ui/agent-thinking.tsx`. |

No dependency was added. The timeline is one ordered list inside the existing
scroll container.

## Verification

`pnpm vitest run --maxWorkers 1 --no-file-parallelism` over the nine touched
suites: 51 tests passed.

- `workspace-timeline.test.ts` — ordering, scope isolation, idempotent
  restoration, prompt preservation, duplicate lifecycle prevention, stage
  association, failed-artifact view, late completion, tie-break status.
- `workspace-timeline-hook.test.tsx` — A → B → A reopen, late A completion
  dropped, failed hydration reported and retried, reopen from server state.
- `workspace-timeline-render.test.tsx` — rendered stage associations in
  chronology and after handoff, identical on reopen.
- `workspace-timeline.integration.test.ts` — real Postgres schema per run:
  migration applied twice, prompt survives reopen after handoff, concurrent
  message retries deduplicate, changed payloads rejected, tenant/repository/plan
  isolation, running → completed reconciliation without replaying assistant
  text, new snapshot keeps timeline and Kanban, revision retries keep one
  request.
- `workspace-composer-isolation.test.tsx` — creation dedupe, retry identity, A
  does not launch after switching to B mid-save.
- `clarification-persistence-*.test.tsx`, `composer-redesign-modes.test.tsx`,
  `workspace-revision-hook.test.tsx` — existing suites for the touched hooks.

`pnpm biome check --write` on the 36 touched files: clean.

Type checking: the repository-wide `pnpm exec tsc --noEmit` still fails on
`src/features/studio/tests/studio-composer.test.tsx:241`
(`Promise.withResolvers` needs `lib: es2024`), which predates this work and is
outside P03. The touched-file program was checked separately.

## Legacy limitations

- Messages written before this migration have no stage. They are restored as
  `prd` messages under `legacy:<messageId>` because that is where the old
  workspace rendered them; their true stage cannot be recovered.
- The initial prompt is restored from the Ask handoff when no persisted user
  message exists, with the stable id `0:prompt:<projectId>`, so it can never
  appear twice. A prompt older than the handoff row itself is not recoverable.
- Question sets are deduplicated by content hash. Two genuinely different
  question sets with identical text collapse into one entry.
- Resolved assistant replies stored outside `messages` (for example in a
  generation result) are not turned into chat messages; only a reply the model
  actually produced and stored is shown.