// CLI handshake for `/api/v1/codebases/$id/codebase/sync`:
// `prdfy codebase sync --project-id <id> --sync-token <token>` POSTs
// { cliVersion } with the short-lived sync credential as Bearer auth. The
// `--project-id` value is a codebase id. Bearer-only: ordinary API keys are
// never accepted here (their value matches no credential hash). Success binds
// session/attempt/snapshot identity and moves waiting_for_cli -> connected; a
// repeated handshake is idempotent. The CLI enforces the minimum version
// client-side from the returned cliMinVersion.
//
// This is the operation that commits a connection. The attempt's earlier
// announcement (`/codebase/connect`) records that the CLI started, but it never
// advances the status: only this transaction may, because only it carries the
// repository identity the upload is bound to.
import { normalizeRepositoryName } from "./library";
import {
	compareRepositoryIdentity,
	normalizeRepositoryIdentity,
} from "./repository-identity";
import { cliHandshakeRequestSchema, cliHandshakeResponseSchema } from "./sync";
import {
	enforceCliSyncBudget,
	evaluateCliVersion,
	resolveCliSyncAccess,
} from "./sync-cli-auth.server";
import {
	runSyncHandshakeTransaction,
	type SyncHandshakeResult,
} from "./sync-handshake-transaction.server";
import { SyncBindingError } from "./sync-transport";

export async function handleCodebaseSyncHandshake(input: {
	request: Request;
	params: { id: string };
}): Promise<Response> {
	const { request, params } = input;
	const codebaseId = params.id;

	// Credential resolution is shared with the connect announcement, so both
	// boundaries answer "may this CLI act on this codebase" identically.
	const access = await resolveCliSyncAccess({ request, codebaseId });
	if (!access.ok) return access.response;
	const { session, codebase } = access;

	const body = await request.json().catch(() => null);
	const parsedBody = cliHandshakeRequestSchema.safeParse(body);
	if (!parsedBody.success)
		return Response.json(
			{ error: "cliVersion is required", code: "SYNC_FAILED" },
			{ status: 400 },
		);

	// Fail-closed server-side version gate (was client-only): an outdated or
	// malformed CLI is rejected here before any session state changes. The
	// recorded version is re-checked on every upload/complete request. 426 is
	// non-retryable for the CLI.
	const versionFailure = evaluateCliVersion(
		session,
		parsedBody.data.cliVersion,
	);
	if (versionFailure) return versionFailure;

	const budgetFailure = await enforceCliSyncBudget(session);
	if (budgetFailure) return budgetFailure;

	// The CLI reports the repository folder name as soon as it has resolved the
	// local root. Validation happens in exactly one place; `null` means "no
	// usable name" (a CLI older than this contract, or a value that is not a
	// single safe path segment) and the sync continues with the existing name
	// untouched.
	const repositoryName = normalizeRepositoryName(
		parsedBody.data.repositoryName,
	);
	// Same boundary for the Git remote identity: untrusted cosmetic metadata,
	// validated here and ignored when unusable. It is never used to pick a
	// codebase automatically — a mismatch is reported back to the CLI so the user
	// can notice a wrong-repository upload.
	const repositoryIdentity = normalizeRepositoryIdentity(
		typeof parsedBody.data.repositoryIdentity === "string"
			? parsedBody.data.repositoryIdentity
			: null,
	);

	// Serialize handshake per session using advisory xact lock: concurrent
	// handshake retries cannot race to create duplicate snapshots or
	// double-advance session state.
	const identityComparison = compareRepositoryIdentity(
		codebase.repositoryIdentity,
		repositoryIdentity,
	);
	let handshakeResult: SyncHandshakeResult;
	try {
		handshakeResult = await runSyncHandshakeTransaction({
			sessionId: session.id,
			// The stored status is a text column; the handshake transaction narrows it
			// and fails closed on unreachable moves.
			sessionStatus: session.status,
			sessionMetadata: session.metadata,
			codebaseId,
			userId: session.userId,
			cliVersion: parsedBody.data.cliVersion,
			repositoryName,
			repositoryIdentity,
			identityComparison,
		});
	} catch (error) {
		if (error instanceof SyncBindingError)
			return Response.json(
				{ error: error.message, code: error.code },
				{ status: 401 },
			);
		throw error;
	}

	if (!handshakeResult.snapshotId) {
		return Response.json(
			{
				error: "Failed to initialize sync snapshot",
				code: "SYNC_FAILED",
			},
			{ status: 500 },
		);
	}

	const { status, snapshotId } = handshakeResult;

	// One session is one attempt: a retry mints a new session, so the attempt
	// identity is the session identity.
	const parsed = cliHandshakeResponseSchema.safeParse({
		sessionId: session.id,
		attemptId: session.id,
		snapshotId,
		status,
		cliMinVersion: session.cliMinVersion,
		expiresAt: session.expiresAt.toISOString(),
		// Reported so the CLI can warn that this upload targets a codebase already
		// bound to a different repository. The sync itself is not blocked: the
		// user owns both rows and the session's own snapshot stays attached to
		// this codebase.
		...(repositoryIdentity &&
		codebase.repositoryIdentity &&
		!identityComparison.matches
			? { repositoryIdentityMismatch: true }
			: {}),
	});
	if (!parsed.success)
		return Response.json(
			{ error: "Failed to initialize sync session", code: "SYNC_FAILED" },
			{ status: 500 },
		);
	return Response.json(parsed.data);
}
