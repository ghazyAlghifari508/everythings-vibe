// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { SyncStatusResponse } from "@/features/codebase/services/sync";
import { SyncStageList } from "../components/workspace/sync-stage-list";

/**
 * The sync status list's indicator contract (Phase 05).
 *
 * Every row state must render from persisted server facts with one coherent
 * visual language: spinner while running, checkmark when done, neutral dot when
 * pending, error icon when failed/blocked. The upload and the AI analysis are
 * separate operations, so they can never collapse into one misleading state.
 */

let container: HTMLDivElement;
let root: Root | null = null;

beforeEach(() => {
	(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
});

afterEach(() => {
	if (root) {
		const r = root;
		act(() => {
			r.unmount();
		});
		root = null;
	}
	container?.remove();
	document.body.innerHTML = "";
});

function status(
	overrides: Partial<SyncStatusResponse> = {},
): SyncStatusResponse {
	return {
		projectId: "cb_p5",
		sessionId: "sess_p5",
		status: "waiting_for_cli",
		snapshotId: null,
		...overrides,
	};
}

function render(
	statusValue: SyncStatusResponse | null,
	props: Partial<React.ComponentProps<typeof SyncStageList>> = {},
) {
	act(() => {
		root?.render(<SyncStageList status={statusValue} {...props} />);
	});
}

function stageState(testId: string): string | null {
	return (
		container
			.querySelector(`[data-testid="${testId}"]`)
			?.getAttribute("data-stage-state") ?? null
	);
}

function analysisRow(): Element | null {
	return container.querySelector('[data-testid="sync-stage-analysis"]');
}

describe("SyncStageList indicators", () => {
	it("spins the design-system spinner only for the active stage", () => {
		render(status({ status: "uploading", fileCount: 3 }));
		const active = container.querySelector(
			'[data-testid="sync-stage-sync"][data-stage-state="active"]',
		);
		const spinner = active?.querySelector('[data-testid="spinner"]');
		expect(spinner).not.toBeNull();
		// Reduced motion is honoured by the same primitive.
		expect(spinner?.getAttribute("class")).toContain(
			"motion-safe:animate-spin",
		);
		expect(spinner?.getAttribute("class")).toContain(
			"motion-reduce:animate-none",
		);
		// Exactly one spinner: finished rows carry a checkmark, not motion.
		expect(container.querySelectorAll('[data-testid="spinner"]')).toHaveLength(
			1,
		);
	});

	it("marks completed stages with the checkmark icon and no spinner", () => {
		render(
			status({
				status: "uploaded",
				snapshotId: "snap_p5",
				fileCount: 7,
			}),
		);
		for (const testId of [
			"sync-stage-agent",
			"sync-stage-preparing",
			"sync-stage-sync",
		]) {
			const row = container.querySelector(`[data-testid="${testId}"]`);
			expect(row?.getAttribute("data-stage-state")).toBe("done");
			expect(row?.querySelector("svg")).not.toBeNull();
			expect(row?.querySelector('[data-testid="spinner"]')).toBeNull();
		}
	});

	it("keeps the upload successful when only the analysis failed", () => {
		render(
			status({
				status: "uploaded",
				snapshotId: "snap_p5",
				analysisAttemptStatus: "failed",
			}),
		);
		expect(stageState("sync-stage-agent")).toBe("done");
		expect(stageState("sync-stage-preparing")).toBe("done");
		expect(stageState("sync-stage-sync")).toBe("done");
		expect(stageState("sync-stage-analysis")).toBe("failed");
		// Never a "sync failed" claim when the transport actually finished.
		expect(container.textContent).not.toContain("Sinkronisasi belum berhasil");
	});

	it("shows the analysis as visibly pending before it starts", () => {
		render(
			status({
				status: "uploaded",
				snapshotId: "snap_p5",
			}),
		);
		expect(stageState("sync-stage-analysis")).toBe("waiting");
		expect(analysisRow()?.textContent).toContain("Analisis AI");
	});

	it("shows a running analysis as active from its persisted attempt", () => {
		render(
			status({
				status: "uploaded",
				snapshotId: "snap_p5",
				analysisAttemptStatus: "pending",
			}),
		);
		const row = analysisRow();
		expect(row?.getAttribute("data-stage-state")).toBe("active");
		expect(row?.textContent).toContain("Menganalisis repository");
		expect(row?.querySelector('[data-testid="spinner"]')).not.toBeNull();
	});

	it("renders a pending analysis row while the upload is still running", () => {
		render(status({ status: "uploading", fileCount: 5 }));
		expect(stageState("sync-stage-analysis")).toBe("waiting");
		expect(analysisRow()?.textContent).toContain("Analisis AI");
	});

	it("offers the billing recovery action when credits block the analysis", () => {
		render(
			status({
				status: "uploaded",
				snapshotId: "snap_p5",
				fileCount: 7,
			}),
			{ analysisBlocked: true },
		);
		const row = analysisRow();
		expect(row?.getAttribute("data-stage-state")).toBe("blocked");
		expect(row?.textContent).toContain("Analisis membutuhkan kredit");
		expect(row?.textContent).toContain("Source code telah tersimpan.");
		const action = row?.querySelector("a");
		expect(action?.textContent).toBe("Tambahkan Kredit");
		expect(action?.getAttribute("href")).toBe("/settings/billing");
	});

	it("renders the analysis row exactly once and never duplicates a sync stage", () => {
		render(
			status({
				status: "uploaded",
				snapshotId: "snap_p5",
				analysisAttemptStatus: "failed",
			}),
			{
				showAnalysisFailure: true,
				analysisError: "Analisis belum berhasil.",
				onRetryAnalysis: () => {},
			},
		);
		expect(
			container.querySelectorAll('[data-testid="sync-stage-analysis"]'),
		).toHaveLength(1);
		expect(
			container.querySelectorAll('[data-testid="analysis-failure-alert"]'),
		).toHaveLength(1);
		for (const testId of [
			"sync-stage-agent",
			"sync-stage-preparing",
			"sync-stage-sync",
		]) {
			expect(
				container.querySelectorAll(`[data-testid="${testId}"]`),
			).toHaveLength(1);
		}
	});
});
