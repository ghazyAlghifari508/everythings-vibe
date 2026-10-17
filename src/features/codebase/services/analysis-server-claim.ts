// Starter-suggestion refresh claim: the request-boundary guard that decides
// create/reuse for one refresh under a shared advisory lock.

import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
	codebaseAnalyses,
	codebaseSnapshots,
	codebaseSyncSessions,
} from "@/db/schema";
import { decideStarterSuggestionRefresh } from "./analysis-refresh";
import { AnalysisServiceError } from "./analysis-server-errors";

/** Request scope consumed by both this claim and the analysis entry. */
export interface RequestAnalysisScope {
	codebaseId?: string;
	claimedAnalysisId?: string;
}

export type StarterSuggestionRefreshClaim =
	| { action: "create"; analysisId: string }
	| { action: "reuse"; analysisId: string };

export async function claimStarterSuggestionRefresh(input: {
	projectId: string;
	snapshotId: string;
	targetAnalysisId: string;
	scope: RequestAnalysisScope;
}): Promise<StarterSuggestionRefreshClaim> {
	return db.transaction(async (tx) => {
		const lockId = `${input.scope.codebaseId ?? input.projectId}:${input.projectId}:${input.snapshotId}`;
		await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${lockId}))`);
		const [snapshot] = await tx
			.select({
				id: codebaseSnapshots.id,
				status: codebaseSnapshots.status,
				syncSessionId: codebaseSnapshots.syncSessionId,
			})
			.from(codebaseSnapshots)
			.where(
				and(
					eq(codebaseSnapshots.id, input.snapshotId),
					input.scope.codebaseId
						? eq(codebaseSnapshots.codebaseId, input.scope.codebaseId)
						: eq(codebaseSnapshots.projectId, input.projectId),
				),
			)
			.limit(1);
		const [session] = snapshot
			? await tx
					.select({
						id: codebaseSyncSessions.id,
						status: codebaseSyncSessions.status,
					})
					.from(codebaseSyncSessions)
					.where(
						and(
							eq(codebaseSyncSessions.id, snapshot.syncSessionId),
							input.scope.codebaseId
								? eq(codebaseSyncSessions.codebaseId, input.scope.codebaseId)
								: eq(codebaseSyncSessions.projectId, input.projectId),
						),
					)
					.limit(1)
			: [];
		if (snapshot?.status !== "uploaded" || session?.status !== "uploaded") {
			throw new AnalysisServiceError(
				"SNAPSHOT_NOT_UPLOADED",
				"Snapshot belum siap dianalisis. Selesaikan sync terlebih dahulu.",
			);
		}

		const analyses = await tx
			.select()
			.from(codebaseAnalyses)
			.where(
				and(
					eq(codebaseAnalyses.projectId, input.projectId),
					eq(codebaseAnalyses.snapshotId, input.snapshotId),
				),
			)
			.orderBy(asc(codebaseAnalyses.createdAt));
		const target = analyses.find(
			(analysis) => analysis.id === input.targetAnalysisId,
		);
		const decision = decideStarterSuggestionRefresh({
			projectId: input.projectId,
			snapshotId: input.snapshotId,
			targetAnalysisId: input.targetAnalysisId,
			snapshotStatus: snapshot.status,
			target: target ?? null,
			analyses,
		});
		if (decision.action === "reject") {
			if (decision.reason === "snapshot_not_uploaded") {
				throw new AnalysisServiceError(
					"SNAPSHOT_NOT_UPLOADED",
					"Snapshot belum siap dianalisis. Selesaikan sync terlebih dahulu.",
				);
			}
			throw new AnalysisServiceError(
				"ANALYSIS_REFRESH_NOT_ALLOWED",
				"Starter suggestions cannot be refreshed for this analysis.",
			);
		}
		if (decision.action === "reuse") {
			return { action: "reuse", analysisId: decision.analysisId };
		}

		const analysisId = crypto.randomUUID();
		await tx.insert(codebaseAnalyses).values({
			id: analysisId,
			projectId: input.projectId,
			snapshotId: input.snapshotId,
			status: "pending",
		});
		return { action: "create", analysisId };
	});
}
