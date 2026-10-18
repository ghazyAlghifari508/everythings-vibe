// Handshake transaction for `/api/v1/codebases/$id/codebase/sync`.
//
// Everything that must be atomic with the session status move lives here: the
// advisory lock that serializes concurrent handshake retries, the handshake
// evidence, repository-identity adoption, the system-owned name refresh, and
// the one-snapshot-per-session binding.
import { and, desc, eq, isNull, ne, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
	codebaseSnapshots,
	codebaseSyncSessions,
	codebases,
} from "@/db/schema";
import type { CodebaseSyncStatus } from "../types/sync-schemas";
import { PROVISIONAL_CODEBASE_NAME } from "./library";
import type { compareRepositoryIdentity } from "./repository-identity";
import {
	appendSyncLifecycleEvent,
	assertSyncTransition,
	buildHandshakeMetadata,
	buildRepositoryIdentityMetadata,
} from "./sync";

export interface SyncHandshakeTransactionInput {
	sessionId: string;
	/** Raw stored status. The column is text, so it is narrowed here. */
	sessionStatus: string;
	sessionMetadata: unknown;
	codebaseId: string;
	userId: string;
	cliVersion: string;
	repositoryName: string | null;
	repositoryIdentity: string | null;
	identityComparison: ReturnType<typeof compareRepositoryIdentity>;
}

export async function runSyncHandshakeTransaction(
	input: SyncHandshakeTransactionInput,
): Promise<{ status: CodebaseSyncStatus; snapshotId?: string }> {
	const {
		sessionId,
		codebaseId,
		userId,
		repositoryName,
		repositoryIdentity,
		identityComparison,
	} = input;

	return db.transaction(async (tx) => {
		await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${sessionId}))`);

		const [currentSession] = await tx
			.select({
				status: codebaseSyncSessions.status,
				metadata: codebaseSyncSessions.metadata,
			})
			.from(codebaseSyncSessions)
			.where(eq(codebaseSyncSessions.id, sessionId))
			.limit(1);

		// cast boundary: `codebase_sync_sessions.status` is a text column; every
		// writer stores a `CodebaseSyncStatus`, the transition map below rejects
		// unreachable moves, and the response schema rejects the rest.
		let status = (currentSession?.status ??
			input.sessionStatus) as CodebaseSyncStatus;
		if (status === "waiting_for_cli") {
			assertSyncTransition(status, "connected");
			status = "connected";
		}
		// handshakeAt is the persisted proof that the CLI actually contacted the
		// server for this session. It is written here, inside the handshake
		// transaction, and survives a later failure or expiry so the prompt screen
		// can still tell a handshaked session from one the CLI never reached.
		//
		// The lifecycle log records the same fact as an ordered event so a browser
		// that first polls after this transition can still show WHEN the agent
		// connected instead of only that it did.
		const handshakeAt = new Date();
		const withHandshake = buildHandshakeMetadata({
			previous: currentSession?.metadata ?? input.sessionMetadata ?? null,
			cliVersion: input.cliVersion,
			...(repositoryName ? { repositoryName } : {}),
			handshakeAt,
		});
		const withIdentity = repositoryIdentity
			? buildRepositoryIdentityMetadata({
					previous: withHandshake,
					repositoryIdentity,
					matchesStored: identityComparison.matches,
					at: handshakeAt,
				})
			: withHandshake;
		const metadata = appendSyncLifecycleEvent({
			previous: withIdentity,
			kind: "agent_connected",
			at: handshakeAt,
		});
		await tx
			.update(codebaseSyncSessions)
			.set({
				status,
				metadata,
				updatedAt: new Date(),
			})
			.where(eq(codebaseSyncSessions.id, sessionId));

		// Auto-name the codebase from the repository folder name, but only while
		// the stored name is still one the system chose. A name the user picked
		// (or renamed) carries `nameSource = 'user'` and is never overwritten.
		// Ownership is repeated in the predicate, and the name inequality makes a
		// repeat sync a no-op for naming instead of a second write.
		const identityAllowsNameUpdate =
			!repositoryIdentity ||
			identityComparison.matches ||
			identityComparison.adoptable;
		if (repositoryName && identityAllowsNameUpdate) {
			await tx
				.update(codebases)
				.set({ name: repositoryName, updatedAt: new Date() })
				.where(
					and(
						eq(codebases.id, codebaseId),
						eq(codebases.userId, userId),
						or(
							eq(codebases.nameSource, "auto"),
							eq(codebases.name, PROVISIONAL_CODEBASE_NAME),
						),
						ne(codebases.name, repositoryName),
					),
				);
		}

		// A repository registered before this contract existed has no identity
		// yet, so the first sync that reports one adopts it. A different identity
		// is never written over: the mismatch is reported to the CLI instead,
		// because silently re-pointing a codebase would strand the planning
		// already attached to it.
		if (identityComparison.adoptable && repositoryIdentity) {
			await tx
				.update(codebases)
				.set({
					repositoryIdentity,
					updatedAt: new Date(),
				})
				.where(
					and(
						eq(codebases.id, codebaseId),
						eq(codebases.userId, userId),
						isNull(codebases.repositoryIdentity),
					),
				);
		}

		// One snapshot per session: the handshake binds (not creates duplicates on
		// retry) the uploading snapshot for Task 5.
		const [existingSnapshot] = await tx
			.select({ id: codebaseSnapshots.id })
			.from(codebaseSnapshots)
			.where(eq(codebaseSnapshots.syncSessionId, sessionId))
			.orderBy(desc(codebaseSnapshots.createdAt))
			.limit(1);

		let snapshotId = existingSnapshot?.id;
		if (!snapshotId) {
			const [inserted] = await tx
				.insert(codebaseSnapshots)
				.values({
					id: crypto.randomUUID(),
					codebaseId,
					syncSessionId: sessionId,
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
}
