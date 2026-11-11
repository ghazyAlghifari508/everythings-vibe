# P8: Persistent Chat and Canvas Workspace

Implemented Prompt 08. No browser QA, Playwright E2E, merge, or deployment was performed.
The explicit session instruction and `AGENTS.md` require atomic commits and a push;
that instruction takes precedence over the brief's final no-commit/no-push sentence.

## Architecture

A Studio project owns one conversation. `studio_messages` stores conversation turns;
`studio_jobs`, `studio_frames`, and existing revision records remain the execution
and design sources of truth. No separate generation service or acknowledgment LLM
was added.

- `studio-conversation.ts` appends one user/assistant pair per accepted operation
  and materializes public assistant progress from persisted jobs and frames.
- `studio-conversation-progress.ts` derives queued, planning, generating, completed,
  partial, and failed states. Screen names appear only after persisted planning
  completion. Revision success requires that operation's completed job and a newer
  persisted frame revision, not merely existing HTML.
- Existing enqueue, job-claim, fenced-write, retry, and stalled-job recovery paths
  synchronize messages inside their transactions. Closing a panel or browser does
  not own or cancel generation.
- `getStudioProjectDetail` reads messages, frames, and jobs in its existing
  repeatable-read transaction. The authenticated loader and project status API
  return that same conversation; loaders do not create messages.
- `useStudioStatus` refreshes the shared workspace state through existing polling
  and reconnect handling. Chat and canvas consume that state together.

## Persistence and ownership

| Field | Meaning |
|---|---|
| `id` | Stable message identity |
| `project_id`, `user_id` | Conversation boundary and tenant owner |
| `operation_id`, `job_ids` | One logical request and its execution jobs |
| `role`, `content` | Original user prompt or factual assistant summary |
| `order` | Project-local creation order |
| `status` | Accepted user turn or current assistant lifecycle state |
| `attachments` | Existing selected-frame IDs and display names |
| `progress` | Verified phase/counts, persisted screen names, recovery category |
| `created_at`, `updated_at` | Creation and projection-update timestamps |

The project lock serializes append ordering. Unique indexes enforce one role per
operation/owner/project and one order position per project. Message reads and
updates include both project and user predicates; appends additionally verify
project ownership and every supplied job's owner/project. Foreign frame targets
are rejected through the existing operation targeting contract.

Raw provider errors, traces, credentials, and model internals are not copied into
messages. Recovery metadata is limited to `planning`, `frames`, or `resubmit`.

## Landing handoff and operation flow

1. `/design` submits through the existing generate API. A submission guard prevents
   concurrent client launches; the existing server launch deduplication is
   serialized per user with a transaction advisory lock.
2. Project, initial job, placeholder frames, original user prompt, and assistant
   turn are committed together before navigation.
3. The workspace loader returns those durable messages. Reopening history or
   rerunning the loader only reads them.
4. A real planning write supplies screen names. Frame writes update canvas HTML
   and assistant ready counts through the same fenced transaction boundary.
5. Follow-up requests use `/api/studio/frame` with `action: "operation"`. Existing
   intent resolution, dependency queues, base revisions, and job fencing remain
   responsible for add/revise behavior. Initial generation is not cancelled.
6. The client retains a request UUID for the prompt/target signature until a
   response confirms it. A retry after an uncertain submission or reload reuses
   that identity; server request hashing rejects a conflicting payload.
7. Planning and frame failures retain the existing canvas recovery actions.
   Partial progress preserves ready frames. Successful recovery updates the
   existing initial assistant turn rather than creating a second initial turn.

Assistant turns are current operation summaries, not an append-only stream of
internal events. There is no simulated typing, countdown, percentage, or
additional decorative model request.

## Workspace UI and component sources

The header stays outside canvas interactions. Desktop uses a collapsible left
panel; removing it returns its layout width to the canvas. Below 1024 px the chat
uses a controlled modal drawer rather than shrinking the canvas. Breakpoint
changes close the mobile modal, Escape dismisses it, and focus returns to the
header reopen control.

`StudioWorkspace` owns draft state above the conditionally mounted panel.
`sessionStorage` keys include both user and project for drafts, pending request
identity, and selected frame IDs. Storage denial leaves the in-memory draft
usable. Accepted submission clears only the submitted draft; text typed while a
request is pending remains intact. Failed submissions retain draft and targets.

The existing selection model supplies removable selected-frame chips and stored
attachment references. Contextual screen suggestions are compact composer
controls, not large cards over the canvas. Canvas geometry no longer reserves
space for the removed floating composer; existing pan/zoom and selection behavior
remain independent of chat progress.

| Source inspected | P8 decision |
|---|---|
| Existing EvVibe primitives | Reuse `Icon`, `Spinner`, existing composer, suggestions, selection, canvas, and recovery controls |
| [HeroUI](https://www.heroui.com/) | Adopt installed `TextArea` and `ScrollShadow`; no bespoke textarea or scroll primitive |
| [shadcn Sheet](https://ui.shadcn.com/docs/components/radix/sheet) and [Resizable](https://ui.shadcn.com/docs/components/radix/resizable) | Reuse installed Radix Dialog for the drawer's focus trap, Escape handling, and modal behavior. Drag resizing is not required; no new resizable implementation |
| [TUFFUI](https://tuffui.com/components) | Catalog includes Agent Composer, Chat Thread, and Prompt Suggestions. Existing domain composer already owns targeting and requests; no second composer system |
| [affectUI Chat Composer](https://www.affectui.com/components/chat-composer) | Inspected; no source copied or extra picker/voice capabilities added |
| [Magic UI Animated List](https://magicui.design/docs/components/animated-list) | Delayed list animation is unsuitable for factual job progress; not adopted |
| [React Bits](https://reactbits.dev/) | Animation catalog inspected; no motion runtime added |
| [Thinking Orbs](https://www.thinkingorbs.com/) | Actual status components inspected; existing spinner is sufficient for active persisted phases |
| [CUI](https://yappologistic.github.io/CUI/components/) | Native C component catalog; not a compatible React primitive dependency |
| [SakaniUI](https://www.sakaniui.com/docs) | Separate token-driven React design system; existing installed primitives avoid introducing another design system |

No component-library dependency was added for P8. API/export names were checked
against the installed packages and current documentation, including Context7.
P1's Stitch, OpenDesign, and Doop research supplied interaction concepts, not a
copied interface or a separate task queue.

## Migration

`drizzle/0047_studio_conversation.sql`, its snapshot, and the migration journal
add `studio_messages`, ownership foreign keys with cascade deletion, and indexes.
Apply the migration to another environment with `pnpm db:migrate` before running
the updated application or worker.

The backfill groups durable jobs by project, owner, and request ID (falling back
to job ID), so multi-target operations do not produce duplicate user turns.
Historical roles receive stable IDs and chronological project-local order.
Projects predating durable jobs recover real user prompts from their stored
revisions without invented assistant replies. No existing project, job, frame,
revision, or generated HTML is dropped or regenerated.

## Verification

Final targeted run: **10 files passed, 163 tests passed**.

```text
pnpm vitest run src/features/studio/tests/studio-conversation.integration.test.ts src/features/studio/tests/studio-chat-workspace.test.tsx src/features/studio/tests/studio-composer.test.tsx src/features/studio/tests/studio-status.test.ts src/features/studio/tests/studio-canvas.test.tsx src/features/studio/tests/studio-canvas-view.test.ts src/features/studio/tests/studio-operation-dependencies.integration.test.ts src/features/studio/tests/studio-frame-route.test.ts src/features/studio/tests/studio-project-route.test.ts src/features/studio/tests/studio-suggestion-row.test.tsx
pnpm exec tsc --noEmit
```

Typecheck passed. Biome checked the 38 touched TypeScript/TSX files successfully
and applied formatting. No repo-wide test/build run or paid generation was needed
for this mechanical verification.

| P8 acceptance | Exercised evidence |
|---|---|
| Exactly one durable initial prompt | Conversation integration: duplicate launch, original whitespace, stable initial job links, repeated detail reads |
| Reload and history reopen retain conversation | Conversation integration: repeated authenticated project-detail reads; workspace remount cases |
| Collapse preserves draft and progress | Workspace interaction: selected frame/draft survive collapse, status update, reopen, remount |
| Queued follow-up survives reload | Conversation integration: concurrent identical operations, dependency identity, durable role/order/target sequence |
| Actual assistant progress | Conversation integration: persisted plan, independent first frame, partial failure, retry, completed recovery |
| Failed submit preserves draft | Workspace interaction: failed request, remount, same request UUID, newer typing not cleared |
| No duplicate messages/jobs | Conversation integration: duplicate launch, concurrent operation retries, request-hash conflict, planning retry reuses initial turn |
| Cross-user/project isolation | Conversation integration: foreign project reads, unauthorized operations, cross-project frame targets rejected without new turns |
| Ready/partial/failed reconciliation | Conversation integration: failed planning; partial frame recovery; old ready HTML never counts as a successful queued/failed revision |
| Existing revision endpoints | Existing frame-route and operation-dependency suites remain green |
| Controlled mobile panel | Workspace interaction at 360/768 px: Escape, focus return, draft preservation, desktop breakpoint transition |
| Reconnect and context stability | Workspace interaction: refreshed progress retains draft; failed selected-frame request retains target and operation identity after reload |
| Canvas remains usable | Existing canvas/view suites and updated fit/zoom geometry pass without the floating-composer exclusion zone |

## Known limits and explicit boundaries

- Browser rendering and interactive visual QA were deliberately not exercised,
  as P8 explicitly prohibits browser QA and Playwright E2E. Mobile behavior above
  is jsdom interaction coverage, not a claim of visual device verification.
- Status uses existing project polling and reconnect refresh, not token streaming
  or a new SSE protocol. Backend persistence does not depend on polling.
- Unsent drafts and pending client identities are tab-session preferences, not
  cross-device database records. Submitted messages are database-backed.
- Legacy backfill can only use stored job/revision prompts; it cannot recover
  formatting or progress events that older versions never persisted. Historical
  assistant copy is factual and generic until subsequent lifecycle writes supply
  the normal detailed projection.
- Chat submits supported Studio add/revise operations through the existing intent
  classifier; it is not a separate general-purpose conversational agent.
- Full attachment interaction belongs to P9. Element targeting/editing belongs
  to P10. P8 reuses frame selection only; no independent targeting model, voice,
  or manual visual editor was introduced.
