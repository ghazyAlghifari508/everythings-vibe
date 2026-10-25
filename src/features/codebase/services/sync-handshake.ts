import { z } from "zod";
import { CODEBASE_CLI_MIN_VERSION } from "@/features/codebase/types/codebase-constants";
import type { CodebaseSyncStatus } from "../types/sync-schemas";
import { CODEBASE_SYNC_COMPLETE_STATUSES } from "./sync-lifecycle";

// === CLI handshake evidence ===
// "May the user leave the prompt screen?" is a question only the server can
// answer. A copy click is browser-local UI feedback: it proves nothing about
// whether the agent ran, so it can never gate navigation.
//
// The persisted facts that DO prove a handshake are:
// 1. the session left `waiting_for_cli` — the transition map makes
//    `waiting_for_cli -> connected` reachable ONLY through the CLI handshake
//    route (see `/api/v1/codebases/$id/codebase/sync`), and
// 2. `codebase_sync_sessions.metadata.handshakeAt`, written by that same route
//    inside its handshake transaction.
//
// (1) alone is ambiguous for `failed`/`expired`: both are reachable directly
// from `waiting_for_cli` without any CLI contact, so a terminal status must NOT
// imply a handshake. `metadata.cliVersion` is not proof either — a session can
// expire before the CLI ever runs. That is why the handshake persists its own
// timestamp rather than relying on a status or a version field.
//
// Fast CLI case: a browser whose first poll already observes `uploading` or
// `uploaded` still satisfies (1), so the gate stays correct without ever having
// polled the intermediate `connected` state.

export const CLI_HANDSHAKE_METADATA_KEY = "handshakeAt" as const;

// Reachable from `waiting_for_cli` with no CLI contact (see SYNC_TRANSITIONS),
// so neither one proves a handshake on its own.
const CODEBASE_SYNC_PRE_HANDSHAKE_STATUSES: readonly CodebaseSyncStatus[] = [
	"waiting_for_cli",
	"failed",
	"expired",
] as const;

export function readCliHandshakeAt(metadata: unknown): string | null {
	if (typeof metadata !== "object" || metadata === null) return null;
	const raw = (metadata as Record<string, unknown>)[CLI_HANDSHAKE_METADATA_KEY];
	const parsed = z.string().datetime().safeParse(raw);
	return parsed.success ? parsed.data : null;
}

/**
 * Metadata patch persisted by a successful CLI handshake. The first
 * handshakeAt wins so an idempotent retry cannot push the evidence forward and
 * make a stale session look freshly connected.
 */
export function buildHandshakeMetadata(input: {
	previous: unknown;
	cliVersion: string;
	repositoryName?: string;
	handshakeAt: Date;
}): Record<string, unknown> {
	const previous =
		typeof input.previous === "object" && input.previous !== null
			? (input.previous as Record<string, unknown>)
			: {};
	const existingHandshakeAt = readCliHandshakeAt(previous);
	return {
		...previous,
		cliVersion: input.cliVersion,
		...(input.repositoryName ? { repositoryName: input.repositoryName } : {}),
		[CLI_HANDSHAKE_METADATA_KEY]:
			existingHandshakeAt ?? input.handshakeAt.toISOString(),
	};
}

/**
 * "Has the server observed the CLI actually starting this sync attempt?"
 *
 * True when the session advanced past the pre-handshake states, or when the
 * handshake transaction persisted its timestamp. A terminal session that never
 * handshaked stays false; one that did stays true.
 */
export function hasCliHandshake(status: {
	status: CodebaseSyncStatus;
	cliConnectedAt?: string | null;
}): boolean {
	if (status.cliConnectedAt) return true;
	return !(CODEBASE_SYNC_PRE_HANDSHAKE_STATUSES as readonly string[]).includes(
		status.status,
	);
}

/** Metadata key holding the repository identity reported at handshake. */
export const REPOSITORY_IDENTITY_METADATA_KEY = "repositoryIdentity";
/** Metadata key marking that the reported identity did not match the stored one. */
export const REPOSITORY_IDENTITY_MISMATCH_METADATA_KEY =
	"repositoryIdentityMismatch";

/**
 * Record the repository identity the CLI reported, plus whether it agreed with
 * what the codebase already held.
 *
 * The identity is a normalized, credential-free value, so persisting it in
 * session metadata is safe. The mismatch flag is the durable proof that an
 * upload targeted a codebase bound to another repository; a later handshake
 * that does match clears it, so the warning never outlives the condition.
 */
export function buildRepositoryIdentityMetadata(input: {
	previous: unknown;
	repositoryIdentity: string;
	matchesStored: boolean;
	at: Date;
}): Record<string, unknown> {
	const previous =
		typeof input.previous === "object" && input.previous !== null
			? (input.previous as Record<string, unknown>)
			: {};
	const next: Record<string, unknown> = {
		...previous,
		[REPOSITORY_IDENTITY_METADATA_KEY]: input.repositoryIdentity,
		[REPOSITORY_IDENTITY_REPORTED_AT_METADATA_KEY]: input.at.toISOString(),
	};
	if (input.matchesStored) {
		delete next[REPOSITORY_IDENTITY_MISMATCH_METADATA_KEY];
		return next;
	}
	next[REPOSITORY_IDENTITY_MISMATCH_METADATA_KEY] = true;
	return next;
}

/** When the CLI last reported a repository identity for this session. */
export const REPOSITORY_IDENTITY_REPORTED_AT_METADATA_KEY =
	"repositoryIdentityReportedAt";

/** Read the persisted mismatch flag, or false when it was never set. */
export function readRepositoryIdentityMismatch(metadata: unknown): boolean {
	if (typeof metadata !== "object" || metadata === null) return false;
	const value = (metadata as Record<string, unknown>)[
		REPOSITORY_IDENTITY_MISMATCH_METADATA_KEY
	];
	return value === true;
}

/**
 * Whether the conclusion step may be opened.
 *
 * Transport-only: an uploaded snapshot is a finished sync whether or not the
 * model has run, so "Kesimpulan Codebase" is reachable while analysis is still
 * pending — that step owns the pending state itself.
 *
 * This is also the ONLY thing that unlocks the instruction screen's continue
 * action. Copying the prompt is browser-local feedback and proves nothing about
 * whether the agent ran, so it has no influence here.
 */
export function canOpenSummary(
	status:
		| {
				status: CodebaseSyncStatus;
				snapshotId?: string | null;
				cliConnectedAt?: string | null;
		  }
		| null
		| undefined,
): boolean {
	// No status at all means the browser has not heard from the server, which is
	// never evidence that a snapshot exists.
	if (!status) return false;
	if (!status.snapshotId) return false;
	if (!hasCliHandshake(status)) return false;
	return (CODEBASE_SYNC_COMPLETE_STATUSES as readonly string[]).includes(
		status.status,
	);
}

// Numeric semver comparison for the server-side version hint. Malformed
// input is treated as unsupported (fail closed).
export function isSupportedCliVersion(
	cliVersion: string,
	minVersion: string = CODEBASE_CLI_MIN_VERSION,
): boolean {
	const parse = (value: string): number[] | null => {
		const parts = value.split(".");
		if (parts.length === 0) return null;
		const numbers: number[] = [];
		for (const part of parts) {
			if (!/^\d+$/.test(part)) return null;
			numbers.push(Number(part));
		}
		return numbers;
	};
	const current = parse(cliVersion);
	const minimum = parse(minVersion);
	if (!current || !minimum) return false;
	for (let i = 0; i < Math.max(current.length, minimum.length); i += 1) {
		const diff = (current[i] ?? 0) - (minimum[i] ?? 0);
		if (diff !== 0) return diff > 0;
	}
	return true;
}

// === Fail-closed CLI version gate (Task 5 carry-over) ===
// Task 4 left the minimum-version check client-only. Upload and handshake
// paths now reject unsupported CLIs server-side: the handshake validates the
// reported version, and upload/complete endpoints validate the version stored
// on the session at handshake time. Malformed versions are rejected (never
// treated as new-enough). The CLI treats 426 as non-retryable and surfaces
// the update guidance.

export class CliVersionError extends Error {
	readonly code = "CLI_UPDATE_REQUIRED" as const;

	constructor() {
		super(
			`This CLI version is below the required minimum ${CODEBASE_CLI_MIN_VERSION}. Update with: npm i -g @ghazynabiel/everythings-vibe`,
		);
		this.name = "CliVersionError";
	}
}

export function requireSupportedCliVersion(
	cliVersion: unknown,
	minVersion: string = CODEBASE_CLI_MIN_VERSION,
): void {
	if (
		typeof cliVersion !== "string" ||
		!isSupportedCliVersion(cliVersion, minVersion)
	) {
		throw new CliVersionError();
	}
}
