// Legacy project-scoped CLI handshake for
// `/api/v1/projects/$id/codebase/sync`: `prdfy codebase sync --project-id <id>
// --sync-token <token>` POSTs { cliVersion } with the short-lived sync
// credential as Bearer auth. Bearer-only: ordinary API keys are never accepted
// here (their value matches no credential hash). Success binds
// session/attempt/snapshot identity and moves waiting_for_cli -> connected; a
// repeated handshake is idempotent. The CLI enforces the minimum version
// client-side from the returned cliMinVersion.
//
// This is the historical project-bound variant kept as a compatibility facade
// for sessions whose owner key is `project_id`; the codebase-scoped handshake
// (with repository name/identity adoption) lives in
// `sync-handshake-route.server.ts`. Session lookup and the handshake
// transaction are preserved verbatim: the advisory xact lock serializes
// retries so concurrent handshakes cannot create duplicate snapshots or
// double-advance session state.
//
// Server-only module: it imports the database client and `.server` helpers.
// Never import it from client code.
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import {
	codebaseSnapshots,
	codebaseSyncSessions,
	projects,
	subscriptions,
} from "@/db/schema";
import { checkRateLimit } from "@/lib/rate-limit";
import type { Plan } from "@/types/database";
import {
	assertSyncTransition,
	CODEBASE_SYNC_RATE_LIMIT_ACTION,
	type CodebaseSyncStatus,
	cliHandshakeRequestSchema,
	cliHandshakeResponseSchema,
	getSessionUsability,
	isSyncCapableProject,
	requireSupportedCliVersion,
} from "./sync";
import { hashSyncToken } from "./sync.server";

function bearerToken(request: Request): string | null {
	const header = request.headers.get("Authorization");
	if (!header || !header.startsWith("Bearer ")) return null;
	const token = header.slice(7).trim();
	return token ? token : null;
}

export async function handleProjectSyncHandshake(input: {
	request: Request;
	params: { id: string };
}): Promise<Response> {
	const { request, params } = input;
	const projectId = params.id;
	const rawToken = bearerToken(request);
	if (!rawToken)
		return Response.json(
			{
				error: "Invalid sync credential",
				code: "INVALID_SYNC_CREDENTIAL",
			},
			{ status: 401 },
		);

	// Credential lookup is project-bound: a token issued for one
	// project never authenticates another (uniform 401, no oracle).
	// The raw token is hashed immediately and never logged/stored.
	const [session] = await db
		.select()
		.from(codebaseSyncSessions)
		.where(
			and(
				eq(codebaseSyncSessions.credentialHash, hashSyncToken(rawToken)),
				eq(codebaseSyncSessions.projectId, projectId),
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

	// Ownership flows through the credential owner; the project
	// must still exist, belong to that owner, and be an
	// existing-codebase project.
	const [project] = await db
		.select({
			id: projects.id,
			userId: projects.userId,
			projectMode: projects.projectMode,
		})
		.from(projects)
		.where(and(eq(projects.id, projectId), isNull(projects.deletedAt)))
		.limit(1);
	if (!project || project.userId !== session.userId)
		return Response.json(
			{
				error: "Invalid sync credential",
				code: "INVALID_SYNC_CREDENTIAL",
			},
			{ status: 401 },
		);
	if (!isSyncCapableProject(project))
		return Response.json(
			{
				error: "Project is not an existing-codebase project",
				code: "PROJECT_MODE_MISMATCH",
			},
			{ status: 400 },
		);

	const body = await request.json().catch(() => null);
	const parsedBody = cliHandshakeRequestSchema.safeParse(body);
	if (!parsedBody.success)
		return Response.json(
			{ error: "cliVersion is required", code: "SYNC_FAILED" },
			{ status: 400 },
		);

	// Fail-closed server-side version gate (was client-only): an
	// outdated or malformed CLI is rejected here before any session
	// state changes. The recorded version is re-checked on every
	// upload/complete request. 426 is non-retryable for the CLI.
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

	const [sub] = await db
		.select({ plan: subscriptions.plan })
		.from(subscriptions)
		.where(eq(subscriptions.userId, session.userId))
		.orderBy(desc(subscriptions.createdAt))
		.limit(1);
	const rawPlan = sub?.plan || "free";
	const plan: Plan =
		rawPlan === "free" || rawPlan === "pro" || rawPlan === "hengker"
			? rawPlan
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

	// Serialize handshake per session using advisory xact lock:
	// concurrent handshake retries cannot race to create duplicate
	// snapshots or double-advance session state.
	const handshakeResult = await db.transaction(async (tx) => {
		await tx.execute(
			sql`select pg_advisory_xact_lock(hashtext(${session.id}))`,
		);

		const [currentSession] = await tx
			.select({
				status: codebaseSyncSessions.status,
				metadata: codebaseSyncSessions.metadata,
			})
			.from(codebaseSyncSessions)
			.where(eq(codebaseSyncSessions.id, session.id))
			.limit(1);

		let status = (currentSession?.status ??
			session.status) as CodebaseSyncStatus;
		if (status === "waiting_for_cli") {
			assertSyncTransition(status, "connected");
			status = "connected";
		}
		const metadata =
			(currentSession?.metadata as Record<string, unknown> | null) ??
			(session.metadata as Record<string, unknown> | null) ??
			{};
		await tx
			.update(codebaseSyncSessions)
			.set({
				status,
				metadata: { ...metadata, cliVersion: parsedBody.data.cliVersion },
				updatedAt: new Date(),
			})
			.where(eq(codebaseSyncSessions.id, session.id));

		// One snapshot per session: the handshake binds (not creates
		// duplicates on retry) the uploading snapshot for Task 5.
		const [existingSnapshot] = await tx
			.select({ id: codebaseSnapshots.id })
			.from(codebaseSnapshots)
			.where(eq(codebaseSnapshots.syncSessionId, session.id))
			.orderBy(desc(codebaseSnapshots.createdAt))
			.limit(1);

		let snapshotId = existingSnapshot?.id;
		if (!snapshotId) {
			const [inserted] = await tx
				.insert(codebaseSnapshots)
				.values({
					id: crypto.randomUUID(),
					projectId,
					syncSessionId: session.id,
					status: "uploading",
					fileCount: 0,
					excludedCount: 0,
					contentSize: 0,
				})
				.returning({ id: codebaseSnapshots.id });
			snapshotId = inserted?.id;
		}

		return { status, snapshotId };
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

	// One session is one attempt: a retry mints a new session, so
	// the attempt identity is the session identity.
	const parsed = cliHandshakeResponseSchema.safeParse({
		sessionId: session.id,
		attemptId: session.id,
		snapshotId,
		status,
		cliMinVersion: session.cliMinVersion,
		expiresAt: session.expiresAt.toISOString(),
	});
	if (!parsed.success)
		return Response.json(
			{ error: "Failed to initialize sync session", code: "SYNC_FAILED" },
			{ status: 500 },
		);
	return Response.json(parsed.data);
}
