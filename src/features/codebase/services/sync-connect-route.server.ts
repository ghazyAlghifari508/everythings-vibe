// CLI attempt announcement for `/api/v1/codebases/$id/codebase/connect`.
//
// The CLI calls this at the start of `codebase sync`, before it resolves the
// local root and before its handshake. It is the only honest source of the
// "connecting" phase the browser renders: a real server-observed fact ("this
// attempt's agent has started") rather than a fabricated spinner or a delay.
//
// Two properties keep it from becoming a false claim:
// 1. it never advances the status — `waiting_for_cli -> connected` stays the
//    handshake's job, because only the handshake carries the repository
//    identity the upload is bound to;
// 2. it is ignored once the attempt has left `waiting_for_cli`, so a duplicated
//    or late announcement cannot repaint a session the server moved on from.
//
// It does bind the attempt's snapshot (the same idempotent transaction the
// handshake uses) so a CLI that fails between announcing and handshaking can
// still report that failure through `/codebase/failure`; without a bound
// snapshot the transport guard would reject the report and the browser would
// sit on a connecting row until the session expired.
//
// Backward compatible by construction: older CLIs never call it, and a newer CLI
// treats an unreachable announcement as "no connecting phase" and continues to
// its handshake.
//
// Server-only module: it imports the database client and `.server` helpers.
// Never import it from client code.
import { compareRepositoryIdentity } from "./repository-identity";
import { cliConnectResponseSchema, cliHandshakeRequestSchema } from "./sync";
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

export async function handleCodebaseSyncConnect(input: {
	request: Request;
	params: { id: string };
}): Promise<Response> {
	const { request, params } = input;
	const codebaseId = params.id;

	const access = await resolveCliSyncAccess({ request, codebaseId });
	if (!access.ok) return access.response;
	const { session, codebase } = access;

	// The announcement carries the CLI version only: the repository name is not
	// known yet (it is resolved after this call) and nothing else is trusted.
	const body = await request.json().catch(() => null);
	const parsedBody = cliHandshakeRequestSchema.safeParse(body);
	if (!parsedBody.success)
		return Response.json(
			{ error: "cliVersion is required", code: "SYNC_FAILED" },
			{ status: 400 },
		);

	// Same fail-closed gate and budget as the handshake, so an outdated or
	// looping CLI is rejected here instead of one request later.
	const versionFailure = evaluateCliVersion(
		session,
		parsedBody.data.cliVersion,
	);
	if (versionFailure) return versionFailure;
	const budgetFailure = await enforceCliSyncBudget(session);
	if (budgetFailure) return budgetFailure;

	let announceResult: SyncHandshakeResult;
	try {
		announceResult = await runSyncHandshakeTransaction({
			sessionId: session.id,
			sessionStatus: session.status,
			sessionMetadata: session.metadata,
			codebaseId,
			userId: session.userId,
			cliVersion: parsedBody.data.cliVersion,
			repositoryName: null,
			repositoryIdentity: null,
			identityComparison: compareRepositoryIdentity(
				codebase.repositoryIdentity,
				null,
			),
			announceOnly: true,
		});
	} catch (error) {
		if (error instanceof SyncBindingError)
			return Response.json(
				{ error: error.message, code: error.code },
				{ status: 401 },
			);
		throw error;
	}

	// One session is one attempt, so the attempt identity is the session identity.
	const parsed = cliConnectResponseSchema.safeParse({
		sessionId: session.id,
		attemptId: session.id,
		status: announceResult.status,
		expiresAt: session.expiresAt.toISOString(),
	});
	if (!parsed.success)
		return Response.json(
			{ error: "Failed to announce sync attempt", code: "SYNC_FAILED" },
			{ status: 500 },
		);
	return Response.json(parsed.data);
}
