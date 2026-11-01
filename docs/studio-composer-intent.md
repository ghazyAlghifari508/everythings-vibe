# Studio composer intent

The canvas composer is the only entry point that creates or revises screens. One
free-text message plus the real canvas selection resolves to exactly one
operation; a missing selection is never read as "revise the whole project".

## Command architecture

```
Composer message + selected frame ids
              |
              v
     Intent resolution
       (deterministic, then bounded classification)
              |
              v
      Validated operation
              |
   +----------+-----------+-----------+----------+
   v          v           v           v
ADD_SCREEN  REVISE_SELECTED  REVISE_PROJECT  CLARIFY
   |          |              |               |
new frame   target the     explicit        ask the user
+ add job   selected ids   all frames      what to change
```

`enqueueStudioOperation` owns resolution and persistence; the HTTP route only
validates the payload. The worker (`runStudioFrameOperation`) still owns
generation, so the request stays fast and durable.

## Intent rules

`resolveStudioIntentFromContext` is pure and covers the unambiguous cases
without a model call, in this precedence:

1. an add verb bound to a screen noun (`"Buat halaman Profile"`,
   `"Tambahkan layar Pengaturan"`) → `add_screen`, with the requested names
   parsed from the clause after the noun. `"Buat halaman lebih responsif"` is a
   modifier clause, not a name, so it is left for classification.
2. an explicit scope quantifier bound to the screen noun
   (`"Ubah semua halaman menjadi lebih minimal"`) → `revise_project`.
   `"semua tombol di halaman ini"` does not bind, so it stays a selected-frame
   revision.
3. non-empty selection → `revise_selected`.
4. otherwise `null`: the bounded classifier in
   `studio-composer-intent.server.ts` asks the existing model gateway for one of
   `add_screen | revise_project | clarify` (`STUDIO_INTENT_MAX_TOKENS = 200`).
   A model `revise_project` is only accepted when the message itself carries an
   explicit scope word; anything else degrades to `clarify`. A missing or
   malformed provider response also yields `clarify`.

The classifier only names screens for `add_screen`; project rewrites and
clarifications never reach the model with a destructive default.

## Validation before persistence

- project ownership (`WHERE user_id = ?`, re-read `FOR UPDATE`),
- frame membership for revision targets,
- new-screen count (`STUDIO_MAX_PAGE_COUNT` per request),
- duplicate names within the request and against existing screens
  (`STUDIO_DUPLICATE_SCREEN`, HTTP 409),
- job idempotency: `${requestId}:add:${index}` and `${requestId}:${frameId}`,
  so a repeated submit reuses the queued jobs instead of adding a duplicate,
- concurrent operations still refuse to re-queue a frame that is
  `queued`/`generating`.

## Add-screen preserves the project

`add_screen` inserts only the new frame rows (status `queued`) and one `add` job
each. Existing HTML, preview assets, statuses, blueprint, design tokens, design
skill, DESIGN.md and PRD context are reused, not rebuilt. The new frame is named
from the message when the user named it; otherwise the worker names it from the
prompt. A completed add writes one revision row, so the screen persists across
reload and history.

Navigation policy: the shared blueprint's `navigationContract` is not mutated.
Existing frames already carry their assembled shell, and regenerating them to
add a destination would silently change completed screens, so the new screen
reuses the existing navigation. If the new name matches a destination it is
marked active by assembly; otherwise it is reachable on the canvas without an
active nav item. A future "approve navigation changes" flow can lift this
deliberately.

## Removed legacy manual add-page flow

- header menu action `+ Tambah Halaman` and its `onAddFrame` prop,
- `studio-add-frame-dialog.tsx` (modal state, handlers, props),
- `studio-frame-service.ts` (`addStudioFrame`, `reviseStudioFrame`),
- route `add` and `revise` actions plus their schema variants and imports,
- `resolveComposerScope` and the `StudioComposerScope` type.

The backend ability to create a frame is not removed: it moved into the
composer-driven `add_screen` operation.

## Verification

```sh
pnpm vitest run src/features/studio/tests/studio-composer-intent.test.ts
pnpm vitest run src/features/studio/tests/studio-composer-intent-server.test.ts
pnpm vitest run src/features/studio/tests/studio-composer.test.tsx
pnpm vitest run src/features/studio/tests/studio-frame-route.test.ts
pnpm vitest run src/features/studio/tests/studio-operations.integration.test.ts
pnpm vitest run src/features/studio/tests/studio-add-screen.integration.test.ts
```

No browser QA. `studio-worker-lock.integration.test.ts` fails while a separate
live studio worker holds the session dispatch advisory lock; stop the worker (or
run it in a dedicated database) before the integration suite.
