// Analysis projection for `/api/codebases/$codebaseId/status`.
//
// Split out of the status handler so both files stay small. Everything here is
// scoped by (snapshotId, projectId) and returns only server-written codes and
// sanitized messages — analysis internals never leak through status polling.
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { codebaseAnalyses } from "@/db/schema";
import { selectNewestReadyAnalysis } from "./generation-context";
import { sanitizeSyncErrorCode, sanitizeSyncErrorMessage } from "./sync";

/** Stored statuses are writer-controlled; anything else is dropped. */
export type SyncAnalysisAttemptStatus = "pending" | "ready" | "failed";

export interface SyncStatusAnalysisProjection {
	analysisId: string | null;
	analysisStatus: "ready" | undefined;
	analysisAttemptId: string | null;
	analysisAttemptStatus: SyncAnalysisAttemptStatus | undefined;
	analysisAttemptCreatedAt: string | undefined;
	analysisAttemptUpdatedAt: string | undefined;
	errorCode: string | null;
	errorMessage: string | null;
}

/** Real timestamps only — an absent value stays absent instead of being faked. */
export function toIsoOrUndefined(
	value: Date | null | undefined,
): string | undefined {
	return value ? value.toISOString() : undefined;
}

export async function readSyncStatusAnalysis(input: {
	snapshotId: string | null;
	projectId: string | null;
	errorCode: string | null;
	errorMessage: string | null;
}): Promise<SyncStatusAnalysisProjection> {
	let errorCode = input.errorCode;
	let errorMessage = input.errorMessage;
	let analysisId: string | null = null;
	let analysisStatus: "ready" | undefined;
	let analysisAttemptId: string | null = null;
	let analysisAttemptStatus: SyncAnalysisAttemptStatus | undefined;
	let analysisAttemptCreatedAt: string | undefined;
	let analysisAttemptUpdatedAt: string | undefined;

	if (input.snapshotId && input.projectId) {
		const attempts = await db
			.select({
				id: codebaseAnalyses.id,
				status: codebaseAnalyses.status,
				createdAt: codebaseAnalyses.createdAt,
				updatedAt: codebaseAnalyses.updatedAt,
				errorCode: codebaseAnalyses.errorCode,
				errorMessage: codebaseAnalyses.errorMessage,
			})
			.from(codebaseAnalyses)
			.where(
				and(
					eq(codebaseAnalyses.snapshotId, input.snapshotId),
					eq(codebaseAnalyses.projectId, input.projectId),
				),
			)
			.orderBy(desc(codebaseAnalyses.createdAt));

		// The newest attempt is reported on its own so a failed or still-running
		// retry stays visible, while the workspace keeps serving the newest ready
		// analysis for this exact snapshot instead of losing it to that newer
		// attempt.
		const latest = attempts[0];
		if (latest) {
			analysisAttemptId = latest.id;
			analysisAttemptCreatedAt = toIsoOrUndefined(latest.createdAt);
			analysisAttemptUpdatedAt = toIsoOrUndefined(latest.updatedAt);
			analysisAttemptStatus =
				latest.status === "pending" ||
				latest.status === "ready" ||
				latest.status === "failed"
					? latest.status
					: undefined;
			// Server-written codes only; unknown values collapse so analysis
			// internals never leak through status polling.
			if (latest.errorCode) {
				errorCode = sanitizeSyncErrorCode(latest.errorCode);
			}
			// Analysis writers must store only safe user-facing strings; this
			// sanitizer is defense-in-depth so tokens or source content can never
			// pass through.
			errorMessage = sanitizeSyncErrorMessage(latest.errorMessage);
		}

		const usable = selectNewestReadyAnalysis(
			attempts.map((attempt) => ({
				id: attempt.id,
				status: attempt.status,
				createdAt: attempt.createdAt?.toISOString() ?? "",
			})),
		);
		if (usable) {
			analysisId = usable.id;
			analysisStatus = "ready";
		}
	}

	return {
		analysisId,
		analysisStatus,
		analysisAttemptId,
		analysisAttemptStatus,
		analysisAttemptCreatedAt,
		analysisAttemptUpdatedAt,
		errorCode,
		errorMessage,
	};
}
