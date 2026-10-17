// Server-only credit lifecycle tail of the codebase analysis trigger.
//
// Split out of `analysis-route-trigger.server.ts` to stay under the file-size
// ceiling. The order is load-bearing and must not be reordered: subscription
// read → paused/insufficient gate → optional refresh claim → reserve → mark
// running → run the model → settle (success) or release (failure). Codebase
// analysis uses adaptive credits (new attempts are billed; ready analysis
// reuse is free and never reaches this module).

import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { codebaseAnalyses, subscriptions } from "@/db/schema";
import { resolveSubscriptionState } from "@/lib/billing";
import type { CreditOperationResult } from "@/lib/services/credit-service";
import {
	buildCodebaseMetrics,
	createCreditQuote,
	formatInsufficientCreditsError,
	formatSubscriptionPausedError,
	isReleasableReservation,
	markCreditOperationRunning,
	releaseCreditOperation,
	reserveActiveCreditOperation,
	settleCreditOperation,
} from "@/lib/services/credit-service";
import type { AnalysisScope } from "./analysis";
import {
	AnalysisServiceError,
	claimStarterSuggestionRefresh,
	requestCodebaseAnalysis,
} from "./analysis.server";
import type { AnalysisRefreshRequest } from "./analysis-refresh";
import { failRefreshClaim, toResponse } from "./analysis-route-scope.server";

type AnalysisAttemptInput = {
	userId: string;
	projectId: string;
	scope: AnalysisScope;
	snapshot: {
		id: string;
		status: string;
		fileCount: number;
		contentSize: number;
	};
	existingCount: number;
	refreshRequest: AnalysisRefreshRequest | null;
};

export async function runCodebaseAnalysisAttempt(
	input: AnalysisAttemptInput,
): Promise<Response> {
	const { userId, projectId, scope, snapshot, existingCount, refreshRequest } =
		input;

	const [sub] = await db
		.select({
			plan: subscriptions.plan,
			status: subscriptions.status,
			credits: subscriptions.credits,
			creditsUsed: subscriptions.creditsUsed,
			creditsReserved: subscriptions.creditsReserved,
			currentPeriodStart: subscriptions.currentPeriodStart,
			currentPeriodEnd: subscriptions.currentPeriodEnd,
			cancelledAt: subscriptions.cancelledAt,
		})
		.from(subscriptions)
		.where(eq(subscriptions.userId, userId))
		.orderBy(desc(subscriptions.createdAt))
		.limit(1);

	const eff = resolveSubscriptionState(sub, new Date());
	const availableCredits = Math.max(
		0,
		(sub?.credits ?? 0) - (sub?.creditsUsed ?? 0) - (sub?.creditsReserved ?? 0),
	);

	const metrics = buildCodebaseMetrics({
		fileCount: snapshot.fileCount,
		contentSize: snapshot.contentSize,
	});

	const quote = createCreditQuote({
		userId,
		projectId,
		stage: "codebase",
		operation: "codebase_analysis",
		metrics,
	});

	if (eff.state === "paused") {
		return Response.json(
			formatSubscriptionPausedError({
				quote,
				availableCredits,
				stageLabel: "analisis codebase",
			}),
			{ status: 403 },
		);
	}

	if (availableCredits < quote.maximumCredits) {
		return Response.json(
			formatInsufficientCreditsError({
				quote,
				availableCredits,
				stageLabel: "analisis codebase",
			}),
			{ status: 403 },
		);
	}
	let claimedAnalysisId: string | undefined;
	if (refreshRequest) {
		try {
			const refreshClaim = await claimStarterSuggestionRefresh({
				projectId,
				snapshotId: snapshot.id,
				targetAnalysisId: refreshRequest.refreshStarterSuggestionsForAnalysisId,
				scope:
					scope.kind === "codebase" ? { codebaseId: scope.codebaseId } : {},
			});
			if (refreshClaim.action === "reuse") {
				const [row] = await db
					.select()
					.from(codebaseAnalyses)
					.where(eq(codebaseAnalyses.id, refreshClaim.analysisId))
					.limit(1);
				const response = row ? toResponse(row) : null;
				return response
					? Response.json(response)
					: Response.json(
							{ error: "Hasil analisis rusak", code: "SYNC_FAILED" },
							{ status: 500 },
						);
			}
			claimedAnalysisId = refreshClaim.analysisId;
		} catch (error) {
			if (error instanceof AnalysisServiceError) {
				const snapshotUnavailable = error.code === "SNAPSHOT_NOT_UPLOADED";
				return Response.json(
					{
						error: error.message,
						code: snapshotUnavailable ? "SNAPSHOT_INCOMPLETE" : error.code,
					},
					{ status: 409 },
				);
			}
			throw error;
		}
	}

	const idempotencyKey = `${projectId}:codebase_analysis:${snapshot.id}:${existingCount + 1}`;

	let reservation: CreditOperationResult;
	try {
		// A reused key whose operation already terminated cannot
		// analyze again: mint a fresh attempt instead of running
		// the model for free (settled) or against a dead
		// reservation. Genuine in-flight retries keep joining.
		reservation = await reserveActiveCreditOperation({
			userId,
			projectId,
			stage: "codebase",
			operation: "codebase_analysis",
			metrics,
			idempotencyKey,
			quote,
		});
	} catch (err) {
		console.error("[codebase/analysis] reserveCreditOperation failed:", err);
		if (claimedAnalysisId) await failRefreshClaim(claimedAnalysisId);
		return Response.json(
			formatInsufficientCreditsError({
				quote,
				availableCredits,
				stageLabel: "analisis codebase",
			}),
			{ status: 403 },
		);
	}

	try {
		await markCreditOperationRunning({
			userId,
			operationId: reservation.id,
		});
	} catch (err) {
		// The reservation is not ours to run (a concurrent request
		// owns it, or it died): stop instead of analyzing against
		// it, and never release a running operation here.
		console.error(
			"[codebase/analysis] markCreditOperationRunning failed:",
			err,
		);
		if (isReleasableReservation(reservation.state)) {
			await releaseCreditOperation({
				userId,
				operationId: reservation.id,
				reason: "Analysis reservation not runnable",
			}).catch(() => {});
		}
		if (claimedAnalysisId) await failRefreshClaim(claimedAnalysisId);
		return Response.json(
			{ error: "Analisis sedang berjalan. Tunggu hingga selesai." },
			{ status: 409 },
		);
	}

	try {
		const analysis = await requestCodebaseAnalysis(
			projectId,
			snapshot.id,
			{},
			{
				...(scope.kind === "codebase" ? { codebaseId: scope.codebaseId } : {}),
				...(claimedAnalysisId ? { claimedAnalysisId } : {}),
			},
		);
		const [row] = await db
			.select()
			.from(codebaseAnalyses)
			.where(eq(codebaseAnalyses.id, analysis.id))
			.limit(1);
		const response = row ? toResponse(row) : null;
		if (!response || !analysis) {
			if (isReleasableReservation(reservation.state)) {
				await releaseCreditOperation({
					userId,
					operationId: reservation.id,
					reason: "Hasil analisis rusak",
				}).catch(() => {});
			}
			return Response.json(
				{ error: "Hasil analisis rusak", code: "SYNC_FAILED" },
				{ status: 500 },
			);
		}
		await settleCreditOperation({
			userId,
			operationId: reservation.id,
			artifactId: analysis.id,
			actualMetrics: metrics,
		});
		return Response.json(response);
	} catch (error) {
		const failureReason =
			error instanceof Error ? error.message : "Analisis codebase gagal";
		await releaseCreditOperation({
			userId,
			operationId: reservation.id,
			reason: failureReason,
		}).catch((relErr) => {
			console.error(
				"[codebase/analysis] releaseCreditOperation failed:",
				relErr,
			);
		});

		if (error instanceof AnalysisServiceError) {
			if (error.code === "SNAPSHOT_NOT_UPLOADED")
				return Response.json(
					{ error: error.message, code: "SNAPSHOT_INCOMPLETE" },
					{ status: 409 },
				);
			const [failed] = await db
				.select()
				.from(codebaseAnalyses)
				.where(
					and(
						eq(codebaseAnalyses.projectId, projectId),
						eq(codebaseAnalyses.snapshotId, snapshot.id),
						eq(codebaseAnalyses.status, "failed"),
					),
				)
				.orderBy(desc(codebaseAnalyses.createdAt))
				.limit(1);
			return Response.json(
				{
					error: error.message,
					code: "ANALYSIS_FAILED",
					// Prefer the exact failed attempt carried by the
					// service (Task 9): under a concurrent duplicate
					// trigger the latest row could be the sibling's
					// ready record. The failed-only query is fallback.
					analysisId: error.analysisId ?? failed?.id,
				},
				{ status: 502 },
			);
		}
		console.error("Codebase analysis trigger error:", error);
		return Response.json(
			{ error: "Analisis codebase gagal", code: "ANALYSIS_FAILED" },
			{ status: 502 },
		);
	}
}
