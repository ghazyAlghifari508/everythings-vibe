import { describe, expect, it } from "vitest";
import {
	ANALYSIS_RECOVERY_CODES,
	AnalysisValidationError,
	classifyAnalysisAttemptCode,
	isAnalysisRecoveryCode,
	toAnalysisRecoveryCode,
} from "@/features/codebase/services/analysis";
import { AnalysisServiceError } from "@/features/codebase/services/analysis-server-errors";
import { sanitizeSyncErrorCode } from "@/features/codebase/services/sync";
import { resolveAnalysisRecoveryCode } from "@/features/codebase/services/workspace-readiness";

describe("analysis recovery codes (p3 Section E)", () => {
	it("exposes exactly the required vocabulary", () => {
		expect([...ANALYSIS_RECOVERY_CODES]).toEqual([
			"ANALYSIS_NOT_STARTED",
			"ANALYSIS_PENDING",
			"ANALYSIS_FAILED",
			"ANALYSIS_OUTPUT_INVALID",
			"CREDIT_REQUIRED",
			"PROVIDER_UNAVAILABLE",
			"SNAPSHOT_INCOMPLETE",
		]);
	});

	it("maps every failure category onto the vocabulary", () => {
		expect(toAnalysisRecoveryCode("provider")).toBe("PROVIDER_UNAVAILABLE");
		expect(toAnalysisRecoveryCode("timeout")).toBe("PROVIDER_UNAVAILABLE");
		expect(toAnalysisRecoveryCode("aborted")).toBe("PROVIDER_UNAVAILABLE");
		expect(toAnalysisRecoveryCode("schema")).toBe("ANALYSIS_OUTPUT_INVALID");
		expect(toAnalysisRecoveryCode("invalid_json")).toBe(
			"ANALYSIS_OUTPUT_INVALID",
		);
		expect(toAnalysisRecoveryCode("untrusted_paths")).toBe(
			"ANALYSIS_OUTPUT_INVALID",
		);
		expect(toAnalysisRecoveryCode("technical_leak")).toBe(
			"ANALYSIS_OUTPUT_INVALID",
		);
		expect(toAnalysisRecoveryCode("snapshot")).toBe("SNAPSHOT_INCOMPLETE");
		expect(toAnalysisRecoveryCode("persistence")).toBe("ANALYSIS_FAILED");
		expect(toAnalysisRecoveryCode("unknown")).toBe("ANALYSIS_FAILED");
	});

	it("classifies thrown attempt failures, never conflating provider and billing", () => {
		expect(
			classifyAnalysisAttemptCode(
				new AnalysisValidationError({ reason: "schema", rawLength: 12 }),
			),
		).toBe("ANALYSIS_OUTPUT_INVALID");
		expect(
			classifyAnalysisAttemptCode(
				new AnalysisValidationError({ reason: "invalid_json", rawLength: 3 }),
			),
		).toBe("ANALYSIS_OUTPUT_INVALID");
		expect(classifyAnalysisAttemptCode(new Error("Model provider 502"))).toBe(
			"PROVIDER_UNAVAILABLE",
		);
		expect(classifyAnalysisAttemptCode(new Error("request timeout"))).toBe(
			"PROVIDER_UNAVAILABLE",
		);
		expect(
			classifyAnalysisAttemptCode(new Error("The operation aborted")),
		).toBe("PROVIDER_UNAVAILABLE");
		expect(
			classifyAnalysisAttemptCode(
				new AnalysisServiceError(
					"SNAPSHOT_NOT_UPLOADED",
					"Snapshot belum siap dianalisis.",
				),
			),
		).toBe("SNAPSHOT_INCOMPLETE");
		expect(classifyAnalysisAttemptCode(new Error("unexpected"))).toBe(
			"ANALYSIS_FAILED",
		);
	});

	it("rejects unknown stored values instead of echoing them", () => {
		expect(isAnalysisRecoveryCode("PROVIDER_UNAVAILABLE")).toBe(true);
		expect(isAnalysisRecoveryCode("ANALYSIS_OUTPUT_INVALID")).toBe(true);
		expect(isAnalysisRecoveryCode("CREDIT_REQUIRED")).toBe(true);
		expect(isAnalysisRecoveryCode("SOMETHING_ELSE")).toBe(false);
		expect(isAnalysisRecoveryCode(null)).toBe(false);
	});

	it("keeps the new persisted codes readable through the status sanitizer", () => {
		expect(sanitizeSyncErrorCode("PROVIDER_UNAVAILABLE")).toBe(
			"PROVIDER_UNAVAILABLE",
		);
		expect(sanitizeSyncErrorCode("ANALYSIS_OUTPUT_INVALID")).toBe(
			"ANALYSIS_OUTPUT_INVALID",
		);
		expect(sanitizeSyncErrorCode("ANALYSIS_FAILED")).toBe("ANALYSIS_FAILED");
	});
});

describe("analysis recovery projection (p3 Sections A and F)", () => {
	it("reports a missing snapshot as SNAPSHOT_INCOMPLETE", () => {
		expect(
			resolveAnalysisRecoveryCode({
				snapshotReady: false,
				attemptStatus: null,
			}),
		).toBe("SNAPSHOT_INCOMPLETE");
	});

	it("reports not started, pending, and failed distinctly", () => {
		expect(
			resolveAnalysisRecoveryCode({ snapshotReady: true, attemptStatus: null }),
		).toBe("ANALYSIS_NOT_STARTED");
		expect(
			resolveAnalysisRecoveryCode({
				snapshotReady: true,
				attemptStatus: "pending",
			}),
		).toBe("ANALYSIS_PENDING");
		expect(
			resolveAnalysisRecoveryCode({
				snapshotReady: true,
				attemptStatus: "failed",
				errorCode: "PROVIDER_UNAVAILABLE",
			}),
		).toBe("PROVIDER_UNAVAILABLE");
		expect(
			resolveAnalysisRecoveryCode({
				snapshotReady: true,
				attemptStatus: "failed",
				errorCode: "ANALYSIS_OUTPUT_INVALID",
			}),
		).toBe("ANALYSIS_OUTPUT_INVALID");
		expect(
			resolveAnalysisRecoveryCode({
				snapshotReady: true,
				attemptStatus: "failed",
				errorCode: "ANALYSIS_FAILED",
			}),
		).toBe("ANALYSIS_FAILED");
	});

	it("reports a billing block as CREDIT_REQUIRED, never as a running analysis", () => {
		expect(
			resolveAnalysisRecoveryCode({
				snapshotReady: true,
				attemptStatus: null,
				creditBlocked: true,
			}),
		).toBe("CREDIT_REQUIRED");
	});

	it("returns null once a usable ready result exists, even after a newer failure", () => {
		expect(
			resolveAnalysisRecoveryCode({
				snapshotReady: true,
				attemptStatus: "failed",
				analysisReady: true,
				errorCode: "PROVIDER_UNAVAILABLE",
			}),
		).toBeNull();
		expect(
			resolveAnalysisRecoveryCode({
				snapshotReady: true,
				attemptStatus: "ready",
			}),
		).toBeNull();
	});
});
