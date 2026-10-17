// Compatibility facade for the codebase-sync domain.
//
// Canonical implementations live in `src/features/codebase/`:
// - `types/sync-schemas.ts` — Zod schemas, inferred types, payload contracts.
// - `services/sync-lifecycle.ts` — status machine, transitions, lifecycle log,
//   upload advancement.
// - `services/sync-session.ts` — session eligibility, storage keys, capability,
//   snapshot selection.
// - `services/sync-stages.ts` — stage progression and UI-facing status mapping.
// - `services/sync-handshake.ts` — handshake evidence, repository identity,
//   CLI version gate.
// - `services/sync-validation.ts` — path, payload, metadata, security validation.
// - `services/sync-transport.ts` — idempotency, replay identity, attempt
//   binding, snapshot completion.
// - `services/sync-commands.ts` — CLI command generation.
// - `services/sync-prompts.ts` — agent instructions and prompt generation.
//
// This module re-exports the canonical implementations so every existing
// `(@/)lib/codebase-sync` import keeps working without behavioral change.

export * from "@/features/codebase/services/sync-commands";
export * from "@/features/codebase/services/sync-handshake";
export * from "@/features/codebase/services/sync-lifecycle";
export * from "@/features/codebase/services/sync-prompts";
export * from "@/features/codebase/services/sync-session";
export * from "@/features/codebase/services/sync-stages";
export * from "@/features/codebase/services/sync-transport";
export * from "@/features/codebase/services/sync-validation";
export * from "@/features/codebase/types/sync-schemas";
