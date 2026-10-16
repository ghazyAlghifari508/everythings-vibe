import {
	CODEBASE_SYNC_TERMINAL_STATUSES,
	codebaseSyncStatusSchema,
} from "../types/sync-schemas";

// === Sync session lifecycle (Task 4; pure, DB-agnostic) ===
// Row shapes are structural so these helpers stay unit-testable without a
// database and importable from isomorphic code (no node:crypto here —
// credential generation/hashing lives in `codebase-sync.server.ts`).

export interface SyncSessionLike {
	id: string;
	// Legacy project linkage; null for codebase-scoped sessions created
	// after the project_id columns became nullable (ownership flows via
	// codebaseId). Usability never reads this field.
	projectId: string | null;
	userId: string;
	// Codebase owner key for sessions minted under /api/codebases.
	// Absent on legacy project-bound rows and in unit fixtures.
	codebaseId?: string | null;
	status: string;
	expiresAt: Date | string;
	consumedAt?: Date | string | null;
	updatedAt?: Date | string | null;
}

export type SessionUsability =
	| { usable: true }
	| {
			usable: false;
			code:
				| "SYNC_SESSION_EXPIRED"
				| "SYNC_CREDENTIAL_REVOKED"
				| "SYNC_SESSION_TERMINAL";
			httpStatus: 401 | 410;
	  };

export function getSessionUsability(
	session: SyncSessionLike,
	now: Date = new Date(),
): SessionUsability {
	if (session.consumedAt) {
		return {
			usable: false,
			code: "SYNC_CREDENTIAL_REVOKED",
			httpStatus: 401,
		};
	}
	if (new Date(session.expiresAt).getTime() <= now.getTime()) {
		return {
			usable: false,
			code: "SYNC_SESSION_EXPIRED",
			httpStatus: 410,
		};
	}
	if (!codebaseSyncStatusSchema.safeParse(session.status).success) {
		return {
			usable: false,
			code: "SYNC_SESSION_TERMINAL",
			httpStatus: 401,
		};
	}
	if (
		(CODEBASE_SYNC_TERMINAL_STATUSES as readonly string[]).includes(
			session.status,
		)
	) {
		return {
			usable: false,
			code: "SYNC_SESSION_TERMINAL",
			httpStatus: 401,
		};
	}
	return { usable: true };
}

export function canAccessSyncSession(
	session: Pick<SyncSessionLike, "projectId" | "userId">,
	userId: string,
	projectId: string,
): boolean {
	return session.userId === userId && session.projectId === projectId;
}

export function isSyncCapableProject(project: {
	projectMode?: string | null;
}): boolean {
	return project?.projectMode === "existing_codebase";
}

// Browser handoff for Home-created existing-codebase projects: the creation
// response carries the one-time sync payload, the Home composer stashes it
// under this per-project sessionStorage key, and the /codebase/$id page
// consumes it once to open the agent modal. The key carries only the project
// id — never credential material.
export function getPendingSyncPayloadKey(projectId: string): string {
	return `prdfy:sync-payload:${projectId}`;
}

// Plan-page recovery pointer: /plan/codebase creates a codebase without a
// route param, so a refresh would otherwise orphan the in-flight sync and mint
// a new codebase. The stored value is only the codebase id/name pointer —
// never the sync token or sync state. Authoritative sync state always comes
// from GET /api/codebases/:id/status; a missing token after refresh is
// replaced via POST /session retry (new credential), never restored from
// storage.
export const PLAN_CODEBASE_ID_STORAGE_KEY = "prdfy:plan-codebase-id";
export const PLAN_CODEBASE_NAME_STORAGE_KEY = "prdfy:plan-codebase-name";
// Onboarding analysis project pointer: /plan/codebase ensures one
// existing-codebase feature project per codebase so the initial analysis can
// run through the existing per-feature analysis boundary. The value is only
// the project id — never sync state, which always comes from GET status and
// GET analysis. Stored alongside the codebase pointer above so refresh
// recovery reuses the project instead of minting duplicates.
export const PLAN_CODEBASE_PROJECT_STORAGE_KEY =
	"prdfy:plan-codebase-project-id";
// Onboarding step pointer: which of the three steps the user was last on.
// The step is a navigation intent, not domain state — sync and analysis state
// always come from GET status and GET analysis. Storing it is what lets a
// refresh return the user to the screen they were reading instead of guessing
// a screen from the server snapshot alone.
export const PLAN_CODEBASE_STEP_STORAGE_KEY = "prdfy:plan-codebase-step";
// Active feature-plan pointer for the repository workspace: which of a
// codebase's several feature plans the user last had open. Suffixed with the
// codebase id so two repositories never share a pointer. Navigation state only
// — planning artifacts always come from the server, and the workspace resolves
// a correct plan on its own when this pointer is missing or stale.
export const ACTIVE_PLAN_POINTER_STORAGE_KEY_PREFIX =
	"prdfy:active-plan-project-id:";

// One usable credential per project: this predicate is advisory only; session
// creation must re-check under a per-project transaction/advisory lock
// (`pg_advisory_xact_lock(hashtext(projectId))` in `/api/codebase/$projectId/session`)
// so concurrent mints cannot race to issue multiple usable credentials.
// Terminal or expired rows never block a retry — the retry mints a new
// session instead of mutating them.
export function shouldCreateSyncSession(
	existing: readonly SyncSessionLike[],
	now: Date = new Date(),
): boolean {
	return !existing.some((session) => getSessionUsability(session, now).usable);
}

// Revocation is explicit: the row moves to `expired` and records consumption
// so the credential is rejected after completion, expiry, or manual revoke.
// The credential hash is preserved (audit); no raw credential is introduced.
export function applySessionRevocation<T extends SyncSessionLike>(
	session: T,
	now: Date = new Date(),
): T {
	return { ...session, status: "expired", consumedAt: now, updatedAt: now };
}

export interface SyncSessionMetadata {
	sessionId: string;
	projectId: string;
	status: string;
	expiresAt: string;
	createdAt?: string;
	updatedAt?: string;
}

// Browser reads (session GET, status polling) expose metadata only — never
// the credential hash or a raw credential after initial creation.
export function toSessionMetadata(
	session: Omit<SyncSessionLike, "projectId"> & {
		// Metadata always carries a concrete owner id: the project id for
		// legacy routes, the codebase id for /api/codebases routes (the
		// SyncPromptPayload.projectId name is kept, value is the codebase
		// id). Callers spread the row and supply the known id explicitly.
		projectId: string;
		credentialHash?: string;
		createdAt?: Date | string | null;
	},
): SyncSessionMetadata {
	const toIso = (
		value: Date | string | null | undefined,
	): string | undefined => {
		if (!value) return undefined;
		return value instanceof Date ? value.toISOString() : value;
	};
	return {
		sessionId: session.id,
		projectId: session.projectId,
		status: session.status,
		expiresAt: toIso(session.expiresAt) ?? "",
		createdAt: toIso(session.createdAt),
		updatedAt: toIso(session.updatedAt),
	};
}

// === Generation-context selection ===
// The codebase page asks "which snapshot is newest" — a re-sync must be visible
// immediately, so newest wins. Generation does NOT use this function: each
// feature resolves through its own newest ready analysis
// (`selectNewestReadyAnalysis`), which permanently binds a feature to the
// codebase state it was planned against and stops a later re-sync from
// retroactively changing an existing feature's context.
//
// `selectedId` remains an override for a future explicit snapshot picker.

// Snapshots a feature may be planned against: `uploaded` is the terminal state
// written by completion, `ready` is retained for rows created before the
// codebase model existed.
export const SNAPSHOT_CONTEXT_STATUSES: readonly string[] = [
	"uploaded",
	"ready",
] as const;

export interface SelectableSnapshot {
	id: string;
	status: string;
	createdAt: string;
}

export function selectActiveSnapshot<T extends SelectableSnapshot>(
	snapshots: readonly T[],
	selectedId?: string,
): T | null {
	const usable = [...snapshots]
		.filter((snapshot) => SNAPSHOT_CONTEXT_STATUSES.includes(snapshot.status))
		.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
	if (usable.length === 0) return null;
	if (selectedId) {
		const selected = usable.find((snapshot) => snapshot.id === selectedId);
		if (selected) return selected;
	}
	return usable[0];
}

// === Sync capability scope (Task 4) ===
// Dedicated narrow scope for codebase sync uploads. A sync credential must
// not grant task mutation or unrelated project access, and ordinary auto-CLI
// keys (`read:project`, `write:task:status`, …) must never satisfy a sync
// capability check. Auto-key scopes in
// `src/routes/api/settings/api-keys/auto.ts` stay unchanged.

export const CODEBASE_SYNC_SCOPE = "codebase:sync" as const;

export function hasSyncCapability(
	scopes: readonly string[] | null | undefined,
): boolean {
	if (!scopes) return false;
	return (
		scopes.includes(CODEBASE_SYNC_SCOPE) ||
		scopes.includes("admin") ||
		scopes.includes("*")
	);
}

// === Sync rate-limit convention (Task 4) ===
// CLI transport endpoints (handshake, manifest, files, complete, failure) reuse
// the neighboring `api_call` action from `src/lib/rate-limit.ts` (same
// convention as `/api/ask/options`).

export const CODEBASE_SYNC_RATE_LIMIT_ACTION = "api_call" as const;

// Browser status polling gets a SEPARATE action from the CLI transport. Sharing
// one budget made the observer compete with the observed: `waiting_for_cli` is
// the normal state for a whole session, so a browser tab polling on a 2s
// cadence burned half the shared `general` allowance (60/min) before the CLI
// could upload anything. Reconciliation must be bounded on its own terms and
// must never throttle the transport it reports on.

export const CODEBASE_SYNC_STATUS_RATE_LIMIT_ACTION =
	"sync_status_read" as const;
