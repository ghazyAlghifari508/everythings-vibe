import { describe, expect, it } from "vitest";
import { SCRAPE_PREVIEW_EMPTY_GRACE_OBSERVATIONS } from "@/lib/constants";
import {
	INITIAL_PREVIEW_READINESS,
	type PreviewFrameReport,
	type PreviewReadinessState,
	previewDisplayReport,
	previewFrameResponded,
	previewShouldKeepPolling,
	reducePreviewReport,
} from "./preview-readiness";

function fold(reports: PreviewFrameReport[]): PreviewReadinessState {
	return reports.reduce(reducePreviewReport, INITIAL_PREVIEW_READINESS);
}

function repeat(
	report: PreviewFrameReport,
	times: number,
): PreviewFrameReport[] {
	return Array.from({ length: times }, () => report);
}

describe("preview readiness transitions", () => {
	it("starts open so the first frame is never shown as empty", () => {
		expect(INITIAL_PREVIEW_READINESS.report).toBe("preparing");
		expect(previewShouldKeepPolling(INITIAL_PREVIEW_READINESS)).toBe(true);
	});

	it("treats a single empty report as provisional, not as the verdict", () => {
		const state = fold(["empty"]);
		expect(state.report).toBe("empty");
		expect(previewDisplayReport(state)).toBe("preparing");
		expect(previewShouldKeepPolling(state)).toBe(true);
	});

	it("settles as empty only after the grace window is exhausted", () => {
		const provisional = fold(
			repeat("empty", SCRAPE_PREVIEW_EMPTY_GRACE_OBSERVATIONS - 1),
		);
		expect(previewDisplayReport(provisional)).toBe("preparing");
		expect(previewShouldKeepPolling(provisional)).toBe(true);

		const settled = fold(
			repeat("empty", SCRAPE_PREVIEW_EMPTY_GRACE_OBSERVATIONS),
		);
		expect(previewDisplayReport(settled)).toBe("empty");
		expect(previewShouldKeepPolling(settled)).toBe(false);
	});

	it("upgrades a provisional empty to ready when content renders late", () => {
		const state = fold(["empty", "empty", "ready"]);
		expect(state.report).toBe("ready");
		expect(previewDisplayReport(state)).toBe("ready");
		expect(previewShouldKeepPolling(state)).toBe(false);
	});

	it("upgrades a provisional empty to degraded when resources failed", () => {
		const state = fold(["empty", "degraded"]);
		expect(previewDisplayReport(state)).toBe("degraded");
		expect(previewShouldKeepPolling(state)).toBe(false);
	});

	it("clears the empty streak when the document starts preparing again", () => {
		const state = fold(["empty", "empty", "preparing", "empty"]);
		expect(state.emptyObservations).toBe(1);
		expect(previewDisplayReport(state)).toBe("preparing");
	});

	it("treats a fatal frame failure as final", () => {
		const state = fold(["empty", "failed"]);
		expect(previewDisplayReport(state)).toBe("failed");
		expect(previewShouldKeepPolling(state)).toBe(false);
	});

	it("stops polling once the absolute observation budget is spent", () => {
		const state = fold(repeat("preparing", 20));
		expect(previewShouldKeepPolling(state)).toBe(false);
		// The budget alone never fabricates a content or empty verdict.
		expect(state.report).toBe("preparing");
	});

	it("distinguishes a frame that answered and stayed slow from one that never answered", () => {
		const silent = fold([]);
		expect(previewFrameResponded(silent)).toBe(false);
		const slow = fold(repeat("preparing", 20));
		expect(previewFrameResponded(slow)).toBe(true);
	});

	it("never reports ready or empty before the frame says so", () => {
		const state = fold(["preparing", "preparing", "preparing"]);
		expect(state.report).toBe("preparing");
		expect(previewDisplayReport(state)).toBe("preparing");
	});
});
