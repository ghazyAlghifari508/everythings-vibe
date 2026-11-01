import {
	SCRAPE_PREVIEW_EMPTY_GRACE_OBSERVATIONS,
	SCRAPE_PREVIEW_READY_MAX_PINGS,
} from "@/features/scrape/types/scrape-constants";

// Reports the framed snapshot sends back to the parent.
export type PreviewFrameReport =
	| "preparing"
	| "ready"
	| "empty"
	| "degraded"
	| "failed";

export interface PreviewReadinessState {
	report: PreviewFrameReport;
	// Consecutive "empty" reports seen so far. A single empty report is never
	// treated as the final answer: a page can still be assembling its layout, so
	// the state stays provisional until the grace window is exhausted.
	emptyObservations: number;
	// Total reports observed, used to bound polling without retrying forever.
	observations: number;
}

export const INITIAL_PREVIEW_READINESS: PreviewReadinessState = {
	report: "preparing",
	emptyObservations: 0,
	observations: 0,
};

// "ready" and "degraded" mean the document rendered something. "failed" means
// the document could not be read at all. Those are final.
function isContentReport(report: PreviewFrameReport): boolean {
	return report === "ready" || report === "degraded";
}

export function isFinalPreviewReport(state: PreviewReadinessState): boolean {
	if (isContentReport(state.report)) return true;
	if (state.report === "failed") return true;
	return (
		state.report === "empty" &&
		state.emptyObservations >= SCRAPE_PREVIEW_EMPTY_GRACE_OBSERVATIONS
	);
}

// Folds one frame report into the running state.
//
// A content report always wins and clears the empty streak, so a page that
// finishes late is never left showing a stale empty verdict. A preparing report
// also clears the streak because the document is actively changing. Only
// consecutive empty reports, enough of them to exhaust the grace window, settle
// the preview as genuinely empty.
export function reducePreviewReport(
	state: PreviewReadinessState,
	incoming: PreviewFrameReport,
): PreviewReadinessState {
	const observations = state.observations + 1;
	if (isContentReport(state.report) && !isContentReport(incoming))
		return { ...state, observations };
	if (isContentReport(incoming))
		return { report: incoming, emptyObservations: 0, observations };
	if (incoming === "failed")
		return { report: "failed", emptyObservations: 0, observations };
	if (incoming === "preparing")
		return { report: "preparing", emptyObservations: 0, observations };
	return {
		report: "empty",
		emptyObservations: state.emptyObservations + 1,
		observations,
	};
}

// Polling continues while the verdict is still open. It stops as soon as the
// verdict is final, or once the absolute observation budget is spent, so the
// parent can never ping forever.
export function previewShouldKeepPolling(
	state: PreviewReadinessState,
): boolean {
	if (isFinalPreviewReport(state)) return false;
	return state.observations < SCRAPE_PREVIEW_READY_MAX_PINGS;
}

// The frame answered at least once, so it is alive and merely slow. Its last
// report stands instead of being replaced by a fabricated failure.
export function previewFrameResponded(state: PreviewReadinessState): boolean {
	return state.observations > 0;
}

// The state the canvas renders. A provisional empty report is presented as
// "preparing", because the system has not yet proved the document is empty.
export function previewDisplayReport(
	state: PreviewReadinessState,
): PreviewFrameReport {
	if (state.report === "empty" && !isFinalPreviewReport(state))
		return "preparing";
	return state.report;
}
