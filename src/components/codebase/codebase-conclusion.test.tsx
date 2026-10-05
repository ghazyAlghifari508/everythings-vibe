// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AnalysisResponse } from "@/lib/codebase-analysis";
import type { SyncStatusResponse } from "@/lib/codebase-sync";
import { CodebaseConclusion } from "./codebase-conclusion";

const OUTPUT = {
	projectId: "proj_conclusion_1",
	snapshotId: "snap_current_1",
	summary: "Aplikasi planning produk berbasis Next.js dengan alurPRT dan AC.",
	framework: "Next.js",
	language: "TypeScript",
	packageManager: "pnpm",
	database: "PostgreSQL",
	auth: "Better Auth",
	moduleMap: [{ path: "src/routes", summary: "File-based routes" }],
	relevantFiles: ["src/db/schema.ts"],
	impactAreas: ["src/routes/api"],
	limitations: ["Cakupan snapshot terbatas"],
	findings: [],
};

function status(
	overrides: Partial<SyncStatusResponse> = {},
): SyncStatusResponse {
	return {
		projectId: "cb_conclusion_1",
		sessionId: "sess_conclusion_1",
		status: "uploaded",
		snapshotId: "snap_current_1",
		fileCount: 37,
		excludedCount: 5,
		...overrides,
	};
}

function readyAnalysis(
	overrides: Partial<AnalysisResponse> = {},
): AnalysisResponse {
	return {
		id: "ana_current_1",
		projectId: "proj_conclusion_1",
		snapshotId: "snap_current_1",
		status: "ready",
		output: OUTPUT,
		...overrides,
	};
}

let container: HTMLDivElement;
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
	document.body.innerHTML = "";
	vi.unstubAllGlobals();
});

function renderConclusion(
	props: Partial<React.ComponentProps<typeof CodebaseConclusion>> = {},
) {
	container = document.createElement("div");
	document.body.appendChild(container);
	const nextRoot = createRoot(container);
	root = nextRoot;
	act(() => {
		nextRoot.render(
			<CodebaseConclusion
				snapshot={status()}
				analysis={null}
				isAnalyzing={false}
				errorMessage={null}
				onRetryAnalysis={() => {}}
				onEnterWorkspace={() => {}}
				onBackToSync={() => {}}
				{...props}
			/>,
		);
	});
	return container;
}

function clickByLabel(c: HTMLDivElement, pattern: RegExp) {
	const button = [...c.querySelectorAll("button")].find((b) =>
		pattern.test(b.textContent ?? ""),
	);
	act(() => {
		button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
	});
	return button;
}

describe("CodebaseConclusion pending analysis state", () => {
	it("renders an honest analyzing state for the current snapshot", () => {
		const c = renderConclusion({
			snapshot: status({ analysisStatus: "pending" }),
			isAnalyzing: true,
		});
		expect(c.textContent).toContain("Menganalisis codebase");
		expect(c.textContent).toContain("Sinkronisasi repository sudah selesai.");
		expect(
			c.querySelector('[data-testid="codebase-analysis-pending"]'),
		).not.toBeNull();
	});

	it("never fabricates percentage, stage lists, or completion estimates", () => {
		const c = renderConclusion({
			snapshot: status({ analysisStatus: "pending" }),
			isAnalyzing: true,
		});
		expect(c.textContent).not.toContain("%");
		expect(c.textContent).not.toMatch(/estimasi|perkiraan|sisanya/i);
		expect(c.textContent).not.toMatch(
			/memindai|menghitung|menyusun|mengambil data/i,
		);
	});

	it("offers workspace entry without waiting for the analysis", () => {
		const onEnterWorkspace = vi.fn();
		const c = renderConclusion({
			snapshot: status({ analysisStatus: "pending" }),
			isAnalyzing: true,
			onEnterWorkspace,
		});
		const cta = [...c.querySelectorAll("button")].find((b) =>
			/Masuk ke Workspace tanpa menunggu/i.test(b.textContent ?? ""),
		) as HTMLButtonElement | undefined;
		expect(cta).toBeDefined();
		expect(cta?.disabled).toBe(false);
		act(() => {
			cta?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});
		expect(onEnterWorkspace).toHaveBeenCalledTimes(1);
	});

	it("requires no manual Next action to advance from pending", () => {
		const c = renderConclusion({
			snapshot: status({ analysisStatus: "pending" }),
			isAnalyzing: true,
		});
		expect(clickByLabel(c, /^(Lanjut|Next|Lihat hasil)/i)).toBeUndefined();
	});

	it("replaces the analyzing state with the review in place once ready", () => {
		const c = renderConclusion({
			snapshot: status({ analysisStatus: "pending" }),
			analysis: null,
			isAnalyzing: true,
		});
		expect(c.textContent).toContain("Menganalisis codebase");

		act(() => {
			root?.render(
				<CodebaseConclusion
					snapshot={status({ analysisStatus: "ready" })}
					analysis={readyAnalysis()}
					isAnalyzing={false}
					errorMessage={null}
					onRetryAnalysis={() => {}}
					onEnterWorkspace={() => {}}
					onBackToSync={() => {}}
				/>,
			);
		});

		// Same screen, same region: the pending block is replaced, not stacked.
		expect(
			c.querySelector('[data-testid="codebase-analysis-pending"]'),
		).toBeNull();
		expect(c.textContent).not.toContain("Menganalisis codebase");
		expect(c.textContent).toContain("Detected environment");
		expect(c.textContent).toContain("Next.js");
	});

	it("shows the plain workspace label once the review is ready", () => {
		const c = renderConclusion({
			snapshot: status({ analysisStatus: "ready" }),
			analysis: readyAnalysis(),
		});
		expect(c.textContent).toContain("Masuk ke Workspace");
		expect(c.textContent).not.toContain("tanpa menunggu");
	});
});

describe("CodebaseConclusion current-snapshot correctness", () => {
	it("never renders an analysis bound to an older snapshot", () => {
		const c = renderConclusion({
			snapshot: status({
				snapshotId: "snap_current_2",
				analysisStatus: "ready",
			}),
			analysis: readyAnalysis({ snapshotId: "snap_current_1" }),
		});
		expect(c.textContent).not.toContain("Next.js");
		expect(
			c.querySelector('[data-testid="codebase-analysis-pending"]'),
		).not.toBeNull();
	});

	it("keeps waiting while the current snapshot has no analysis yet", () => {
		const c = renderConclusion({
			snapshot: status({
				snapshotId: "snap_current_2",
				analysisStatus: "pending",
			}),
			analysis: null,
		});
		expect(c.textContent).toContain("Menganalisis codebase");
	});
});

describe("CodebaseConclusion failed analysis state", () => {
	it("reports the failure without pretending the sync failed", () => {
		const c = renderConclusion({
			snapshot: status({ analysisStatus: "failed" }),
			analysis: null,
			errorMessage: "Analisis codebase gagal. Coba analisis ulang.",
		});
		expect(c.textContent).toContain("Analisis belum berhasil");
		expect(c.textContent).toContain(
			"Repository sudah berhasil disinkronkan, tetapi ringkasan belum dapat disiapkan.",
		);
		expect(c.textContent).not.toMatch(/sync gagal/i);
		expect(
			c.querySelector('[data-testid="codebase-analysis-failed"]'),
		).not.toBeNull();
	});

	it("offers retry and workspace entry from the failed state", () => {
		const onRetryAnalysis = vi.fn();
		const onEnterWorkspace = vi.fn();
		const c = renderConclusion({
			snapshot: status({ analysisStatus: "failed" }),
			analysis: null,
			errorMessage: "Analisis codebase gagal.",
			onRetryAnalysis,
			onEnterWorkspace,
		});
		expect(clickByLabel(c, /coba analisis lagi/i)).toBeDefined();
		expect(onRetryAnalysis).toHaveBeenCalledTimes(1);
		expect(clickByLabel(c, /Masuk ke Workspace/i)).toBeDefined();
		expect(onEnterWorkspace).toHaveBeenCalledTimes(1);
	});

	it("never sends the user back to Pantau Sync as the only way out", () => {
		const c = renderConclusion({
			snapshot: status({ analysisStatus: "failed" }),
			analysis: null,
			errorMessage: "Analisis codebase gagal.",
		});
		expect(clickByLabel(c, /kembali ke pantau sync/i)).toBeUndefined();
	});

	it("falls back to the analyzing state while a retry is in flight", () => {
		const c = renderConclusion({
			snapshot: status({ analysisStatus: "failed" }),
			analysis: null,
			isAnalyzing: true,
			errorMessage: "Analisis codebase gagal.",
		});
		expect(
			c.querySelector('[data-testid="codebase-analysis-failed"]'),
		).toBeNull();
		expect(c.textContent).toContain("Menganalisis codebase");
	});
});
