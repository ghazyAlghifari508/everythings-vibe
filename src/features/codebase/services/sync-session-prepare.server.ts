import { and, desc, eq, sql } from "drizzle-orm";
import type { db } from "@/db";
import {
	codebaseSnapshots,
	codebaseSyncRequests,
	codebaseSyncSessions,
} from "@/db/schema";
import {
	CODEBASE_CLI_MIN_VERSION,
	CODEBASE_SYNC_SESSION_EXPIRY_MS,
} from "../types/codebase-constants";
import { getSessionUsability } from "./sync";
import { generateSyncToken, hashSyncToken } from "./sync.server";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export interface PreparedSyncSession {
	session: typeof codebaseSyncSessions.$inferSelect;
	token: string | null;
	/**
	 * The caller named a session that is no longer the latest one for this
	 * codebase (another tab or an earlier response already replaced it). The
	 * returned session is the authoritative current row and nothing was minted
	 * or revoked, so the browser can re-read state instead of reporting an error.
	 */
	stale?: boolean;
}

/** Recovery never mints; a codebase with no session is answered as 404. */
export const NO_SYNC_SESSION_FOR_RECOVERY = "NO_SYNC_SESSION_FOR_RECOVERY";

export async function expireUnusedSyncSession(
	tx: Transaction,
	session: typeof codebaseSyncSessions.$inferSelect,
): Promise<typeof codebaseSyncSessions.$inferSelect> {
	if (
		session.status !== "waiting_for_cli" ||
		session.expiresAt.getTime() > Date.now()
	)
		return session;
	await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${session.id}))`);
	const [expired] = await tx
		.update(codebaseSyncSessions)
		.set({ status: "expired", updatedAt: new Date() })
		.where(
			and(
				eq(codebaseSyncSessions.id, session.id),
				eq(codebaseSyncSessions.userId, session.userId),
				eq(codebaseSyncSessions.status, "waiting_for_cli"),
			),
		)
		.returning();
	if (expired) return expired;
	const [current] = await tx
		.select()
		.from(codebaseSyncSessions)
		.where(
			and(
				eq(codebaseSyncSessions.id, session.id),
				eq(codebaseSyncSessions.userId, session.userId),
			),
		)
		.limit(1);
	return current ?? session;
}

export async function prepareSyncSession(
	tx: Transaction,
	userId: string,
	codebaseId: string,
	replaceSessionId?: string,
	recoveryOnly = false,
): Promise<PreparedSyncSession> {
	await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${codebaseId}))`);
	let [latest] = await tx
		.select()
		.from(codebaseSyncSessions)
		.where(
			and(
				eq(codebaseSyncSessions.codebaseId, codebaseId),
				eq(codebaseSyncSessions.userId, userId),
			),
		)
		.orderBy(
			desc(codebaseSyncSessions.attempt),
			desc(codebaseSyncSessions.createdAt),
		)
		.limit(1);
	if (latest) {
		// Share the handshake lock, then reread: a CLI may connect while we wait.
		await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${latest.id}))`);
		[latest] = await tx
			.select()
			.from(codebaseSyncSessions)
			.where(
				and(
					eq(codebaseSyncSessions.id, latest.id),
					eq(codebaseSyncSessions.userId, userId),
				),
			)
			.limit(1);
	}
	if (latest) {
		latest = await expireUnusedSyncSession(tx, latest);
		if (recoveryOnly) return { session: latest, token: null };
		const uploaded = ["uploaded", "analyzing", "ready"].includes(latest.status);
		const cliActive = [
			"connected",
			"scanning",
			"filtering",
			"uploading",
		].includes(latest.status);
		const usable = getSessionUsability({
			...latest,
			projectId: codebaseId,
		}).usable;
		if (replaceSessionId) {
			// Stale identity: a newer session already replaced the one this tab
			// holds. Report the current row; never mint on behalf of an obsolete
			// request, and never revoke a session the caller did not name.
			if (replaceSessionId !== latest.id)
				return { session: latest, token: null, stale: true };
			const [snapshot] = await tx
				.select({ id: codebaseSnapshots.id })
				.from(codebaseSnapshots)
				.innerJoin(
					codebaseSyncSessions,
					eq(codebaseSnapshots.syncSessionId, codebaseSyncSessions.id),
				)
				.where(
					and(
						eq(codebaseSyncSessions.id, latest.id),
						eq(codebaseSyncSessions.userId, userId),
						sql`${codebaseSnapshots.status} in ('uploaded', 'ready')`,
					),
				)
				.limit(1);
			// An upload that already succeeded, or a CLI that is actively syncing,
			// must never lose its credential to a browser refresh. `cliActive` is
			// checked regardless of credential usability: a consumed or clock-
			// expired row can still belong to an in-flight agent, and silently
			// revoking it would abort real work.
			if (uploaded || snapshot || cliActive)
				return { session: latest, token: null };
			await tx
				.update(codebaseSyncSessions)
				.set({
					status: "expired",
					consumedAt: new Date(),
					updatedAt: new Date(),
				})
				.where(
					and(
						eq(codebaseSyncSessions.id, latest.id),
						eq(codebaseSyncSessions.userId, userId),
					),
				);
		} else if (usable) return { session: latest, token: null };
	}
	if (recoveryOnly) throw new Error(NO_SYNC_SESSION_FOR_RECOVERY);
	const id = crypto.randomUUID();
	const token = generateSyncToken();
	const [session] = await tx
		.insert(codebaseSyncSessions)
		.values({
			id,
			codebaseId,
			userId,
			credentialHash: hashSyncToken(token),
			status: "waiting_for_cli",
			expiresAt: new Date(Date.now() + CODEBASE_SYNC_SESSION_EXPIRY_MS),
			cliMinVersion: CODEBASE_CLI_MIN_VERSION,
			attempt: (latest?.attempt ?? 0) + 1,
		})
		.returning();
	if (!session) throw new Error("Sync session insert returned no row");
	if (replaceSessionId && latest?.id === replaceSessionId) {
		await tx
			.update(codebaseSyncRequests)
			.set({ sessionId: session.id })
			.where(
				and(
					eq(codebaseSyncRequests.sessionId, replaceSessionId),
					eq(codebaseSyncRequests.codebaseId, codebaseId),
					eq(codebaseSyncRequests.userId, userId),
				),
			);
	}
	return { session, token };
}
