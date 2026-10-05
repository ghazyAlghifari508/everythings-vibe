# everythings-vibe — [AGENTS.md](http://AGENTS.md)

> **Status: MANDATORY**
>
> Repository-wide execution contract for AI/coding agents working on **everythings-vibe / VibeEverything**.
>
> Keep this file small. Detailed rules live in `.opencode/rules/` and remain authoritative.

---

## 1. Rule Router

### Always read

Read fully to actual EOF before project work:

- `.opencode/rules/[basic-rules.md](http://basic-rules.md)`
- `.opencode/rules/[no-assumptions.md](http://no-assumptions.md)`
- `.opencode/rules/[skills-mcp.md](http://skills-mcp.md)`

### Read for implementation tasks

When modifying code, tests, config, schema, routes, state, or behavior:

- `.opencode/rules/[atomic-commit.md](http://atomic-commit.md)`
- `.opencode/rules/[no-hardcode.md](http://no-hardcode.md)`

### Read for typed code

When TypeScript/types/validation/DB contracts are involved:

- `.opencode/rules/[no-type-bypass.md](http://no-type-bypass.md)`

### Read for bugs, architecture, refactors, trade-offs, or scope decisions

- `.opencode/rules/[anti-satisficing.md](http://anti-satisficing.md)`

### Read for UI/UX/copy/responsive/accessibility work

- `.opencode/rules/[anti-ai-slop.md](http://anti-ai-slop.md)`

### Read for product/domain/workflow semantics

- `.opencode/rules/[prdfy-context.md](http://prdfy-context.md)`

These conditions are inclusive. A task may require several or all rules.

If uncertain whether a rule applies, read it.

A rule file is not considered read from previews, summaries, grep/search output, headings, cached memory, or truncated output. Continue in contiguous chunks until EOF.

---

## 2. Reading Is Not Compliance

Before implementation, convert every applicable rule into concrete task-plan/todo obligations.

For each applicable rule identify:

- required action;
- execution point;
- verification evidence.

If an applicable obligation is missing from the plan, **implementation is not authorized**.

Rules are not satisfied by vague reminders such as "follow best practices" or "verify later".

---

## 3. Mandatory Execution Flow

For implementation work:

```
request
→ load required rules
→ apply skills/MCP gate
→ operationalize rules into todos
→ inspect real repository evidence
→ trace source of truth + callers/consumers
→ search reusable existing solutions
→ evaluate real alternatives when needed
→ choose evidence-backed approach
→ implement one coherent milestone
→ verify milestone
→ inspect diff/status
→ atomic commit
→ repeat
→ final verification
→ runtime/browser QA when required
→ push
→ verify clean tree + zero outgoing commits + upstream sync
→ handoff
```

Do not skip required gates because the task seems small.

---

## 4. Evidence Before Assumptions

Never claim repository behavior from memory, convention, filenames, screenshots alone, or typical framework behavior.

Before changing or describing behavior:

- inspect the actual implementation;
- inspect important callers/consumers;
- trace the data/state flow;
- inspect schemas/types/config when relevant;
- inspect tests;
- inspect recent git changes for regressions.

Follow `.opencode/rules/[no-assumptions.md](http://no-assumptions.md)` for absence claims.

If evidence is incomplete, state uncertainty instead of guessing.

---

## 5. Root Cause Before Patch

For bugs/regressions:

```
symptom
→ reproduce/trace
→ establish root cause
→ identify affected states/consumers
→ fix mechanism
→ add regression protection
```

Do not:

- special-case one screenshot;
- swallow errors;
- add arbitrary delays/retries;
- fake success;
- weaken validation;
- bypass types;
- patch UI while leaving the real state model broken.

If root cause is not established, the bug is unresolved.

---

## 6. Correctness Over Convenience

Do not choose an approach because it is faster, shorter, easier, fewer files, fewer tokens, or easier to test.

For material decisions ask:

> If every viable option required the same effort, would I still choose this option?

If no, reject it. If uncertain, gather more evidence.

Do not reduce real scope for agent convenience.

---

## 7. Reuse Before Reinventing

Before creating a new component, hook, helper, service, schema, state abstraction, query, error model, or UI primitive:

1. search the repository;
2. inspect existing implementations and consumers;
3. choose reuse, composition, extension, or a genuinely new abstraction.

Do not duplicate behavior because understanding existing code takes longer.

---

## 8. Real State Only

Never fabricate:

- progress;
- percentages;
- processing stages;
- provider activity;
- fake streaming;
- fake persisted state;
- fake success.

User-visible state must come from real system signals.

If no real signal exists, show one honest neutral state.

---

## 9. Type Safety, Hardcoding, Security

When applicable, obey:

- `.opencode/rules/[no-type-bypass.md](http://no-type-bypass.md)`
- `.opencode/rules/[no-hardcode.md](http://no-hardcode.md)`

Do not hide type mismatches with broad assertions/suppressions.

Do not hardcode values that belong to a canonical source of truth.

Never weaken:

- authentication;
- authorization;
- ownership boundaries;
- credit atomicity;
- idempotency;
- validation;
- webhook verification;
- server/client secret boundaries.

---

## 10. UI and Copy

For UI work, `.opencode/rules/[anti-ai-slop.md](http://anti-ai-slop.md)` is mandatory.

Evaluate:

- hierarchy;
- composition;
- spacing/density;
- readability;
- typography;
- responsive behavior;
- accessibility;
- interaction clarity;
- state design;
- light/dark mode consistency;
- actual product context.

User-facing copy must describe real behavior and avoid filler, decorative AI wording, unnecessary technical internals, and misleading CTAs.

---

## 11. Tests Must Stay Honest

When a valid deterministic test fails, fix production behavior.

Do not:

- weaken assertions;
- delete valid tests;
- skip/comment-out failures;
- replace strong checks with vague existence checks;
- add shallow tests only to obtain green output.

Prefer deterministic contract/state/ownership/persistence tests.

Do not unit-test stochastic AI prose or purely visual implementation details unless contractually deterministic.

---

## 12. Product Invariants

VibeEverything must preserve:

1. real persisted workflow state;
2. safe atomic data/credit behavior;
3. strict type safety;
4. developer-grade UI quality;
5. Existing Codebase behavior grounded in real repository snapshots/context.

Legacy `PRDFY` / `PrdFy` identifiers may remain. Do not rename them blindly.

---

## 13. Commands

Do not invent scripts.

Before running commands, inspect current `package.json`, workspace configuration, and relevant docs/config.

Use exact repository scripts.

Long-running processes must use a managed/background workflow with readiness checks and cleanup.

---

## 14. Atomic Milestone Barrier

For every coherent logical milestone:

```
implement
→ required verification
→ inspect git diff/status
→ stage only files for that concern
→ atomic commit
→ record commit hash
→ only then continue
```

Do not implement all concerns first and reconstruct commits afterward.

One coherent reversible concern = one atomic commit.

---

## 15. Verification Gate

Run verification required by the actual task.

Depending on scope this may include:

- affected tests;
- typecheck;
- Biome/lint/check;
- no-type-bypass scan;
- build;
- ownership/security verification;
- API contract verification;
- browser/runtime QA;
- E2E;
- responsive/accessibility checks.

Do not skip required verification because it is slow or inconvenient.

If required verification cannot run, report the exact blocker.

---

## 16. Handoff Gate

Every implementation task plan must include:

- atomic commit checkpoints;
- final push;
- clean working-tree verification;
- outgoing-commit verification;
- upstream synchronization verification.

Before handoff, verify with actual git evidence:

- all intended task changes committed;
- no unrelated/generated/secret artifacts committed;
- all task commits pushed;
- working tree clean;
- zero outgoing commits;
- branch up to date with upstream.

Resolve current branch/upstream from git. Do not assume `main`.

If verification passes but handoff is incomplete, status is **Verified**, not **Complete**.

---

## 17. Completion Status

Use status precisely:

- **Implemented** — code written; full verification not established.
- **Verified** — required verification passed; handoff may still be incomplete.
- **Complete** — requirements + rules + verification + atomic commits + push + clean tree + zero outgoing commits + upstream sync all pass.
- **Partial** — required scope remains.
- **Blocked** — unresolved environment/credential/dependency/permission/conflict/decision prevents completion.

Green tests alone do not mean `Complete`.

---

## 18. Stop-on-Violation

If you discover that:

- a required rule was skipped;
- an applicable obligation was omitted from the plan;
- a decision relied on an assumption;
- a convenience shortcut was chosen;
- implementation conflicts with evidence;
- verification contradicts implementation;
- an atomic milestone was not committed correctly;

**STOP.**

Correct the process/repository state before continuing.

Do not preserve a wrong approach because work has already been invested.

---

## 19. Subagents

Subagents do not get weaker rules.

The parent agent must:

- route relevant rule files;
- provide verified task context;
- audit subagent output;
- remain responsible for integration, verification, git boundaries, push, and final status.

---

## 20. Context Loss / Compaction

If context is compacted/reset/handed off, or important constraints may have been lost:

1. stop;
2. re-read this [`AGENTS.md`](http://AGENTS.md);
3. reload required rules using the router above;
4. reconstruct task obligations;
5. inspect git evidence for already completed milestones;
6. only then continue.

Do not rely on compressed memory.

---

## 21. Final Completion Check

Before `Complete`, confirm:

### Scope

- requested behavior fully covered;
- root cause established for bug tasks;
- applicable states handled.

### Rules

- applicable rule files actually read;
- obligations executed;
- no convenience shortcut;
- no fake behavior;
- no hardcoded workaround;
- no type bypass;
- security/ownership preserved.

### Verification

- required tests/checks pass;
- required runtime/browser QA passes or is explicitly blocked.

### Git

- milestones committed atomically;
- push succeeded;
- working tree clean;
- outgoing commits = 0;
- upstream up to date.

If any required item fails, `Complete` is forbidden.

---

## 22. Final Directive

```
load only rules required by the task
but load every applicable rule fully
→ operationalize them into explicit todos
→ gather evidence instead of guessing
→ choose correctness over convenience
→ implement one coherent milestone
→ verify
→ atomic commit
→ repeat
→ final verification
→ push
→ prove clean/up-to-date git state
→ claim only the status supported by evidence
```

> **Most important invariant:** An applicable rule that exists only in memory will eventually be skipped. It must become a concrete task obligation, runtime constraint, and verification requirement.