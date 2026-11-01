// Typed failure envelope of the codebase analysis boundary, shared by the
// request entry and the starter-suggestion refresh claim.

import type { AnalysisRecoveryCode } from "./analysis-diagnostics";

export type AnalysisServiceCode =
	| "SNAPSHOT_NOT_UPLOADED"
	| "ANALYSIS_FAILED"
	| "ANALYSIS_REFRESH_NOT_ALLOWED";

export class AnalysisServiceError extends Error {
	readonly code: AnalysisServiceCode;
	/** Failed-attempt analysis row id (Task 9): lets the route attach the
	 *  exact failed attempt instead of the latest row, which under a
	 *  concurrent duplicate trigger could be the sibling's ready record. */
	readonly analysisId?: string;
	/** Canonical recovery code classified from the underlying failure, so the
	 *  route response carries the same vocabulary the row was persisted with. */
	readonly recoveryCode?: AnalysisRecoveryCode;

	constructor(
		code: AnalysisServiceCode,
		message: string,
		analysisId?: string,
		recoveryCode?: AnalysisRecoveryCode,
	) {
		super(message);
		this.name = "AnalysisServiceError";
		this.code = code;
		this.analysisId = analysisId;
		this.recoveryCode = recoveryCode;
	}
}
