import { CreditSubscriptionOriginError } from "@/features/billing/types/credit-contracts";
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
	// Credit lifecycle failures that abort persistence are triaged as
	// persistence, not provider: the model output existed, only finalization
	// failed, so the correct action is safe retry of finalization — not
	// treating the provider as down.
	if (
		error instanceof CreditSubscriptionOriginError ||
		/credit operation|reservation expired|credit subscription|subscription origin/i.test(
			message,
		)
	) {
		return "persistence";
	}
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

// === Canonical recovery codes (Phase 03 Section E) ===
// One vocabulary shared by the persisted `codebase_analyses.errorCode`, the
// route failure envelope, and the readiness projection. The frontend never
// renders these strings; it maps them to copy and actions.
export const ANALYSIS_RECOVERY_CODES = [
	"ANALYSIS_NOT_STARTED",
	"ANALYSIS_PENDING",
	"ANALYSIS_FAILED",
	"ANALYSIS_OUTPUT_INVALID",
	"CREDIT_REQUIRED",
	"PROVIDER_UNAVAILABLE",
	"SNAPSHOT_INCOMPLETE",
] as const;

export type AnalysisRecoveryCode = (typeof ANALYSIS_RECOVERY_CODES)[number];

const CATEGORY_RECOVERY_CODE: Readonly<
	Record<AnalysisFailureCategory, AnalysisRecoveryCode>
> = {
	provider: "PROVIDER_UNAVAILABLE",
	timeout: "PROVIDER_UNAVAILABLE",
	aborted: "PROVIDER_UNAVAILABLE",
	snapshot: "SNAPSHOT_INCOMPLETE",
	invalid_json: "ANALYSIS_OUTPUT_INVALID",
	schema: "ANALYSIS_OUTPUT_INVALID",
	untrusted_paths: "ANALYSIS_OUTPUT_INVALID",
	technical_leak: "ANALYSIS_OUTPUT_INVALID",
	persistence: "ANALYSIS_FAILED",
	unknown: "ANALYSIS_FAILED",
};

/** Map a classified failure category onto the public recovery vocabulary. */
export function toAnalysisRecoveryCode(
	category: AnalysisFailureCategory,
): AnalysisRecoveryCode {
	return CATEGORY_RECOVERY_CODE[category];
}

/** Classify a thrown attempt failure into the code stored on the failed row. */
export function classifyAnalysisAttemptCode(
	error: unknown,
	stage?: AnalysisAttemptStage,
): AnalysisRecoveryCode {
	return toAnalysisRecoveryCode(classifyAnalysisFailure(error, stage));
}

/** Unknown stored values are dropped so status polling never echoes garbage. */
export function isAnalysisRecoveryCode(
	value: unknown,
): value is AnalysisRecoveryCode {
	return (
		typeof value === "string" &&
		(ANALYSIS_RECOVERY_CODES as readonly string[]).includes(value)
	);
}

/**
 * Operation identity for one analysis attempt. Stable for the same
 * project + snapshot + refresh target, so a duplicate trigger (double click,
 * retry of a lost response) resolves to the same reservation instead of
 * charging twice, while a refresh of a different target stays a distinct,
 * explicitly-priced operation.
 */
export function buildAnalysisIdempotencyKey(input: {
	projectId: string;
	snapshotId: string;
	refreshAnalysisId?: string | null;
}): string {
	return `${input.projectId}:codebase_analysis:${input.snapshotId}:${input.refreshAnalysisId ?? "initial"}`;
}

export interface AnalysisDiagnosticRecord {
	attemptId: string;
	projectId: string;
	snapshotId: string;
	category: AnalysisFailureCategory;
	durationMs: number;
	creditOperationId?: string;
	operationState?: string;
	operationExpiresAt?: string;
	stage?: AnalysisAttemptStage;
	errorCode?: string;
	issuePaths?: readonly string[];
	rawLength?: number;
}

export function formatAnalysisDiagnosticLog(
	record: AnalysisDiagnosticRecord,
): Record<string, string | number | readonly string[]> {
	const errorCode =
		typeof record.errorCode === "string"
			? record.errorCode.slice(0, 80)
			: undefined;
	const shaped: Record<string, string | number | readonly string[]> = {
		attemptId: record.attemptId,
		projectId: record.projectId,
		snapshotId: record.snapshotId,
		category: record.category,
		durationMs: record.durationMs,
	};
	// Credit operation identity is safe internal metadata (ids + state +
	// expiry only): no CLI tokens, API keys, source content, or model
	// output ever enters this record.
	if (record.creditOperationId)
		shaped.creditOperationId = record.creditOperationId;
	if (record.operationState) shaped.operationState = record.operationState;
	if (record.operationExpiresAt)
		shaped.operationExpiresAt = record.operationExpiresAt;
	if (record.stage) shaped.stage = record.stage;
	if (errorCode) shaped.errorCode = errorCode;
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
