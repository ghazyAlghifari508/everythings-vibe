import assert from "node:assert/strict";
import { test } from "vitest";
import {
	AnalysisServiceError,
	analysisFailureHttpStatus,
} from "../services/analysis-server-errors";

test("502 is reserved for upstream analysis failures, not persistence or unknown exceptions", () => {
	assert.equal(
		analysisFailureHttpStatus(new Error("database unavailable")),
		500,
	);
	assert.equal(
		analysisFailureHttpStatus(
			new AnalysisServiceError(
				"ANALYSIS_FAILED",
				"safe",
				"attempt",
				"ANALYSIS_FAILED",
			),
		),
		500,
	);
	assert.equal(
		analysisFailureHttpStatus(
			new AnalysisServiceError(
				"ANALYSIS_FAILED",
				"safe",
				"attempt",
				"PROVIDER_UNAVAILABLE",
			),
		),
		502,
	);
	assert.equal(
		analysisFailureHttpStatus(
			new AnalysisServiceError(
				"ANALYSIS_FAILED",
				"safe",
				"attempt",
				"ANALYSIS_OUTPUT_INVALID",
			),
		),
		502,
	);
	assert.equal(
		analysisFailureHttpStatus(
			new AnalysisServiceError("SNAPSHOT_NOT_UPLOADED", "safe"),
		),
		409,
	);
});
