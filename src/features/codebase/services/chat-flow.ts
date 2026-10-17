// Facade for the codebase workspace chat flow.
//
// Canonical implementations live in sibling modules:
// - `services/chat-flow-run.ts` — observable state of one AI request, plus the
//   honest per-stage activity and settled labels.
// - `services/chat-flow-stage.ts` — artifact reveal gate, persisted/resume stage
//   resolution, monotonic stage reconciliation.
// - `services/chat-flow-questions.ts` — adaptive question mapping, answer
//   ordering, feature message, and Ask handoff serialize/restore/parse.
// - `services/chat-flow-generate.ts` — feature specification generation gated on
//   real server-side persistence.
//
// This module re-exports the canonical implementations so every existing
// `@/features/codebase/services/chat-flow` import keeps working unchanged.

export * from "@/features/codebase/services/chat-flow-generate";
export * from "@/features/codebase/services/chat-flow-questions";
export * from "@/features/codebase/services/chat-flow-run";
export * from "@/features/codebase/services/chat-flow-stage";
