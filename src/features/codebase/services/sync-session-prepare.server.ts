import { and, desc, eq, sql } from "drizzle-orm";
import type { db } from "@/db";
import { codebaseSyncSessions } from "@/db/schema";
import {
	CODEBASE_CLI_MIN_VERSION,
	CODEBASE_SYNC_SESSION_EXPIRY_MS,
} from "../types/codebase-constants";
import { getSessionUsability } from "./sync";
import { deriveSyncToken, hashSyncToken } from "./sync.server";

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
): Promise<PreparedSyncSession> {
	await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${codebaseId}))`);
	const rows = await tx
		.select()
		.from(codebaseSyncSessions)
		.where(
			and(
				eq(codebaseSyncSessions.codebaseId, codebaseId),
				eq(codebaseSyncSessions.userId, userId),
			),
		)
		.orderBy(desc(codebaseSyncSessions.createdAt));
	const active = rows.find(
		(row) => getSessionUsability({ ...row, projectId: codebaseId }).usable,
	);
	if (active) {
		if (replaceSessionId === active.id) {
			await tx
				.update(codebaseSyncSessions)
				.set({
					status: "expired",
					consumedAt: new Date(),
					updatedAt: new Date(),
				})
				.where(
					and(
						eq(codebaseSyncSessions.id, active.id),
						eq(codebaseSyncSessions.userId, userId),
					),
				);
		} else {
			const token = deriveSyncToken(userId, active.id);
			if (hashSyncToken(token) === active.credentialHash)
				return { session: active, token };
			// Legacy random credentials cannot be recovered; never interrupt an uploading CLI.
			if (active.status !== "waiting_for_cli")
				return { session: active, token: null };
			await tx
				.update(codebaseSyncSessions)
				.set({
					status: "expired",
					consumedAt: new Date(),
					updatedAt: new Date(),
				})
				.where(
					and(
						eq(codebaseSyncSessions.id, active.id),
						eq(codebaseSyncSessions.userId, userId),
					),
				);
		}
	}
	const id = crypto.randomUUID();
	const token = deriveSyncToken(userId, id);
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
			attempt: rows.length + 1,
		})
		.returning();
	if (!session) throw new Error("Sync session insert returned no row");
	return { session, token };
}
