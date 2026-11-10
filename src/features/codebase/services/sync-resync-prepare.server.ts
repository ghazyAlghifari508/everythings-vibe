import { and, desc, eq, sql } from "drizzle-orm";
import type { db } from "@/db";
import {
	codebaseAnalyses,
	codebaseSnapshots,
	codebaseSyncRequests,
	codebaseSyncSessions,
	codebases,
	projects,
} from "@/db/schema";
import {
	CODEBASE_CLI_MIN_VERSION,
	CODEBASE_SYNC_SESSION_EXPIRY_MS,
} from "../types/codebase-constants";
import { selectWorkspaceAnalysis } from "./analysis-selection";
import { generateSyncToken, hashSyncToken } from "./sync.server";
import {
	expireUnusedSyncSession,
	type PreparedSyncSession,
} from "./sync-session-prepare.server";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function prepareResyncSession(
	tx: Transaction,
	userId: string,
	codebaseId: string,
	requestId: string,
	canCreate = true,
): Promise<PreparedSyncSession> {
	await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${codebaseId}))`);
	const [codebase] = await tx
		.select()
		.from(codebases)
		.where(and(eq(codebases.id, codebaseId), eq(codebases.userId, userId)))
		.limit(1);
	if (!codebase) throw new Error("CODEBASE_NOT_FOUND");
	const id = hashSyncToken(
		JSON.stringify([userId, codebaseId, "resync", requestId]),
	);
	const [replay] = await tx
		.select({ session: codebaseSyncSessions })
		.from(codebaseSyncRequests)
		.innerJoin(
			codebaseSyncSessions,
			eq(codebaseSyncRequests.sessionId, codebaseSyncSessions.id),
		)
		.where(
			and(
				eq(codebaseSyncRequests.id, id),
				eq(codebaseSyncRequests.userId, userId),
				eq(codebaseSyncRequests.codebaseId, codebaseId),
				eq(codebaseSyncSessions.userId, userId),
			),
		)
		.limit(1);
	if (replay)
		return {
			session: await expireUnusedSyncSession(tx, replay.session),
			token: null,
		};

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
		// Handshake uses this same lock; reread after acquiring it.
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
		if (latest) latest = await expireUnusedSyncSession(tx, latest);
	}
	let finished =
		!latest || ["ready", "failed", "expired"].includes(latest.status);
	if (latest && ["uploaded", "analyzing"].includes(latest.status)) {
		const rows = await tx
			.select({ analysis: codebaseAnalyses })
			.from(codebaseAnalyses)
			.innerJoin(
				codebaseSnapshots,
				eq(codebaseSnapshots.id, codebaseAnalyses.snapshotId),
			)
			.innerJoin(projects, eq(projects.id, codebaseAnalyses.projectId))
			.where(
				and(
					eq(codebaseSnapshots.syncSessionId, latest.id),
					eq(codebaseSnapshots.codebaseId, codebaseId),
					eq(projects.userId, userId),
					eq(projects.id, codebase.onboardingProjectId ?? ""),
				),
			)
			.orderBy(desc(codebaseAnalyses.createdAt));
		const newest = rows[0]?.analysis;
		finished =
			newest?.status !== "pending" &&
			(newest?.status === "failed" ||
				Boolean(
					newest &&
						selectWorkspaceAnalysis(
							rows.map((row) => row.analysis),
							{ projectId: newest.projectId, snapshotId: newest.snapshotId },
						).selected,
				));
	}
	if (latest && !finished) {
		await tx
			.insert(codebaseSyncRequests)
			.values({ id, userId, codebaseId, sessionId: latest.id });
		return { session: latest, token: null };
	}
	if (!canCreate) throw new Error("SYNC_CREDIT_REQUIRED");
	const token = generateSyncToken();
	const [session] = await tx
		.insert(codebaseSyncSessions)
		.values({
			id: crypto.randomUUID(),
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
	await tx
		.insert(codebaseSyncRequests)
		.values({ id, userId, codebaseId, sessionId: session.id });
	return { session, token };
}
