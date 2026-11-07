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
	recoveryOnly = false,
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
	const latest = rows[0];
	if (recoveryOnly && latest) {
		// Recovery never mutates: it returns the attempt the browser must resume.
		// A completed upload has nothing left to authorize, and any credential a
		// waiting agent may already hold must not be rotated behind its back.
		const completed = ["uploaded", "analyzing", "ready"].includes(
			latest.status,
		);
		const token = deriveSyncToken(userId, latest.id);
		const recoverable =
			latest.status === "waiting_for_cli" &&
			getSessionUsability({ ...latest, projectId: codebaseId }).usable &&
			hashSyncToken(token) === latest.credentialHash;
		return {
			session: latest,
			token: completed || !recoverable ? null : token,
		};
	}
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
			// An unrecoverable credential may already be held by an agent.
			if (recoveryOnly || active.status !== "waiting_for_cli")
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
