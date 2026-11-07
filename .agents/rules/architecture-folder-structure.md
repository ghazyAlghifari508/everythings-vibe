# architecture-folder-structure.md (Consolidated)

> **Status:** Consolidated into **`AGENTS.md`** Core Invariant #3 and **`skill://vibe-deep-engineering`**.
>
> All feature-driven colocation, anti-monster file limits, thin route layers, and zero dead code rules are defined in root `AGENTS.md`.

Refer to `AGENTS.md` Core Invariant #3:
- **Feature Colocation:** Organize domain logic under `src/features/<domain>/` (`components/`, `hooks/`, `services/`, `types/`, `tests/`).
- **Anti-Monster File Ceiling:** Ideal $\le$ 200–300 lines. Hard ceiling of $\le$ 400 lines per file. Files approaching 350 lines must decompose.
- **Thin Routes:** `src/routes/` max 100–150 lines. No `-*.test.tsx` files inside `src/routes/` (colocate in feature `tests/`).
- **Zero Dead Code:** Remove unused exports, orphan files, and obsolete packages (`pnpm remove`).
