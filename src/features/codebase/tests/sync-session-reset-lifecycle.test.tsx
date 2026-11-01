// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SyncStatusResponse } from "@/features/codebase/services/sync";
import { SyncStageList } from "../components/workspace/sync-stage-list";

let container: HTMLDivElement | null = null;
let root: Root | null = null;

afterEach(() => {
	if (root) {
		const r = root;
		act(() => {
			r.unmount();
		});
		root = null;
	}
	container?.remove();
	container = null;
	document.body.innerHTML = "";
	vi.unstubAllGlobals();
});

function statusResponse(
	overrides: Partial<SyncStatusResponse> = {},
): SyncStatusResponse {
	return {
		projectId: "cb_p2",
		sessionId: "sess_p2_1",
		status: "uploaded",
		snapshotId: "snap_p2_1",
		...overrides,
	};
}

function renderList(
	status: SyncStatusResponse | null,
	props: Partial<React.ComponentProps<typeof SyncStageList>> = {},
) {
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
	act(() => {
		root?.render(<SyncStageList status={status} {...props} />);
	});
}

function rowState(testId: string): string | null {
	return (
		container
			?.querySelector(`[data-testid="${testId}"]`)
			?.getAttribute("data-stage-state") ?? null
	);
}

describe("FIX02 sync session reset and analysis retry lifecycle", () => {
	it("replaces the failure row with running state during an explicit retry", () => {
		renderList(statusResponse({ analysisAttemptStatus: "failed" }), {
			showAnalysisFailure: true,
			analysisError: "Analisis codebase gagal.",
			onRetryAnalysis: () => {},
			isRetrying: true,
		});
		expect(rowState("sync-stage-analysis")).toBe("active");
		expect(container?.textContent).not.toContain("Coba lagi analisis");
	});

	it("replaces the failure row while the trigger reports working", () => {
		renderList(statusResponse({ analysisAttemptStatus: "failed" }), {
			showAnalysisFailure: true,
			analysisError: "Analisis codebase gagal.",
			onRetryAnalysis: () => {},
			isAnalyzing: true,
		});
		expect(rowState("sync-stage-analysis")).toBe("active");
		expect(
			container?.querySelector('[data-testid="sync-stage-analysis"] svg'),
		).not.toBeNull();
	});

	it("renders the new failure when the retry attempt fails", () => {
		renderList(
			statusResponse({
				sessionId: "sess_p2_2",
				analysisAttemptStatus: "failed",
				analysisAttemptId: "attempt_2",
			}),
			{
				showAnalysisFailure: true,
				analysisError: "Percobaan kedua gagal.",
				onRetryAnalysis: () => {},
			},
		);
		expect(rowState("sync-stage-analysis")).toBe("failed");
		expect(container?.textContent).toContain("Percobaan kedua gagal.");
	});

	it("renders ready state when the retry attempt succeeds", () => {
		renderList(
			statusResponse({
				sessionId: "sess_p2_2",
				analysisStatus: "ready",
				analysisAttemptStatus: "ready",
			}),
			{ isAnalysisReady: true },
		);
		expect(rowState("sync-stage-analysis")).toBe("done");
	});

	it("stops the running paint when the attempt finishes ready", () => {
		renderList(
			statusResponse({
				analysisStatus: "ready",
				analysisAttemptStatus: "ready",
			}),
			{ isAnalysisReady: true, isRetrying: true },
		);
		expect(rowState("sync-stage-analysis")).toBe("done");
		expect(container?.textContent).toContain("Analisis selesai");
	});

	it("never requires a re-upload after an upload success plus analysis failure", () => {
		renderList(statusResponse({ analysisAttemptStatus: "failed" }), {
			showAnalysisFailure: true,
			analysisError: "Analisis gagal.",
			onRetryAnalysis: () => {},
		});
		expect(rowState("sync-stage-sync")).toBe("done");
		expect(container?.textContent).toContain("tanpa mengunggah ulang");
		expect(container?.textContent).not.toContain("Sinkronisasi belum berhasil");
	});

	it("ignores a stale response from the previous session", () => {
		renderList(
			statusResponse({
				sessionId: "sess_p2_old",
				status: "waiting_for_cli",
				snapshotId: null,
				analysisAttemptStatus: undefined,
			}),
			{ isAnalysisReady: false },
		);
		expect(rowState("sync-stage-analysis")).toBeNull();
		expect(container?.textContent).not.toContain(
			"Analisis codebase belum berhasil",
		);
	});

	it("keeps the billing row when credits block the analysis", () => {
		renderList(statusResponse({ analysisAttemptStatus: "failed" }), {
			analysisBlocked: true,
		});
		expect(rowState("sync-stage-analysis")).toBe("blocked");
		expect(container?.textContent).toContain("Tambahkan Kredit");
	});
});
