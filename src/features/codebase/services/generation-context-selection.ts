// === Ready-analysis selection (pure, DB-agnostic) ===
// Generation consumes the latest ready analysis only. Missing, pending, or
// failed analyses are rejected (null) — a failed snapshot is never exposed
// as ready context.

export interface ReadyAnalysisCandidate {
	id: string;
	status: string;
	createdAt: string;
}

export function selectReadyAnalysis<T extends ReadyAnalysisCandidate>(
	analyses: readonly T[],
): T | null {
	const ready = [...analyses]
		.filter((analysis) => analysis.status === "ready")
		.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
	return ready[0] ?? null;
}

export interface SelectableAnalysis {
	id: string;
	status: string;
	createdAt: string;
}

/** The newest analysis that actually succeeded. A project may accumulate failed
 *  attempts before one succeeds, so "newest ready" is required rather than "any
 *  ready" — otherwise a retry after a failure would keep resolving to the older
 *  successful record. */
export function selectNewestReadyAnalysis<T extends SelectableAnalysis>(
	analyses: readonly T[],
): T | null {
	const ready = analyses
		.filter((analysis) => analysis.status === "ready")
		.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
	return ready[0] ?? null;
}
