// CLI handshake for `/api/v1/codebases/$id/codebase/sync`:
// `prdfy codebase sync --project-id <id> --sync-token <token>` POSTs
// { cliVersion } with the short-lived sync credential as Bearer auth. The
// `--project-id` value is a codebase id. Bearer-only: ordinary API keys are
// never accepted here (their value matches no credential hash). Success binds
// session/attempt/snapshot identity and moves waiting_for_cli -> connected; a
// repeated handshake is idempotent. The CLI enforces the minimum version
// client-side from the returned cliMinVersion.
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { codebaseSyncSessions, codebases, subscriptions } from "@/db/schema";
import { checkRateLimit } from "@/lib/rate-limit";
import type { Plan } from "@/types/database";
import { normalizeRepositoryName } from "./library";
import {
	compareRepositoryIdentity,
	normalizeRepositoryIdentity,
} from "./repository-identity";
import {
	CODEBASE_SYNC_RATE_LIMIT_ACTION,
	cliHandshakeRequestSchema,
	cliHandshakeResponseSchema,
	getSessionUsability,
	requireSupportedCliVersion,
} from "./sync";
import { hashSyncToken } from "./sync.server";
import { runSyncHandshakeTransaction } from "./sync-handshake-transaction.server";

function bearerToken(request: Request): string | null {
	const header = request.headers.get("Authorization");
	if (!header || !header.startsWith("Bearer ")) return null;
	const token = header.slice(7).trim();
	return token ? token : null;
}

export async function handleCodebaseSyncHandshake(input: {
	request: Request;
	params: { id: string };
}): Promise<Response> {
	const { request, params } = input;
	const codebaseId = params.id;
	const rawToken = bearerToken(request);
	if (!rawToken)
		return Response.json(
			{
				error: "Invalid sync credential",
				code: "INVALID_SYNC_CREDENTIAL",
			},
			{ status: 401 },
		);

	// Credential lookup is codebase-bound: a token issued for one codebase never
	// authenticates another (uniform 401, no oracle). The raw token is hashed
	// immediately and never logged/stored.
	const [session] = await db
		.select()
		.from(codebaseSyncSessions)
		.where(
			and(
				eq(codebaseSyncSessions.credentialHash, hashSyncToken(rawToken)),
				eq(codebaseSyncSessions.codebaseId, codebaseId),
			),
		)
		.limit(1);
	if (!session)
		return Response.json(
			{
				error: "Invalid sync credential",
				code: "INVALID_SYNC_CREDENTIAL",
			},
			{ status: 401 },
		);

	const usability = getSessionUsability(session);
	if (!usability.usable) {
		if (usability.code === "SYNC_SESSION_EXPIRED") {
			await db
				.update(codebaseSyncSessions)
				.set({ status: "expired", updatedAt: new Date() })
				.where(eq(codebaseSyncSessions.id, session.id));
			return Response.json(
				{
					error: "Sync session expired. Create a new sync session.",
					code: "SYNC_SESSION_EXPIRED",
				},
				{ status: 410 },
			);
		}
		return Response.json(
			{
				error: "Sync credential is no longer valid",
				code:
					usability.code === "SYNC_CREDENTIAL_REVOKED"
						? "SYNC_CREDENTIAL_REVOKED"
						: "SYNC_SESSION_TERMINAL",
			},
			{ status: 401 },
		);
	}

	// Ownership flows through the credential owner; the codebase must still exist
	// and belong to that owner.
	const [codebase] = await db
		.select({
			id: codebases.id,
			userId: codebases.userId,
			name: codebases.name,
			nameSource: codebases.nameSource,
			repositoryIdentity: codebases.repositoryIdentity,
		})
		.from(codebases)
		.where(eq(codebases.id, codebaseId))
		.limit(1);
	if (!codebase || codebase.userId !== session.userId)
		return Response.json(
			{
				error: "Invalid sync credential",
				code: "INVALID_SYNC_CREDENTIAL",
			},
			{ status: 401 },
		);

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
	try {
		requireSupportedCliVersion(
			parsedBody.data.cliVersion,
			session.cliMinVersion,
		);
	} catch (error) {
		return Response.json(
			{
				error: error instanceof Error ? error.message : "CLI update required",
				code: "CLI_UPDATE_REQUIRED",
			},
			{ status: 426 },
		);
	}

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

	const [sub] = await db
		.select({ plan: subscriptions.plan })
		.from(subscriptions)
		.where(eq(subscriptions.userId, session.userId))
		.orderBy(desc(subscriptions.createdAt))
		.limit(1);
	const rawPlan = sub?.plan || "free";
	// cast boundary: the runtime check above already restricts the value; the
	// assertion only recovers the literal type `Array.includes` widens away.
	const plan: Plan = ["free", "pro", "hengker"].includes(rawPlan)
		? (rawPlan as Plan)
		: "free";
	const rateCheck = await checkRateLimit(
		session.userId,
		plan,
		CODEBASE_SYNC_RATE_LIMIT_ACTION,
	);
	if (!rateCheck.allowed)
		return Response.json(
			{ error: "Too many requests", retryAfter: 60 },
			{ status: 429 },
		);

	// Serialize handshake per session using advisory xact lock: concurrent
	// handshake retries cannot race to create duplicate snapshots or
	// double-advance session state.
	const identityComparison = compareRepositoryIdentity(
		codebase.repositoryIdentity,
		repositoryIdentity,
	);
	const handshakeResult = await runSyncHandshakeTransaction({
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
