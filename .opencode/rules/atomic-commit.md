# PRDFY - Atomic Commit & Git Discipline Rules (MANDATORY)

> **Source of truth:** `AGENTS.md` + `.opencode/rules/basic-rules.md`.
> This rule defines how AI agents, subagents, and human developers must manage
> git commits and pushes in PRDFY. Never hoard code changes into lazy megacommits;
> commit incrementally per logical concern, and always push before handoff.

---

## Core Principle

**Commit early, commit often, and commit atomically.**

Every coherent unit of work must be captured in its own atomic commit. A task with multiple code modifications must produce multiple focused commits — never a single giant "catch-all" dump at the end.

**NEVER be lazy with git commits.** If you touched 3 different concerns (e.g. database schema, service logic, and UI component), make 3 separate atomic commits.

**Push is MANDATORY.** Before claiming completion or finishing a session, ALL local commits must be pushed to the remote repository. Leaving unpushed commits is considered an incomplete and non-compliant task.

---

## Rule 1: One Logical Concern = One Atomic Commit

When implementing tasks or fixing issues, do NOT wait until everything is finished to run `git add .` and `git commit`.

Commit immediately as each logical milestone or layer is reached:

1. **Schema & Migration:** Commit DB schema changes, types, and migrations first.
2. **Backend & Business Logic:** Commit service functions, route handlers, and API endpoints.
3. **Tests & Contracts:** Commit unit tests, integration tests, or TDD cycles.
4. **UI & Components:** Commit presentation components, layout adjustments, and design system updates.
5. **Styles & Tokens:** Commit Tailwind CSS token adjustments, animations, and visual polish.
6. **Documentation & Config:** Commit documentation, environment templates, or configuration changes.

### Bad vs Good Workflow

| Anti-Pattern (Lazy Megacommit) | Compliant (Atomic Commits) |
|---|---|
| Modifies 8 files across backend, frontend, and tests, then commits once: `git commit -m "fix kanban and task diagram and tests"` | 1. `git commit -m "fix(service): synchronize kanban tasks with featureTree SSOT"`<br>2. `git commit -m "feat(ui): add checklist checkboxes to task diagram"`<br>3. `git commit -m "test(kanban): add tests for phase extraction and SSOT resolution"` |
| Piles up 15 changes across 2 hours, then creates 1 commit with 800 insertions and 400 deletions | Commits incrementally every 1-2 files changed after verifying the sub-feature passes local checks |
| Forgets to commit until the user asks "sudah commit belum?" | Commits continuously as progress unfolds |

---

## Rule 2: Conventional Commits with Meaningful Scope

Every commit message must follow the Conventional Commits specification with a clear scope and imperative mood:

```
<type>(<scope>): <short imperative description>
```

### Allowed Types:

- `feat`: New feature or user-facing capability (e.g. `feat(ui): add checklist checkboxes to task diagram`)
- `fix`: Bug fix, error resolution, or regression patch (e.g. `fix(kanban): drop phase-0 infrastructure cards from board`)
- `refactor`: Code restructuring without changing external behavior (e.g. `refactor(task): extract kanban name resolution to helper`)
- `test`: Adding or updating test suites (e.g. `test(service): add unit tests for resolveKanbanFeatureName`)
- `style`: Visual styling, token alignment, or whitespace fixes (e.g. `style(kanban): align phase filter dropdown icons`)
- `chore`: Tooling, dependencies, or maintenance (e.g. `chore: update rule contracts in AGENTS.md`)
- `docs`: Documentation or specification updates (e.g. `docs: document atomic commit discipline`)

### Forbidden Messages:

- `update` / `updates`
- `fix bug` / `fix issue`
- `wip` / `work in progress`
- `changes` / `refactor code`
- `final fix` / `done`

---

## Rule 3: Verification Before Every Commit

An atomic commit must represent a working, coherent state. Never commit broken code that fails the build:

1. Run `npx @biomejs/biome check` (or auto-format via `--write`) on the files being committed.
2. Run `npx tsc --noEmit` to ensure zero compilation or type errors.
3. Run the relevant Vitest test file to ensure the unit/boundary test passes.
4. Stage ONLY the files relevant to that specific commit:
   ```bash
   git add path/to/specific-file.ts path/to/related-test.ts
   git commit -m "..."
   ```

Do NOT commit broken states to "save progress". If work is partial, finish the atomic unit or test boundary before committing.

---

## Rule 4: Mandatory Remote Push Before Handoff

Every agent workflow MUST finish with `git push`:

1. Check current branch: `git status`
2. Check outgoing commits: `git log origin/<branch>..<branch> --oneline`
3. Push to remote:
   ```bash
   git push origin <branch>
   ```
4. Verify remote is up to date:
   ```bash
   git status
   # Output MUST say: "Your branch is up to date with 'origin/<branch>'."
   ```

### Why Push is Mandatory:
- PRDFY operates with multiple agents, subagents, and human developers.
- Commits left sitting on a local branch are invisible to peer agents, CI pipelines, and the user.
- If context is reset or a different agent takes over, unpushed work risks being lost or overwritten.

---

## Rule 5: Clean Staging Hygiene (No Accidental Dumps)

Before staging files, inspect `git status`. NEVER blindly execute `git add -A` or `git add .` without checking what is untracked or modified.

### Forbidden to Stage:
- Local secrets, `.env`, `.env.local`
- Scratch debug scripts, temporary JSON dumps, or ephemeral logs
- Orphan test outputs or stray media files
- Node modules or build artifacts (`dist/`, `.vite/`, `.output/`)

Use `.gitignore` for permanent artifacts and explicitly name the files when running `git add`.

---

## Rule 6: Reversibility & Git Bisect Friendly

The primary purpose of atomic commits is **reversibility**:
- If an agent introduces a regression, a fine-grained commit allows `git revert <hash>` without undoing unrelated work.
- If a bug is discovered, `git bisect` can pinpoint the exact function or component change that caused the issue.
- A megacommit makes debugging and rollbacks a nightmare because rolling back one fix destroys ten other features.

---

## Anti-Patterns & Violations

| Violation | Severity | Remediation |
|---|---|---|
| Agent completes 4 subtasks across 6 files and creates only 1 commit at the end | HIGH | Stop. Split changes logically and commit step-by-step. |
| Agent claims task is "Complete" but leaves commits unpushed | HIGH | Execute `git push origin <branch>` immediately before responding. |
| Agent commits with message `fix: updates` | MEDIUM | Amend or write descriptive Conventional Commit messages. |
| Agent commits code that fails `tsc --noEmit` | HIGH | Fix the type error before committing; never pollute git history with broken code. |
| Agent stages `.env` or temporary debug scripts | CRITICAL | Unstage immediately (`git reset HEAD <file>`) and clean up. |

---

## Summary Checklist for Every Task

Before saying "Selesai" or claiming completion:
- [ ] Are code changes split into logical, granular atomic commits?
- [ ] Does every commit message follow Conventional Commits (`type(scope): message`)?
- [ ] Did every commit pass lint, typecheck, and unit tests?
- [ ] Were all local commits pushed to remote (`git push origin <branch>`)?
- [ ] Does `git status` show working tree clean and up to date with remote?
