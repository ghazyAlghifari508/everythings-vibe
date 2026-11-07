# atomic-commit.md (Consolidated)

> **Status:** Consolidated into **`AGENTS.md`** Core Invariant #5 and **`skill://vibe-deep-engineering`**.
>
> All Git discipline and atomic commit workflows are defined in root `AGENTS.md`.

Refer to `AGENTS.md` Core Invariant #5:
- **One Logical Concern = One Atomic Commit:** Split commits per layer (Schema $\rightarrow$ Logic $\rightarrow$ Tests $\rightarrow$ UI). Never hoard code into lazy megacommits.
- **Conventional Commits:** `feat(scope):`, `fix(scope):`, `refactor(scope):`, `test(scope):`, `chore(scope):`.
- **Pre-Commit Verification:** Run `pnpm biome check <files>`, `pnpm exec tsc --noEmit`, and relevant tests before committing.
- **Mandatory Remote Push:** All sessions must conclude with `git push origin <branch>` and a clean working tree.
