# everythings-vibe [AGENTS.md](http://AGENTS.md) — Mandatory Execution Contract

> **Status: MANDATORY**
>
> This file is the repository-wide execution contract for every AI agent, coding agent, reviewer, and subagent working on **everythings-vibe**.
>
> This file does **not** replace the detailed rule files. It defines the enforcement layer that turns those rules into runtime gates, task-plan obligations, verification evidence, git milestones, and completion requirements.
>
> A task is not acceptable merely because the result appears to work. The investigation, decisions, implementation, verification, git workflow, and completion claim must all comply with the applicable repository rules.

---

## 1. Canonical Rule Sources

The canonical repository rule directory is:

```
.opencode/rules/
```

Before doing project work, fully load and obey these files:

```
.opencode/rules/anti-ai-slop.md
.opencode/rules/anti-satisficing.md
.opencode/rules/atomic-commit.md
.opencode/rules/basic-rules.md
.opencode/rules/no-assumptions.md
.opencode/rules/no-hardcode.md
.opencode/rules/no-type-bypass.md
.opencode/rules/prdfy-context.md
.opencode/rules/skills-mcp.md
```

These files form one rule system.

Do not weaken them into vague summaries such as:

- "follow best practices";
- "use clean code";
- "avoid AI slop";
- "be careful with assumptions";
- "keep the rules in mind";
- "remember to verify later".

Each file has its own scope, requirements, prohibitions, exceptions, and verification rules.

### 1.1 Repository-relative paths only

Rule references in this repository MUST use repository-relative paths.

Do not depend on stale machine-specific paths such as:

```
C:/Coding/...
D:/...
/home/<user>/...
```

A repository rule must remain valid when the project is cloned on another machine.

### 1.2 Product naming

The current product is **everythings-vibe / VibeEverything**.

Some legacy files, comments, identifiers, environment keys, or historical rule names may still contain `PRDFY` / `PrdFy`. Do not rename those blindly.

Treat:

- current product behavior,
- current source code,
- current schema,
- current package manifests,
- current runtime configuration,

as evidence of current implementation.

Legacy naming is not permission to assume semantics. Verify before changing it.

---

## 2. Precedence and Conflict Handling

If instructions appear to conflict:

1. Re-read the exact conflicting text.
2. Use the most specific approved requirement.
3. Treat actual source code, package manifests, migrations, runtime configuration, and persisted data as evidence of current behavior where repository rules say they are authoritative.
4. Do not silently choose the easier interpretation.
5. If the conflict materially changes implementation and cannot be resolved from approved sources, stop and surface the conflict before changing code.

A later task prompt does **not** silently waive repository rules.

A rule is waived only when the user explicitly changes or overrides that rule.

Silence is not a waiver.

---

## 3. Skill / MCP Gate Comes Before Action

Before any action, first apply:

```
.opencode/rules/skills-mcp.md
```

This includes actions that may look harmless:

- asking a clarifying question;
- browsing files;
- listing repository structure;
- reading implementation code;
- brainstorming;
- proposing architecture;
- giving a recommendation;
- debugging;
- editing code;
- writing tests;
- running browser QA;
- reviewing UI;
- performing git operations for the task.

If a relevant skill meets the relevance threshold defined by [`skills-mcp.md`](http://skills-mcp.md), invoke it through the native skill mechanism before proceeding.

Do not skip a skill because:

- the task looks small;
- the answer seems obvious;
- "I only need context first";
- invoking it adds work;
- the model already knows the framework;
- a direct implementation feels faster.

If a required skill/MCP is unavailable:

- state that fact;
- use only an allowed verified fallback;
- never pretend the tool was invoked.

---

## 4. Full Rule Ingestion Is a Hard Gate

All mandatory rule files must be read from first line through actual EOF.

### Forbidden substitutes

Do not treat any of these as a full read:

- preview;
- summary;
- grep result;
- semantic search result;
- first N lines;
- headings only;
- "relevant sections";
- cached memory from an earlier session;
- prior conversation summaries;
- assuming the remainder from the filename;
- assuming a successful file-read call returned the complete file.

### Truncation protection

For every mandatory rule file:

1. Determine the actual line count.
2. Read from line 1 forward.
3. If one response may truncate, read sequential contiguous chunks.
4. Track exact covered ranges.
5. Continue until the last line / EOF.
6. Verify coverage is continuous from `1 -> final line`.
7. If output truncates, resume from the first unread line.

Example of valid coverage:

```
1-150
151-300
301-417
```

Invalid:

```
1-150
201-300
301-417
```

Invalid:

```
1-200
output truncated
"looks complete"
```

Do not claim successful ingestion unless continuous coverage and EOF were actually verified.

---

## 5. Reading Is Not Compliance

Reading the rules does not satisfy the rules.

The rules are **runtime execution constraints**.

They must actively affect:

- task classification;
- skill selection;
- repository investigation;
- factual claims;
- brainstorming;
- recommendations;
- scope decisions;
- architecture;
- implementation;
- UI decisions;
- copywriting;
- type modeling;
- configuration;
- error handling;
- testing;
- browser QA;
- git workflow;
- verification;
- handoff;
- completion language.

If an applicable rule produces no observable constraint on the work, re-check whether it was actually applied.

---

## 6. Mandatory Rule Operationalization Gate

Reading or acknowledging a rule is not sufficient.

Before starting implementation, convert every applicable rule into an explicit execution obligation in the task plan / todo list.

For every applicable rule, record:

- the rule source;
- the concrete action required during this task;
- when that action must occur;
- the evidence required to prove compliance.

Example:


| Rule                                            | Applicable obligation                                   | Execution point              | Required evidence                  |
| ----------------------------------------------- | ------------------------------------------------------- | ---------------------------- | ---------------------------------- |
| [`atomic-commit.md`](http://atomic-commit.md)   | commit each completed logical concern                   | after each logical milestone | commit hash                        |
| [`atomic-commit.md`](http://atomic-commit.md)   | push all task commits                                   | before handoff               | successful push                    |
| [`atomic-commit.md`](http://atomic-commit.md)   | verify remote synchronization                           | before `Complete`            | clean status + no outgoing commits |
| [`no-type-bypass.md`](http://no-type-bypass.md) | scan changed app code for forbidden bypasses            | verification                 | scan output                        |
| [`no-assumptions.md`](http://no-assumptions.md) | verify bug root cause from actual code/runtime evidence | before fix                   | traced evidence                    |
| `verification-before-completion`                | run required verification                               | before completion            | actual command results             |


### Hard rule

If an applicable obligation is absent from the execution plan / todo list, the plan is incomplete.

**DO NOT START IMPLEMENTATION** until the plan contains all applicable:

- investigation obligations;
- implementation obligations;
- verification obligations;
- browser/runtime QA obligations;
- git obligations;
- handoff obligations.

A rule may not remain only as a mental reminder.

"Already read", "remembered", "obvious", or "will do later" are not execution plans.

---

## 7. Task Plan Is an Execution Contract

The task plan / todo list is not optional scratch work.

It is the executable projection of:

```
user requirements
+ applicable repository rules
+ verified current behavior
+ required verification
+ required git/handoff work
```

If a mandatory action is not represented in the plan, assume it is at risk of being skipped.

Therefore:

- every applicable mandatory action must appear explicitly;
- completion-related actions must be planned **before implementation begins**;
- git commit/push must never be introduced only after implementation is over;
- vague aggregate todos may not hide multiple mandatory gates;
- the final todo must not simply be "report results";
- the plan must include the handoff gate.

Before implementation begins, audit the plan against the applicable-rule matrix.

Before completion, audit the executed plan against the same matrix.

### Invalid vague todo

```
- verify everything
```

This does **not** substitute for independently required actions such as:

- run relevant tests;
- run typecheck;
- run lint/check;
- run build when required;
- run type-bypass scan;
- perform browser QA when required;
- inspect git diff/status;
- create atomic commit(s);
- push commits;
- verify remote synchronization.

---

## 8. Mandatory Runtime Pipeline for Every Task

Never jump directly from a user request to an implementation idea.

Use this execution sequence:

```
Request
→ classify task
→ fully ingest mandatory rules
→ build applicable-rule obligation matrix
→ build task plan / todos containing ALL applicable obligations
→ invoke required skills/MCP
→ gather evidence
→ inspect actual code/data flow
→ determine complete scope
→ identify relevant states and consumers
→ search existing solutions
→ compare meaningful alternatives where a real trade-off exists
→ reject non-compliant options
→ select the most correct option
→ pre-implementation compliance gate
→ implement ONE logical milestone
→ verify that logical milestone
→ atomic commit that milestone
→ repeat implement → verify → commit for remaining logical milestones
→ run final repository verification
→ browser/runtime QA where required
→ final rule audit
→ push all task commits
→ verify remote synchronization and clean working tree
→ completion gate
→ handoff / final response
```

Skipping, reordering, or deferring a required gate is non-compliance unless the governing rule explicitly allows it.

---

## 9. Atomic Milestone Barrier

Atomic commits are execution checkpoints, not post-hoc repository cleanup.

When a logical concern reaches a coherent verified state:

1. STOP implementation of the next logical concern.
2. Run the verification required for that milestone.
3. Inspect `git diff` and `git status`.
4. Stage only files belonging to that concern.
5. Create the atomic commit.
6. Record the resulting commit hash.
7. Only then proceed to the next logical concern.

It is forbidden to intentionally defer all commits until implementation is finished and then reconstruct atomic commits afterward.

A task involving multiple logical concerns therefore contains multiple:

```
implementation
→ verification
→ commit
```

barriers.

### Examples of separate logical concerns

Depending on the task, these may require separate commits:

- schema / migration;
- backend / server behavior;
- shared contracts / types;
- tests;
- frontend state behavior;
- UI presentation;
- documentation / configuration.

Do not split commits mechanically by file type when multiple files form one indivisible logical concern.

The unit is a **coherent reversible concern**, not "one file = one commit".

---

## 10. Non-Retroactive Compliance

Process compliance cannot be retroactively manufactured.

Examples:

- Splitting finished work into atomic commits after all concerns were already implemented does not mean the original execution followed the atomic milestone rule.
- Running a skipped verification after claiming completion does not make the earlier completion claim compliant.
- Pushing after handoff does not make the earlier handoff compliant.
- Reading a skipped rule after implementation does not authorize decisions already made without that rule.

When a process violation is discovered:

1. STOP.
2. State the exact violated rule.
3. Repair the repository/output state where possible.
4. Re-run every downstream gate whose validity may have been affected.
5. Continue subsequent work using the correct process.
6. Never claim that the earlier execution was compliant.

Repository remediation and process compliance are separate facts.

A violation may be remediated, but the historical violation must not be rewritten as if it never happened.

---

## 11. Evidence Gate: No Assumptions

Do not make claims about everythings-vibe from model memory, convention, filenames, screenshots alone, or typical framework behavior.

Before claiming:

- a file does something;
- a function is called somewhere;
- a route behaves a certain way;
- a schema contains a field;
- a type has a shape;
- a feature exists;
- a test exists;
- a dependency is unused;
- something does not exist;
- a bug has a particular cause;

verify it with the actual repository and the tools required by [`no-assumptions.md`](http://no-assumptions.md).

### Absence claims

Negative claims are high risk.

Do not say that something:

- "does not exist";
- "is not implemented";
- "has no dependency";
- "has no test";
- "has no route";

after one or two searches.

Follow the full absence-search protocol from [`no-assumptions.md`](http://no-assumptions.md).

If evidence is incomplete, state the uncertainty instead of converting it into confidence.

---

## 12. Deep Audit Before Implementation

Before changing code:

- read the actual target implementation;
- read important callers and consumers;
- inspect imports and dependencies;
- trace the flow end-to-end;
- identify the real source of truth;
- inspect related schemas/types/config;
- find existing patterns for similar behavior;
- determine affected files;
- identify regression risk;
- identify relevant tests;
- identify runtime/browser verification needed;
- inspect relevant recent git changes when the task is a regression investigation.

Do not patch only the file the user mentioned if the actual behavior spans more files.

Do not treat the screenshot as the architecture.

---

## 13. Anti-Satisficing Decision Gate

A functional solution is not automatically the correct solution.

Never choose an option because it is:

- fastest;
- shortest;
- easiest to type;
- easiest to test;
- easiest to explain;
- fewer files;
- fewer tokens;
- less investigation;
- less refactoring;
- less unfamiliar code;
- more convenient for the agent.

Implementation effort is a trade-off, not a hidden decision criterion.

### Equal-effort counterfactual — mandatory

Before any recommendation or material implementation decision, ask:

> If every viable option required exactly the same implementation effort, would I still choose this option?

If **no**:

- reject it as convenience-biased.

If **uncertain**:

- gather more evidence.

Do not resolve uncertainty by selecting the easiest path.

---

## 14. No Convenience-Based Scope Reduction

Never shrink the real requirement because the complete solution requires:

- more files;
- another abstraction;
- schema work;
- migration work;
- more states;
- more tests;
- browser QA;
- deeper investigation;
- a skill/MCP;
- unfamiliar code;
- more implementation time.

Scope may be reduced only for a concrete requirement-grounded reason, such as:

- explicit user scope;
- approved architecture boundary;
- verified phase boundary;
- compatibility constraint;
- security constraint;
- documented product requirement.

Do not use these phrases as substitute reasoning:

- "keep it simple";
- "simpler";
- "MVP";
- "YAGNI";
- "over-engineering";
- "best practice";
- "good enough";
- "for now".

If scope is reduced, state the exact requirement-grounded reason.

---

## 15. First Idea Is a Candidate, Not a Conclusion

When a real trade-off exists:

1. identify meaningful alternatives;
2. inspect evidence for each;
3. compare product, UX, architecture, security, maintainability, and verification consequences;
4. reject options that violate rules;
5. choose only after comparison.

Do not invent fake alternatives just to tick a box.

Do not select an option because it preserves the most existing code or requires the fewest changes unless that is independently the correct product/technical choice.

---

## 16. Requirement-to-Decision Traceability

Every material implementation decision must be traceable through:

```
User requirement
→ verified current behavior
→ applicable rule(s)
→ implementation decision
→ verification evidence
```

A decision must be justified by at least one of:

- explicit user requirement;
- verified repository behavior;
- approved project specification;
- an applicable project rule;
- verified current external documentation when required.

If a decision cannot be traced, treat it as an assumption and investigate it first.

Do not invent requirements to justify a preferred implementation.

---

## 17. Reuse Before Reinventing

Before creating a new:

- component;
- hook;
- utility;
- helper;
- service;
- adapter;
- state abstraction;
- query;
- error model;
- design primitive;
- schema;
- UI pattern;

search the repository and required component registries first.

Read actual existing implementations and their consumers.

Decide whether to:

- reuse directly;
- compose;
- extend;
- or create something genuinely new.

Creating from scratch because understanding existing code takes longer is not acceptable.

For UI work, follow the discovery order and component evaluation rules in [`skills-mcp.md`](http://skills-mcp.md).

---

## 18. Root Cause Over Surface Patch

For bugs, regressions, inconsistent behavior, or broken UX:

- establish the root cause;
- trace the state/data flow;
- reproduce with evidence where possible;
- inspect recent changes when relevant;
- fix the mechanism, not merely the visible symptom;
- add regression protection where appropriate.

Do not:

- special-case one screenshot;
- special-case literal user text;
- hardcode a symptom;
- swallow an error;
- add an arbitrary retry;
- disable validation;
- bypass types;
- weaken tests;
- turn failure into fake success;
- patch UI while the underlying state model remains incorrect.

If root cause is not established, the issue is unresolved.

---

## 19. Complete Behavior Matrix

The happy path is only one row.

For every task, determine which states actually apply, including when relevant:

- initial;
- loading;
- pending;
- disabled;
- empty;
- valid;
- invalid;
- success;
- error;
- retry;
- unauthorized;
- forbidden;
- stale;
- conflict;
- duplicate;
- canceled;
- aborted;
- partial;
- terminal.

Not every task needs every state.

But applicable states must be deliberately determined, not silently omitted.

---

## 20. UI Must Pass the everythings-vibe Visual Standard

When a task touches UI, "functional" is not the finish line.

Apply:

```
.opencode/rules/anti-ai-slop.md
```

materially.

Evaluate:

- composition;
- hierarchy;
- density;
- readability;
- alignment;
- spacing;
- typography;
- responsive behavior;
- accessibility;
- interaction clarity;
- state design;
- component geometry;
- visual consistency;
- actual product context.

Reject both:

- cheap AI slop;
- scared empty wireframe minimalism.

Do not use a generic default layout merely because it is quick.

Do not introduce visual decoration without product purpose.

---

## 21. Copy Must Match Real Behavior

User-facing copy must:

- follow the project language rules;
- preserve technical terminology where appropriate;
- describe actual behavior;
- reflect actual project state;
- avoid generic filler;
- avoid vague corporate language;
- avoid decorative AI phrasing;
- avoid misleading CTAs.

Never let a label imply an action that will not happen.

Copy quality is part of implementation quality, not an afterthought.

---

## 22. No Hardcoding

Apply:

```
.opencode/rules/no-hardcode.md
```

before introducing values.

Do not hardcode values that belong to:

- environment;
- provider config;
- URLs;
- credentials;
- IDs;
- limits;
- thresholds;
- timeouts;
- retry rules;
- model IDs;
- business rules;
- feature flags;
- persisted project state;
- data-derived options.

Use the existing source of truth when one exists.

Do not duplicate constants merely because it is faster than finding the existing one.

---

## 23. No Fake Behavior

Never fabricate:

- generation progress;
- reasoning progress;
- processing stages;
- status sequences;
- Kanban state;
- completion percentages;
- provider activity;
- streaming deltas;
- fake loading narration.

Indicators must use real system signals.

If no real signal exists, show one honest neutral state instead of an invented sequence.

---

## 24. Type Safety Is a Hard Gate

Apply:

```
.opencode/rules/no-type-bypass.md
```

Do not make TypeScript pass by suppressing the real mismatch.

Forbidden except the explicit narrow exceptions defined in that rule file:

```
as never
as any
: any
as unknown as X
@ts-ignore
@ts-expect-error
broad fake Record casts
unrelated assertions hiding structural mismatch
```

Use:

- Drizzle inference;
- Zod/runtime validation;
- narrowing;
- typed DTOs;
- project-owned errors;
- typed provider adapters;
- accurate domain types.

A green typecheck achieved by silencing the compiler is a failed gate.

---

## 25. Security, Ownership, and Real Data Boundaries

Never weaken existing:

- authentication;
- authorization;
- tenant ownership checks;
- `WHERE user_id = ?` boundaries;
- atomic credit behavior;
- idempotency;
- webhook verification;
- validation;
- server/client secret boundaries.

Do not move server secrets or provider credentials into browser code.

Do not use fake data where the task requires real persisted behavior.

---

## 26. Tests Must Remain Honest

Never make a failing valid test easier merely to obtain green output.

Do not:

- weaken assertions;
- delete valid boundary tests;
- skip tests;
- comment them out;
- replace deterministic assertions with vague existence checks;
- add shallow tests that merely mirror implementation;
- test stochastic AI prose or styling details where the project explicitly forbids it.

Fix production behavior when a valid deterministic test catches a defect.

---

## 27. No Post-Hoc Rationalization

The correct reasoning order is:

```
evidence
→ constraints
→ alternatives
→ evaluation
→ decision
```

Never:

```
preferred/easiest implementation
→ search for justification
```

Do not choose first and write a rationale afterward.

If evidence is insufficient, gather more.

If the decision truly requires product input, ask the user.

---

## 28. Stop-on-Violation Rule

If at any point you discover that:

- the current plan violates a rule;
- a prior decision used an assumption;
- a shortcut was selected for convenience;
- a required skill/MCP was skipped;
- code was written against an unverified contract;
- verification contradicts the implementation;
- the scope is incomplete;
- an atomic milestone was crossed without the required commit;
- a required git/handoff obligation was omitted from the plan;

stop advancing that approach.

Do not preserve a wrong approach because work has already been invested.

**Sunk implementation effort is never a reason to keep a non-compliant solution.**

Correct the approach before continuing.

If a process violation already occurred, apply **Non-Retroactive Compliance**.

---

## 29. Pre-Recommendation Gate

Before recommending anything material, verify:

- Relevant skills/MCPs were invoked.
- Evidence was gathered.
- The recommendation is grounded in actual everythings-vibe context.
- Meaningful alternatives were considered when a real trade-off exists.
- The option is not selected because it is easier for the agent.
- It passes the equal-effort counterfactual.
- Consequences and trade-offs are stated accurately.
- No product quality is silently sacrificed.
- Applicable project rules are satisfied.

If any applicable item fails, do not present the recommendation yet.

---

## 30. Pre-Implementation Gate

Immediately before modifying implementation code, verify:

- Full mandatory rules were ingested.
- Required process/domain skills were invoked.
- Relevant implementation files were inspected.
- Important callers/consumers were inspected.
- Current behavior is evidence-backed.
- Complete scope is understood.
- Relevant states are identified.
- Existing reusable solutions were searched.
- Meaningful alternatives were evaluated where needed.
- The chosen approach passes the equal-effort test.
- No scope was reduced for agent convenience.
- No hardcoded shortcut is being introduced.
- No type bypass is planned.
- Required verification is known in advance.
- The implementation is traceable to requirement/evidence/rules.

### 30.1 Task-plan gate

Before implementation, also verify:

- The execution todo/task plan exists.
- Every applicable rule has at least one concrete todo or gate.
- Verification obligations are explicit.
- Browser/runtime obligations are explicit when required.
- Git obligations are explicit.
- Handoff/completion obligations are explicit.

### 30.2 Mandatory git todos

Every implementation task MUST include explicit planned items for:

- atomic commit after each logical milestone;
- final push;
- clean working tree verification;
- outgoing commit verification;
- upstream synchronization verification.

These items may not be omitted because the task prompt did not mention git.

If any applicable item fails:

**DO NOT START IMPLEMENTATION.**

Resolve the failed gate first.

---

## 31. Runtime Re-Check Gate

Do not treat compliance as a one-time bootstrap.

Re-check the relevant original rule text before:

- a material recommendation;
- an architecture decision;
- reducing scope;
- creating a new abstraction;
- accepting a workaround;
- changing a state model;
- changing a provider/API boundary;
- changing DB/schema behavior;
- a major UI decision;
- deciding verification is sufficient;
- creating an atomic commit;
- deciding the task is ready for handoff;
- declaring completion.

"Already read earlier" is not enough.

---

## 32. Subagent Enforcement

Subagents do not get weaker rules.

When delegating:

- require them to load the relevant original rule files;
- give verified task context;
- preserve the same anti-satisficing constraints;
- preserve no-assumption requirements;
- preserve type/hardcode/security constraints;
- preserve verification obligations;
- preserve atomic-commit obligations if they modify code.

Do not delegate with vague text like:

- "follow best practices";
- "keep project rules in mind";
- "make it production-ready".

The parent agent must audit subagent output against the original rules before accepting it.

Subagent output is evidence/input, not automatic truth.

The parent agent remains responsible for:

- integration;
- verification;
- git boundaries;
- final push;
- completion claim.

---

## 33. Verification Gate

The Verification Gate proves that implementation behavior is correct.

Passing it does **not** prove that the task is ready for handoff.

Use the actual repository verification commands and runtime/browser flows required by the project.

Depending on the task, verification may include:

- relevant unit tests;
- integration tests;
- TypeScript typecheck;
- Biome lint/check/format validation;
- bypass scan required by [`no-type-bypass.md`](http://no-type-bypass.md);
- build;
- security/ownership verification;
- API boundary verification;
- browser QA;
- E2E flow;
- responsive/accessibility checks;
- provider sandbox verification.

Do not skip verification because:

- the change appears obvious;
- source code looks correct;
- one test passed;
- the command is slow;
- running the browser is inconvenient;
- "it should work".

For browser behavior, do not claim success from source inspection alone when browser verification is required.

If required verification cannot run:

- report the exact blocker;
- do not replace it with a weaker success claim.

---

## 34. Handoff Gate

The Handoff Gate proves that verified work is safely persisted, transferable, and synchronized with the remote repository.

Passing the Verification Gate does **not** imply passing the Handoff Gate.

Before handoff, ALL applicable items must pass:

- all logical concerns have appropriate atomic commits;
- no intended task change remains unstaged or uncommitted;
- no unrelated/generated/secret artifact was committed;
- all task commits were pushed;
- working tree is clean;
- there are no outgoing commits;
- branch is up to date with its upstream.

Required evidence includes actual command results, not memory.

### 34.1 Minimum git checks

Use the current branch rather than assuming `main`.

Typical checks:

```
git status
git status --short
git log origin/<branch>..<branch> --oneline
git push origin <branch>
git status
```

The exact upstream may differ. Resolve it from git rather than hardcoding when necessary.

### 34.2 Handoff failure

If implementation is verified but the Handoff Gate is not complete:

- status may be **Verified**;
- status may **not** be **Complete**.

---

## 35. Pre-Completion Audit

Before claiming completion, re-audit the actual result against the original rule files.

Check:

- requirement coverage;
- behavior/state coverage;
- assumptions;
- convenience-biased shortcuts;
- root cause;
- reuse;
- hardcoding;
- fake behavior;
- type bypasses;
- UI quality;
- copy quality;
- responsive behavior;
- accessibility;
- ownership/security boundaries;
- tests;
- runtime/browser evidence;
- TODOs/placeholders;
- completion honesty.

### 35.1 Git completion evidence

Before claiming `Complete`, ALL must be true:

- Every logical concern has its own appropriate atomic commit.
- No intended implementation change remains unstaged or uncommitted.
- No unrelated/generated/secret artifact was committed.
- `git status --short` is clean.
- `git log origin/<branch>..<branch> --oneline` returns no outgoing task commits.
- `git status` reports the branch is up to date with its upstream.
- Required commits were successfully pushed.
- Commit hashes for this task are known and may be reported.

If any applicable rule is violated:

- fix it before claiming completion.

If it cannot be fixed:

- report `Partial` or `Blocked`.

If implementation is verified but git handoff is incomplete:

- report `Verified`, not `Complete`.

---

## 36. Completion Language Must Match Evidence

Use status precisely:

- **Implemented** — code was written; full verification is not yet established.
- **Verified** — relevant verification actually ran and results were checked; handoff may still be incomplete.
- **Complete** — full requirement, applicable state matrix, rule compliance, Verification Gate, and Handoff Gate are all finished.
- **Partial** — part of the required scope remains; state the gap.
- **Blocked** — environment, credential, dependency, permission, unresolved conflict, or unresolved decision prevents completion.

Do not use:

- "done";
- "finished";
- "all good";
- "safe";
- "production-ready";

unless the evidence truly supports the equivalent claim.

### 36.1 Status matrix


| Status      | Code written       | Verification Gate     | Handoff Gate                   |
| ----------- | ------------------ | --------------------- | ------------------------------ |
| Implemented | yes                | not fully established | not required yet               |
| Verified    | yes                | PASS                  | incomplete/not yet established |
| Complete    | yes                | PASS                  | PASS                           |
| Partial     | partial/incomplete | state explicitly      | state explicitly               |
| Blocked     | maybe              | blocked/not reached   | blocked/not reached            |


`Verified` must never be automatically upgraded to `Complete`.

A task with green tests but uncommitted or unpushed work is **Verified**, not **Complete**.

---

## 37. Completion Evidence Contract

A `Complete` handoff must contain evidence for:

1. implementation scope;
2. verification;
3. atomic commits;
4. remote push state.

Minimum git evidence:

- branch;
- task commit hashes;
- push result;
- working-tree state;
- outgoing-commit state;
- upstream synchronization state.

Do not say merely:

- "committed";
- "pushed";
- "all checks passed";
- "branch clean";

without having actually executed the commands that establish those facts.

Example structure:

```
Status: Complete

Implementation:
- <what changed>

Verification:
- <command>: PASS
- <command>: PASS
- browser/runtime QA: PASS (when required)

Git:
- branch: <branch>
- commits:
  - <hash> <message>
  - <hash> <message>
- push: PASS
- outgoing commits: 0
- working tree: clean
- upstream: up to date
```

Do not fabricate command output.

---

## 38. Git Discipline

Apply:

```
.opencode/rules/atomic-commit.md
```

### Mandatory principles

- one coherent logical concern = one atomic commit;
- verify before each commit;
- stage only relevant files;
- use meaningful Conventional Commits;
- never blindly `git add .` or `git add -A`;
- never commit secrets, temp output, build artifacts, or unrelated files;
- push before handoff;
- verify remote synchronization after push.

### Git is part of the task

Git is not post-task ceremony.

Commit/push obligations are part of the implementation lifecycle.

The absence of git instructions in the user's prompt is not a waiver.

---

## 39. Machine-Enforced Verification Preference

Where a repository requirement can be verified mechanically, prefer a machine-enforced check in addition to prose rules.

Examples:

- forbidden type-bypass scan;
- lint/check;
- typecheck;
- tests;
- build;
- dirty working tree detection;
- outgoing commit detection;
- upstream synchronization check.

Do not replace repository rules with scripts.

Use scripts as enforcement for rules that are machine-verifiable.

If the repository provides a canonical handoff command such as:

```
pnpm agent:handoff
```

that command becomes part of the Handoff Gate.

A successful command does not waive non-machine-verifiable requirements such as:

- root-cause correctness;
- UX quality;
- scope completeness;
- factual grounding.

---

## 40. Context Loss / Compaction Recovery

If context is compacted, reset, handed off, or there is any reasonable possibility that detailed constraints were lost:

1. stop;
2. re-read this [`AGENTS.md`](http://AGENTS.md);
3. re-read the mandatory rule files relevant to the task;
4. reconstruct the applicable-rule obligation matrix;
5. reconstruct the task plan / todo obligations;
6. determine which milestones were already verified and committed from git evidence;
7. re-establish runtime gates;
8. only then continue.

Do not rely on compressed memory of the rules.

Do not assume prior milestones were compliant without evidence.

---

## 41. Absolute Enforcement Clause

Compliance takes precedence over implementation momentum.

Never trade rule compliance for:

- speed;
- convenience;
- lower effort;
- shorter output;
- fewer tool calls;
- fewer changed files;
- lower implementation complexity;
- preservation of already-written work;
- getting to the final report faster.

A more demanding rule-compliant solution is preferable to an easier non-compliant solution.

When uncertain whether an action violates a rule:

> **Treat the action as NOT YET AUTHORIZED until the relevant rule and evidence are checked.**

Never assume that because a solution is technically valid, common, simple, clean, maintainable, or functional, it is automatically compliant.

Compliance must be established independently.

---

# Product and Repository Context

## 42. What makes everythings-vibe special

everythings-vibe is an AI-powered product development and planning ecosystem that connects product ideation, existing-codebase context, structured planning artifacts, design workflows, and coding-agent execution.

Core non-negotiables include:

1. **Real generation and workflow state**
   - question flow, Feature Tree, PRD, AC, Task, Kanban, sync, and analysis states must come from real system signals and persisted state;
   - never fake progress, provider activity, status sequences, or completion.
2. **Safe, atomic data and credit flow**
   - credit behavior must remain atomic;
   - tenant ownership must remain enforced;
   - idempotency and validation boundaries must not be weakened.
3. **100% type-safe and robust**
   - zero type-safety bypasses except narrow documented boundaries;
   - strict Drizzle types, typed server routes, and Zod validation protect trust boundaries.
4. **Developer-grade product quality**
   - interfaces must remain high-utility, purposeful, accessible, responsive, and free of cheap AI slop.
5. **Existing Codebase is context-grounded**
   - local codebase sync, snapshot persistence, AI analysis, planning artifacts, and coding-agent handoff must remain tied to real persisted repository context.

---

## 43. Rules — God Tier

### 43.1 Never lower the test standard

When a valid deterministic test fails:

- fix production code;
- elevate the logic;
- do not soften the assertion to get green output.

Never:

- replace specific equality with vague `.toBeDefined()` merely to pass;
- delete valid boundary tests;
- comment out tests;
- write shallow pass-through tests;
- skip a failing valid test because the implementation "looks right".

### 43.2 Never test stochastic AI prose or visual implementation details in unit tests

Unit/TDD tests must not assert:

- generated AI prose;
- exact prompt wording;
- exact markdown wording;
- stochastic model output;
- exact className strings;
- Tailwind utility lists;
- fonts;
- exact visual layout structure;
- decorative palette values;
- generated raw media/source snapshots unless contractually deterministic.

Prefer deterministic invariants:

1. JSON/Zod contracts;
2. state-machine conformance;
3. data types and required keys;
4. ownership/auth boundaries;
5. error classification;
6. step progression;
7. credit deduction;
8. route topology where deterministic;
9. state transitions;
10. idempotency;
11. persistence and recovery behavior.

Rendered aesthetic quality belongs to human/browser review.

### 43.3 Domain before generic catch-all directories

Organize by feature/domain first.

Do not create new generic catch-all directories such as:

```
misc/
helpers/
utils/
common/
shared-stuff/
```

without a documented boundary and verified need.

### 43.4 Self-explanatory code over comments

Prefer clear names and modular structure.

Do not add:

- essay comments;
- generic AI explanations;
- banner-divider comment blocks;
- comments that narrate obvious syntax.

Keep only necessary invariant/boundary explanations.

### 43.5 Solid as hell

Nothing becomes `Complete` without:

- required lint/check;
- required format verification;
- typecheck;
- affected tests;
- required build;
- required runtime/browser QA;
- required git handoff checks.

### 43.6 Small and surgical means scope-correct, not shortcut-small

One concern per change.

A focused fix is preferable to an unrelated refactor.

But do not use "small and surgical" to justify leaving the real contract incomplete.

### 43.7 Fail loud and never hide state

Validate untrusted input at boundaries and fail closed on:

- auth;
- ownership;
- credit deduction;
- rate limiting;
- provider output;
- state transitions;
- sync/session integrity;
- webhook verification.

### 43.8 Native tool calling only

When executing actions or tools, use the native tool calling mechanism provided by the harness.

Do not simulate tool calls through prose, fake XML, markdown pseudo-invocations, or invented output.

---

## 44. Repository Map

Treat this as target/context guidance, not permission to assume a path exists.

Map the actual repository before modifying it.

Typical locations include:

```
src/routes/
src/components/
src/components/prd/
src/components/ac/
src/components/task/
src/components/kanban/
src/components/chat/
src/components/ask/
src/components/codebase/
src/components/design/
src/components/settings/
src/components/auth/
src/components/layout/
src/components/ui/
src/components/admin/
src/db/
src/lib/
src/lib/services/
src/store/
src/types/
src/hooks/
packages/cli/
e2e/
docs/
.opencode/rules/
```

### Important

Do not claim any path exists merely because it is listed here.

Verify repository structure first.

---

## 45. Repository Commands

Read the actual `package.json`, workspace configuration, and current documentation before running commands.

Typical commands may include:

```
pnpm install --frozen-lockfile
pnpm dev
pnpm lint
pnpm format
pnpm check
pnpm exec tsc --noEmit
pnpm test
pnpm build
```

Do not invent scripts.

Use exact scripts from the current repository.

Long-lived commands such as dev servers must use an appropriate managed/background workflow, readiness check, and cleanup.

---

# Mandatory Operational Templates

## 46. Required Pre-Implementation Rule Matrix

Before implementation, create an internal/task-visible matrix equivalent to:

```
RULE MATRIX

Task:
<task>

Applicable:
- systematic-debugging
  obligation: establish root cause before patch
  evidence: traced source/runtime flow

- no-assumptions
  obligation: verify relevant contracts and callers
  evidence: file/search/runtime inspection

- no-type-bypass
  obligation: no forbidden casts/suppressions
  evidence: typecheck + bypass scan

- atomic-commit
  obligation:
    1. verify + commit milestone A
    2. verify + commit milestone B
    3. push before handoff
    4. verify clean/up-to-date
  evidence:
    commit hashes + git output

Not applicable:
- anti-ai-slop
  reason: no user-facing UI changes
```

Do not mark a rule "not applicable" merely because it would add work.

The reason must be grounded in task scope.

---

## 47. Required Task Plan Shape

A compliant implementation task plan should resemble:

```
1. Load and operationalize applicable rules.
2. Invoke required skills/MCPs.
3. Reproduce/trace current behavior.
4. Confirm root cause and impacted consumers.
5. Identify behavior matrix and regression tests.
6. Implement logical milestone A.
7. Verify milestone A.
8. Commit milestone A.
9. Implement logical milestone B.
10. Verify milestone B.
11. Commit milestone B.
12. Run final verification suite.
13. Run browser/runtime QA if required.
14. Run final rule audit.
15. Push all commits.
16. Verify clean tree, zero outgoing commits, and upstream synchronization.
17. Produce evidence-based handoff.
```

Adjust the number of milestones to the actual task.

Do not create fake milestones merely to create more commits.

---

## 48. Required Milestone Checkpoint

Before moving from one logical concern to the next, verify:

```
MILESTONE CHECK

[ ] concern is coherent
[ ] relevant tests/checks pass
[ ] changed files reviewed
[ ] no unrelated changes staged
[ ] no forbidden artifacts/secrets staged
[ ] atomic commit created
[ ] commit hash recorded
```

If a checkbox fails, the next concern is not authorized yet.

---

## 49. Required Final Completion Check

Before `Complete`:

```
FINAL COMPLETION CHECK

Requirements
[ ] requested scope covered
[ ] no hidden remaining scope
[ ] behavior matrix handled
[ ] root cause established for bug tasks

Rules
[ ] applicable rule matrix re-audited
[ ] no convenience shortcut
[ ] no hardcoded workaround
[ ] no fake behavior
[ ] no type bypass
[ ] security/ownership preserved

Verification
[ ] relevant tests pass
[ ] typecheck passes
[ ] lint/check passes
[ ] build passes when required
[ ] bypass scan passes
[ ] runtime/browser QA passes when required

Git / Handoff
[ ] logical concerns committed atomically
[ ] working tree clean
[ ] no outgoing commits
[ ] push succeeded
[ ] upstream up to date

Evidence
[ ] command results checked
[ ] commit hashes known
[ ] final status matches evidence
```

If any required checkbox fails, `Complete` is forbidden.

---

## 50. Final Directive

The standard is:

```
read the rules fully
+ operationalize them into explicit obligations
+ put those obligations into the task plan
+ gather evidence instead of guessing
+ choose the most correct option, not the easiest
+ implement one logical milestone at a time
+ verify each milestone
+ commit each milestone before moving on
+ verify the full task
+ push before handoff
+ prove remote synchronization
+ claim only the status supported by evidence
= acceptable execution
```

The most important invariant:

> **Rules that exist only in memory will be forgotten. Applicable rules must become concrete todo items, runtime gates, required evidence, and—where possible—machine-enforced checks.**