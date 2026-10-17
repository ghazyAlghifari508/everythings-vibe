import { AnalysisValidationError } from "./analysis-validation";

// Fixed user-facing message. Never echoes model text, stack traces, tokens,
// or source content — the caller stores only this string.
export function toSafeAnalysisErrorMessage(error: unknown): string {
	void error;
	return "Analisis codebase gagal. Coba analisis ulang dalam beberapa menit.";
}

// === Server-side failure diagnostics ===
// Operators need to know WHY an attempt failed (provider, timeout, malformed
// JSON, schema mismatch, invented paths, persistence), while users must only
// ever see the fixed safe message above. These helpers classify the failure
// and shape a log record that carries an attempt identifier, the category,
// the actual duration, and validation issue paths — never API keys, sync
// tokens, repository content, or unrestricted model output.
export const ANALYSIS_FAILURE_CATEGORIES = [
	"provider",
	"timeout",
	"aborted",
	"snapshot",
	"invalid_json",
	"schema",
	"untrusted_paths",
	"technical_leak",
	"persistence",
	"unknown",
] as const;

export type AnalysisFailureCategory =
	(typeof ANALYSIS_FAILURE_CATEGORIES)[number];

export type AnalysisAttemptStage = "generate" | "persist";

function readServiceErrorCode(error: unknown): string | null {
	if (!(error instanceof Error)) return null;
	if (error.name !== "AnalysisServiceError") return null;
	if (!("code" in error)) return null;
	const code: unknown = error.code;
	return typeof code === "string" ? code : null;
}

export function classifyAnalysisFailure(
	error: unknown,
	stage?: AnalysisAttemptStage,
): AnalysisFailureCategory {
	if (error instanceof AnalysisValidationError) return error.reason;
	if (readServiceErrorCode(error) === "SNAPSHOT_NOT_UPLOADED") {
		return "snapshot";
	}
	const message = error instanceof Error ? error.message : String(error);
	if (/aborted|aborterror/i.test(message)) return "aborted";
	if (
		/tidak merespons dalam 2 menit|melebihi batas waktu|timeout|timed out|etimedout|stall/i.test(
			message,
		)
	) {
		return "timeout";
	}
	if (
		/tidak tersedia|rate.?limit|too many requests|429|401|403|unauthorized|unauthenticated|api key|model|provider|respons kosong|fetch failed|econn|network|socket/i.test(
			message,
		)
	) {
		return "provider";
	}
	if (stage === "persist") return "persistence";
	return "unknown";
}

export interface AnalysisDiagnosticRecord {
	attemptId: string;
	projectId: string;
	snapshotId: string;
	category: AnalysisFailureCategory;
	durationMs: number;
	issuePaths?: readonly string[];
	rawLength?: number;
}

export function formatAnalysisDiagnosticLog(
	record: AnalysisDiagnosticRecord,
): Record<string, string | number | readonly string[]> {
	const shaped: Record<string, string | number | readonly string[]> = {
		attemptId: record.attemptId,
		projectId: record.projectId,
		snapshotId: record.snapshotId,
		category: record.category,
		durationMs: record.durationMs,
	};
	if (record.issuePaths && record.issuePaths.length > 0) {
		shaped.issuePaths = record.issuePaths;
	}
	if (typeof record.rawLength === "number") {
		shaped.rawLength = record.rawLength;
	}
	return shaped;
}

// === Idempotent trigger decision (pure, DB-agnostic) ===
// The route loads the snapshot row + its analysis rows, then applies this
// decision: analysis runs ONLY on uploaded snapshots; a pending or ready
// record is reused; each new attempt after failure gets a fresh record.

export type AnalysisRequestDecision =
	| { action: "create" }
	| { action: "reuse"; analysisId: string }
	| { action: "reject"; code: "SNAPSHOT_NOT_UPLOADED"; message: string };

export function decideAnalysisRequest(
	snapshot: { id: string; status: string },
	analyses: readonly { id: string; status: string }[],
): AnalysisRequestDecision {
	if (snapshot.status !== "uploaded") {
		return {
			action: "reject",
			code: "SNAPSHOT_NOT_UPLOADED",
			message:
				"Snapshot belum siap dianalisis. Selesaikan sync terlebih dahulu.",
		};
	}
	const pending = analyses.find((analysis) => analysis.status === "pending");
	if (pending) return { action: "reuse", analysisId: pending.id };
	const ready = analyses.find((analysis) => analysis.status === "ready");
	if (ready) return { action: "reuse", analysisId: ready.id };
	return { action: "create" };
}
