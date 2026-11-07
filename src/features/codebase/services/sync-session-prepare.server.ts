import { and, desc, eq, sql } from "drizzle-orm";
import type { db } from "@/db";
import { codebaseSnapshots, codebaseSyncSessions } from "@/db/schema";
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
			if (
				replaceSessionId !== latest.id ||
				uploaded ||
				snapshot ||
				(cliActive && usable)
			)
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
	if (recoveryOnly) throw new Error("No sync session exists for recovery");
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
	return { session, token };
}
