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
import { codebaseAnalyses } from "@/db/schema";
import type { CreditOperationResult } from "@/lib/services/credit-service";
import {
	buildCodebaseMetrics,
	createCreditQuote,
	getCreditOperation,
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
import { ANALYSIS_ALLOWANCE_POLICY } from "./analysis-credit-policy";
import {
	analysisCreditBlockedResponse,
	getAnalysisCreditPreflight,
	readSyncCreditConsent,
} from "./analysis-credit-preflight.server";
import { buildAnalysisIdempotencyKey } from "./analysis-diagnostics";
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
		syncSessionId: string;
	};
	preflightOnly?: boolean;
	creditConsent?: unknown;
	refreshRequest: AnalysisRefreshRequest | null;
};

export async function runCodebaseAnalysisAttempt(
	input: AnalysisAttemptInput,
): Promise<Response> {
	const { userId, projectId, scope, snapshot, refreshRequest } = input;

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

	const creditStatus = await getAnalysisCreditPreflight(userId, {
		isInitial: !refreshRequest,
		consent:
			input.creditConsent ??
			(refreshRequest
				? undefined
				: await readSyncCreditConsent(
						userId,
						snapshot.syncSessionId,
						projectId,
					)),
	});
	if (input.preflightOnly)
		return Response.json({
			...creditStatus,
			estimatedCredits:
				creditStatus.maximumCredits === 0 ? 0 : quote.estimatedCredits,
			quote,
		});
	if (!creditStatus.canStart)
		return analysisCreditBlockedResponse(creditStatus);
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

	const idempotencyKey = buildAnalysisIdempotencyKey({
		projectId,
		snapshotId: snapshot.id,
		refreshAnalysisId:
			refreshRequest?.refreshStarterSuggestionsForAnalysisId ?? null,
	});

	let reservation: CreditOperationResult;
	let analysisId = claimedAnalysisId ?? crypto.randomUUID();
	try {
		const reserveInput = {
			userId,
			projectId,
			stage: "codebase" as const,
			operation: "codebase_analysis" as const,
			metrics,
			idempotencyKey,
			quote,
			analysisReference: analysisId,
			isExempt: creditStatus.billingExempt,
			initialAnalysisAllowance:
				!creditStatus.billingExempt &&
				creditStatus.code === "FREE_ALLOWANCE_AVAILABLE",
			expiresAt: new Date(
				Date.now() + ANALYSIS_ALLOWANCE_POLICY.reservationLifetimeMs,
			),
		};
		reservation = await reserveActiveCreditOperation(reserveInput);
		analysisId =
			reservation.analysisReference ?? claimedAnalysisId ?? crypto.randomUUID();
	} catch (err) {
		console.error("[codebase/analysis] reserveCreditOperation failed:", err);
		if (claimedAnalysisId) await failRefreshClaim(claimedAnalysisId);
		const current = await getAnalysisCreditPreflight(userId, {
			isInitial: !refreshRequest,
		});
		if (
			current.code !== "FREE_ALLOWANCE_AVAILABLE" &&
			current.code !== "CREDIT_REQUIRED"
		)
			return analysisCreditBlockedResponse(current);
		return Response.json(
			{
				error: "Analisis belum dapat dimulai. Coba lagi.",
				code: "ANALYSIS_UNAVAILABLE",
			},
			{ status: 503 },
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

		if (claimedAnalysisId) await failRefreshClaim(claimedAnalysisId);
		return Response.json(
			{
				error: "Analisis sedang berjalan. Tunggu hingga selesai.",
				code: "ANALYSIS_IN_PROGRESS",
			},
			{ status: 409 },
		);
	}

	try {
		const analysis = await requestCodebaseAnalysis(
			projectId,
			snapshot.id,
			{
				analysisId,
				settle: async (tx, analysisId) => {
					await settleCreditOperation(
						{
							userId,
							operationId: reservation.id,
							artifactId: analysisId,
							actualMetrics: metrics,
						},
						tx,
					);
				},
			},
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
			try {
				const current = await getCreditOperation({
					userId,
					operationId: reservation.id,
				});
				if (isReleasableReservation(current.state)) {
					await releaseCreditOperation({
						userId,
						operationId: reservation.id,
						reason: "Hasil analisis rusak",
					});
				}
			} catch (error: unknown) {
				console.error("[codebase/analysis] release failed", error);
			}
			return Response.json(
				{ error: "Hasil analisis rusak", code: "SYNC_FAILED" },
				{ status: 500 },
			);
		}
		return Response.json(response);
	} catch (error) {
		const failureReason =
			error instanceof Error ? error.message : "Analisis codebase gagal";
		try {
			// Re-read before cleanup: the state captured at reserve time is
			// stale once generation ran (a concurrent sweep may have settled,
			// released, or quarantined it). Only an operation that is still
			// unstarted is safe to release; anything else is reported, not
			// silently swallowed, so a terminal-state regression stays visible.
			const current = await getCreditOperation({
				userId,
				operationId: reservation.id,
			});
			if (isReleasableReservation(current.state)) {
				await releaseCreditOperation({
					userId,
					operationId: reservation.id,
					reason: failureReason,
				});
			} else {
				console.error(
					"[codebase/analysis] skip release: reservation already terminal",
					{ operationId: reservation.id, state: current.state },
				);
			}
		} catch (relErr) {
			console.error(
				"[codebase/analysis] releaseCreditOperation failed:",
				relErr,
			);
		}

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
					code: error.recoveryCode ?? "ANALYSIS_FAILED",
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
