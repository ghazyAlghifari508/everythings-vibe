// Facade for the codebase analysis domain.
//
// Canonical implementations live in sibling modules:
// - `services/analysis-schema.ts` — Zod schemas, inferred types, validation
//   reason and failure vocabulary, trigger/read DTOs.
// - `services/analysis-prompt.ts` — system prompt, user prompt assembly,
//   excerpt selection, starter copy guard, repair prompt.
// - `services/analysis-validation.ts` — strict model output parsing and
//   validation, diagnostic issue paths.
// - `services/analysis-diagnostics.ts` — failure classification, log shaping,
//   safe user message, idempotent trigger decision.
// - `services/analysis-scope.ts` — request scope resolution, bounded-repair
//   generation, onboarding conclusion gate.
// - `services/analysis-inference.ts` — tech stack inference for `/ask`
//   auto-select.
//
// === Analysis orchestration boundary (Task 6) ===
// Pure, isomorphic helpers for the server-side analysis flow. Database access
// and model invocation live in `codebase-analysis.server.ts`; everything here
// stays unit-testable without a database or network.
//
// This module re-exports the canonical implementations so every existing
// `@/features/codebase/services/analysis` import keeps working unchanged.

export * from "@/features/codebase/services/analysis-diagnostics";
export * from "@/features/codebase/services/analysis-inference";
export * from "@/features/codebase/services/analysis-prompt";
export * from "@/features/codebase/services/analysis-schema";
export * from "@/features/codebase/services/analysis-scope";
export * from "@/features/codebase/services/analysis-validation";
