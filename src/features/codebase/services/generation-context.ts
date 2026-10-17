// Compatibility facade for the codebase generation-context domain.
//
// Canonical implementations live in sibling modules:
// - `generation-context-build.ts` — context construction, repository
//   capability facts, bounded formatting.
// - `generation-context-selection.ts` — ready-analysis selection (pure).
// - `generation-context-handoff.ts` — Ask handoff schemas and sanitizers.
// - `generation-context-requirement.ts` — fail-closed context requirement and
//   the codebase prompt block.
// - `generation-context-store.server.ts` — DB-backed loaders and writers.
//
// This module re-exports the canonical implementations so every existing
// `@/features/codebase/services/generation-context` import keeps working
// without behavioral change.

export * from "./generation-context-build";
export * from "./generation-context-handoff";
export * from "./generation-context-requirement";
export * from "./generation-context-selection";
export * from "./generation-context-store.server";
