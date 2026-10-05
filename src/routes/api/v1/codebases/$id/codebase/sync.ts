import { createFileRoute } from "@tanstack/react-router";
import { and, desc, eq, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import {
	codebaseSnapshots,
	codebaseSyncSessions,
	codebases,
	subscriptions,
} from "@/db/schema";
import { normalizeRepositoryName } from "@/lib/codebase-library";
import {
	assertSyncTransition,
	buildHandshakeMetadata,
	CODEBASE_SYNC_RATE_LIMIT_ACTION,
	type CodebaseSyncStatus,
	cliHandshakeRequestSchema,
	cliHandshakeResponseSchema,
	getSessionUsability,
	requireSupportedCliVersion,
} from "@/lib/codebase-sync";
import { hashSyncToken } from "@/lib/codebase-sync.server";
import { checkRateLimit } from "@/lib/rate-limit";
import type { Plan } from "@/types/database";

function bearerToken(request: Request): string | null {
	const header = request.headers.get("Authorization");
	if (!header || !header.startsWith("Bearer ")) return null;
	const token = header.slice(7).trim();
	return token ? token : null;
}

export const Route = createFileRoute("/api/v1/codebases/$id/codebase/sync")({
	server: {
		handlers: {
			// CLI handshake: `prdfy codebase sync --project-id <id>
			// --sync-token <token>` POSTs { cliVersion } with the short-lived
			// sync credential as Bearer auth. The `--project-id` value is a
			// codebase id. Bearer-only: ordinary API keys
			// are never accepted here (their value matches no credential
			// hash). Success binds session/attempt/snapshot identity and moves
			// waiting_for_cli -> connected; a repeated handshake is
			// idempotent. The CLI enforces the minimum version client-side
			// from the returned cliMinVersion.
			POST: async ({
				request,
				params,
			}: {
				request: Request;
				params: { id: string };
			}) => {
				const { id: codebaseId } = params;
				const rawToken = bearerToken(request);
				if (!rawToken)
					return Response.json(
						{
							error: "Invalid sync credential",
							code: "INVALID_SYNC_CREDENTIAL",
						},
						{ status: 401 },
					);

				// Credential lookup is codebase-bound: a token issued for one
				// codebase never authenticates another (uniform 401, no oracle).
				// The raw token is hashed immediately and never logged/stored.
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

				// Ownership flows through the credential owner; the codebase
				// must still exist and belong to that owner.
				const [codebase] = await db
					.select({ id: codebases.id, userId: codebases.userId })
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
							error:
								error instanceof Error ? error.message : "CLI update required",
							code: "CLI_UPDATE_REQUIRED",
						},
						{ status: 426 },
					);
				}

				// The CLI reports the repository folder name as soon as it has
				// resolved the local root. Validation happens in exactly one
				// place; `null` means "no usable name" (a CLI older than this
				// contract, or a value that is not a single safe path segment)
				// and the sync continues with the existing name untouched.
				const repositoryName = normalizeRepositoryName(
					parsedBody.data.repositoryName,
				);

				const [sub] = await db
					.select({ plan: subscriptions.plan })
					.from(subscriptions)
					.where(eq(subscriptions.userId, session.userId))
					.orderBy(desc(subscriptions.createdAt))
					.limit(1);
				const rawPlan = sub?.plan || "free";
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
					// handshakeAt is the persisted proof that the CLI actually
					// contacted the server for this session. It is written here,
					// inside the handshake transaction, and survives a later failure
					// or expiry so the prompt screen can still tell a handshaked
					// session from one the CLI never reached.
					const metadata = buildHandshakeMetadata({
						previous: currentSession?.metadata ?? session.metadata ?? null,
						cliVersion: parsedBody.data.cliVersion,
						...(repositoryName ? { repositoryName } : {}),
						handshakeAt: new Date(),
					});
					await tx
						.update(codebaseSyncSessions)
						.set({
							status,
							metadata,
							updatedAt: new Date(),
						})
						.where(eq(codebaseSyncSessions.id, session.id));

					// Auto-name the codebase from the repository folder name, but
					// only while the stored name is still one the system chose. A
					// name the user picked (or renamed) carries `nameSource = 'user'`
					// and is never overwritten. Ownership is repeated in the
					// predicate, and the name inequality makes a repeat sync a
					// no-op for naming instead of a second write.
					if (repositoryName) {
						await tx
							.update(codebases)
							.set({ name: repositoryName, updatedAt: new Date() })
							.where(
								and(
									eq(codebases.id, codebaseId),
									eq(codebases.userId, session.userId),
									eq(codebases.nameSource, "auto"),
									ne(codebases.name, repositoryName),
								),
							);
					}

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
								codebaseId,
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
			},
		},
	},
});
