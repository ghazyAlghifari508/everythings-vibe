# Existing Codebase FIX 05: Honest sync progress

## Event sources and transport

Reused the existing SSE endpoint, `GET /api/codebases/:id/sync-stream`, and its shared `readSyncStatusSnapshot` projection. No new transport, migration, dependency, or CLI protocol field.

| Observed backend activity | Persisted evidence | UI state |
| --- | --- | --- |
| Valid session exists; CLI has not connected | Session identity / `waiting_for_cli` | Agent wait spinner; preparation, upload, analysis pending |
| CLI handshake completes before local scan | `metadata.handshakeAt`, lifecycle `agent_connected` | Agent done; source preparation active |
| Manifest/chunks reach upload handlers | Lifecycle `upload_started`, stored manifest/chunks | Preparation done; upload active |
| Completion verifies manifest/chunks/hashes | Uploaded snapshot, lifecycle `snapshot_persisted` | Three sync rows done |
| AI attempt starts / fails / completes | Analysis attempt identity, status, created/updated timestamps | Independent analysis pending, failed, or ready |

The SSE server tails persisted state; it is not backend pub/sub. A fast operation can finish between reads. Its stored chronology remains visible through completion timestamps; the frontend does not replay a finished stage as running. Preparation is the real interval between handshake and upload start, not a newly invented CLI event.

`useOnboardingSyncProgress` reconciles recovery, SSE, and fallback polling into one session snapshot. Polling remains enabled until a valid stream frame arrives; reconnect retains the latest accepted state. Repeated opens without valid frames cannot reset the reconnect budget indefinitely.

`reconcileSyncStatus` checks repository/session identity, transport order, persisted timestamps, analysis-attempt creation/update order, and upload counts. Duplicate snapshots retain their object identity. Equal-timestamp chunk updates can advance counts but cannot rewind them. A previous attempt's late failure cannot replace a newer retry. Switching repositories releases the fallback poller's previously discovered session.

SSE carries only the validated status DTO, never the sync credential. Reconnect restores the current full server snapshot and its retained lifecycle; there is no claim of a per-event replay queue.

## Presentation and component reuse

Reused `SyncStageList`, `StageRow`, `StageIcon`, the existing HeroUI-backed `Spinner`, Hugeicons, and existing buttons/recovery UI. Reviewed the required references: [shadcn Spinner](https://ui.shadcn.com/docs/components/spinner), [HeroUI Spinner](https://www.heroui.com/docs/components/spinner), [Magic UI Animated List](https://magicui.design/docs/components/animated-list), [React Bits Stepper](https://reactbits.dev/animations/stepper), [Thinking Orbs](https://www.thinkingorbs.com/#orbs), and [affectUI components](https://www.affectui.com/components). Existing primitives already cover the required states; no added orb, animated list, gradient, or status card.

A validated session payload can establish waiting before the first status frame. Without a session, no agent-wait activity is claimed. Session-creation pending remains a separately labelled request. Waiting has no fabricated start time. Elapsed timers run only for active rows with recorded starts and stop on completion/failure. Analysis retry does not reuse the previous failed attempt's timer. A usable ready analysis suppresses stale failure/retry presentation. Existing readiness guards enable workspace navigation only for usable analysis.

Upload completion timestamps require `snapshot_persisted`. `snapshotCreatedAt` is recorded during handshake and cannot stand in for completion on older sessions. A failing-before/passing-after regression preserves this distinction.

## Changed files

Paths below are relative to `src/features/codebase/` unless prefixed with `docs/`.

- `services/sync-status-reconciliation.ts`: shared ordering and deduplication.
- `services/sync-progress-event.ts`: finite persisted timestamps, including analysis creation.
- `hooks/use-onboarding-sync-progress.ts`: recovery/SSE/polling integration.
- `hooks/use-codebase-sync-status.ts`: reconcile seeds/results and release repository identity.
- `hooks/use-codebase-sync-stream.ts`: shared reconciliation, stale connection guards, reconnect budget.
- `hooks/use-codebase-onboarding.ts`: consume the integrated progress hook.
- `services/sync-stages.ts`, `services/sync-stage-rows.ts`: session-backed waiting spinner, real preparation completion timestamp.
- `components/workspace/screen-connect.tsx`, `screen-connect-sync-step.tsx`: initial waiting evidence and one progress presentation.
- `components/workspace/sync-stage-list.tsx`, `sync-stage-row.tsx`: analysis completion/retry precedence and terminal timer cleanup.
- `tests/onboarding-sync-progress.test.tsx`, `sync-status-reconciliation.test.ts`, `sync-progress-p5.test.tsx`: new regressions.
- Existing stage, indicator, observability, gating, onboarding-display, and resync-modal tests: updated superseded passive-wait expectations.
- `docs/codebase-fix04-lifecycle.md`: superseded waiting behavior corrected; unrelated pre-existing edits retained.

## Acceptance coverage

| P5 scenario | Non-browser evidence |
| --- | --- |
| 1. Initial waiting spinner | `sync-progress-p5`, stage indicators, gating |
| 2–3. Connected / preparation running | Sync stage tests; native CLI/HTTP/PostgreSQL smoke |
| 4. Upload completes | Stage indicators; native verified-file upload |
| 5–6. Independent analysis / analysis failure preserves sync | Stage indicators; native pending/failed analysis projection |
| 7. Ready enables workspace | Existing plan-codebase conclusion / readiness tests |
| 8–10. Duplicate / out-of-order / stale session | Reconciliation and integrated progress hook tests |
| 11. Reconnect / refresh | Integrated hook, stream, and plan-codebase refresh tests |
| 12. Fast stages | Persisted chronology tests; native lifecycle verification |
| 13. No invented counts | Stored manifest/chunk counts; native 0-to-1 verified upload |
| 14. No artificial delay | Immediate terminal state and no replay timers in `sync-progress-p5` |
| 15. No session, no false loading | `sync-progress-p5` no-session case |
| 16. API / CLI compatibility | Unchanged real CLI client against production upload handlers; CLI contract suites |

## Native smoke result

A throwaway Node script used the real CLI client over loopback HTTP and production handshake/manifest/file/complete handlers with an isolated PostgreSQL schema. Observed `waiting_for_cli`, `connected`, `uploading`, `uploaded`, analysis `pending`, `failed`, retry `pending`, and `ready`. One source file passed completion verification. Persisted lifecycle was `agent_connected`, `upload_started`, `snapshot_persisted`. The status/event payload omitted the credential; foreign tenant read returned 404. Analysis transitions were seeded in the isolated database to exercise status delivery, not a live model invocation. The script and schema were removed afterward.

No browser, Playwright, Puppeteer, or screenshot QA was run.

## Verification results

| Check | Observed result |
| --- | --- |
| Targeted Biome check | 22 files passed |
| `pnpm exec tsc --noEmit` | Passed |
| `pnpm build` | Passed; 22 pinned Studio assets verified, client/server output generated |
| Polling hook regression suite | 14 tests passed |
| Integrated recovery/SSE/polling suite | 4 tests passed |
| Event identity, reconciliation, stage mapping, stream hook | 50 tests passed across 4 files; stage suite rerun after legacy timestamp fix (29 passed) |
| P5 waiting/terminal timer/fast chronology cases | 6 tests passed |
| Stage indicators and observability | 18 tests passed across 2 files |
| CLI transport, CLI codebase command, handshake | 73 tests passed across 3 files |
| Conclusion, refresh, workspace readiness | 26 tests passed across 3 files |
| Onboarding consumer and recovery regressions | 34 tests passed across 6 files |
| Gating, session reset, resync modal, display states | 77 tests passed across 4 files |
| `pnpm --dir packages/cli build` | Passed |
| Native HTTP/PostgreSQL smoke | Passed |

Some combined test invocations and the first typecheck hit their command deadlines; those are not counted as passes. The recorded passes above are completed, narrower invocations. Build emitted `pg` Node-module externalization and bundle-size warnings; it completed successfully. The legacy resync suite emitted React `act(...)` environment warnings but all assertions passed.

