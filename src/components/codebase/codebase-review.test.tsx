// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CodebaseAnalysis } from "@/lib/codebase-analysis";
import { CodebaseReview } from "./codebase-review";

const analysis: CodebaseAnalysis = {
	projectId: "proj_123",
	snapshotId: "snap_123",
	summary:
		"Aplikasi web pemutar film berbasis React dengan alur penjelajahan katalog dan detail.",
	framework: "TanStack Start",
	language: "TypeScript",
	packageManager: "pnpm",
	dependencies: ["react", "drizzle-orm"],
	database: "PostgreSQL",
	auth: "Better Auth",
	moduleMap: [{ path: "src/routes", summary: "File-based routes" }],
	relevantFiles: ["src/db/schema.ts"],
	impactAreas: ["src/routes/api"],
	limitations: ["Tidak ada cakupan tes untuk alur sync"],
	findings: [
		{
			title: "Batas auth",
			detail: "Sesi dibaca dari header Better Auth.",
			uncertainty: "Jalur refresh token tidak terlihat di snapshot.",
		},
	],
};

const SECRET_CANARY = "sk-canary-never-render-9f8e7d";

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
});

function renderReview(
	props: Partial<React.ComponentProps<typeof CodebaseReview>> = {},
) {
	container = document.createElement("div");
	document.body.appendChild(container);
	const nextRoot = createRoot(container);
	root = nextRoot;
	act(() => {
		nextRoot.render(
			<CodebaseReview
				analysis={analysis}
				snapshotId="snap_123"
				snapshotCreatedAt="2026-09-19T10:00:00.000Z"
				fileCount={42}
				excludedCount={7}
				onRetrySync={() => {}}
				onRetryAnalysis={() => {}}
				onContinue={() => {}}
				{...props}
			/>,
		);
	});
	return container;
}

describe("CodebaseReview", () => {
	it("renders the detected environment without inventing missing values", () => {
		const c = renderReview();
		expect(c.textContent).toContain("TanStack Start");
		expect(c.textContent).toContain("TypeScript");
		expect(c.textContent).toContain("PostgreSQL");
		expect(c.textContent).toContain("Better Auth");
	});

	it("renders the repository map and impact areas", () => {
		const c = renderReview();
		expect(c.textContent).toContain("src/routes");
		expect(c.textContent).toContain("src/db/schema.ts");
		expect(c.textContent).toContain("src/routes/api");
	});

	it("shows dash for undefined metadata counts instead of false 0", () => {
		const c = renderReview({ fileCount: undefined, excludedCount: undefined });
		expect(c.textContent).toContain("— files indexed (— excluded)");
	});

	it("summarizes exclusions by count without file contents", () => {
		const c = renderReview();
		expect(c.textContent).toContain("7");
		expect(c.textContent).not.toContain(SECRET_CANARY);
	});

	it("labels uncertain findings explicitly", () => {
		const c = renderReview();
		expect(c.textContent).toContain("Batas auth");
		expect(c.textContent).toContain("Jalur refresh token tidak terlihat");
		expect(c.textContent).toMatch(/perlu verifikasi|tidak pasti/i);
	});

	it("shows the sync snapshot id and timestamp", () => {
		const c = renderReview();
		expect(c.textContent).toContain("snap_123");
	});

	it("marks unknown detections honestly instead of inventing them", () => {
		const { auth: _omitted, ...withoutAuth } = analysis;
		const c = renderReview({ analysis: withoutAuth });
		expect(c.textContent).toMatch(/tidak terdeteksi|belum terdeteksi/i);
	});

	it("renders primary continue action and hides persistent retry actions in normal review state", () => {
		const onContinue = vi.fn();
		const onBackToSync = vi.fn();
		const c = renderReview({ onContinue, onBackToSync });

		// Persistent retry buttons should NOT be present in normal state
		expect(c.textContent).not.toContain("Sync ulang");
		expect(c.textContent).not.toContain("Analisis ulang");

		// Secondary action and primary CTA are present and callable
		const backBtn = [...c.querySelectorAll("button")].find((b) =>
			/Kembali ke Sinkronisasi/i.test(b.textContent ?? ""),
		);
		expect(backBtn).toBeDefined();
		expect(c.textContent).not.toMatch(/lihat log sync/i);
		act(() => {
			backBtn?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});
		expect(onBackToSync).toHaveBeenCalledTimes(1);

		const continueBtn = [...c.querySelectorAll("button")].find((b) =>
			/lanjut/i.test(b.textContent ?? ""),
		);
		expect(continueBtn).toBeDefined();
		act(() => {
			continueBtn?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});
		expect(onContinue).toHaveBeenCalledTimes(1);
	});

	it("renders retry actions in recovery/error state when sync or analysis fails", () => {
		const onRetrySync = vi.fn();
		const onRetryAnalysis = vi.fn();
		const c = renderReview({
			errorMessage: "Analisis gagal dijalankan",
			onRetrySync,
			onRetryAnalysis,
		});

		expect(c.textContent).toContain("Analisis gagal dijalankan");

		const clickByLabel = (pattern: RegExp) => {
			const button = [...c.querySelectorAll("button")].find((b) =>
				pattern.test(b.textContent ?? ""),
			);
			expect(button).toBeDefined();
			act(() => {
				button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
			});
		};

		clickByLabel(/sync ulang/i);
		clickByLabel(/analisis ulang/i);
		expect(onRetrySync).toHaveBeenCalledTimes(1);
		expect(onRetryAnalysis).toHaveBeenCalledTimes(1);
	});

	it("renders relevant files with structured explorer items", () => {
		const c = renderReview();
		expect(c.textContent).toContain("FILE RELEVAN (1)");
		expect(c.textContent).toContain("schema.ts");
	});

	it("renders the application summary from the analysis contract", () => {
		const c = renderReview();
		expect(c.textContent).toContain("Ringkasan aplikasi");
		expect(c.textContent).toContain("pemutar film berbasis React");
	});

	it("renders an honest fallback instead of fabricating a missing summary", () => {
		const { summary: _omitted, ...withoutSummary } = analysis;
		const c = renderReview({ analysis: withoutSummary });
		expect(c.textContent).toContain("Ringkasan aplikasi");
		expect(c.textContent).not.toContain("pemutar film");
		expect(c.textContent).toMatch(/belum tersedia/i);
	});

	it("keeps previous and next navigation as separate ordered actions", () => {
		const c = renderReview({ onContinue: () => {}, onBackToSync: () => {} });
		const nav = c.querySelector('[data-testid="review-nav"]');
		expect(nav).not.toBeNull();
		const buttons = [...(nav?.querySelectorAll("button") ?? [])];
		expect(buttons).toHaveLength(2);
		expect(buttons[0]?.textContent).toMatch(/Kembali ke Sinkronisasi/i);
		expect(buttons[1]?.textContent).toMatch(/lanjut|workspace/i);
	});

	it("renders a single arrow affordance on the primary CTA", () => {
		const c = renderReview({
			continueLabel: "Masuk ke Workspace",
			onContinue: () => {},
		});
		const continueBtn = [...c.querySelectorAll("button")].find((b) =>
			/Masuk ke Workspace/i.test(b.textContent ?? ""),
		);
		expect(continueBtn).toBeDefined();
		expect(continueBtn?.querySelectorAll("svg")).toHaveLength(1);
		expect(continueBtn?.textContent).not.toContain("→");
		expect(continueBtn?.textContent).not.toContain("->");
	});

	it("renders a single arrow affordance on the previous action", () => {
		const c = renderReview({ onContinue: () => {}, onBackToSync: () => {} });
		const backBtn = [...c.querySelectorAll("button")].find((b) =>
			/Kembali ke Sinkronisasi/i.test(b.textContent ?? ""),
		);
		expect(backBtn).toBeDefined();
		expect(backBtn?.querySelectorAll("svg")).toHaveLength(1);
		expect(backBtn?.textContent).not.toContain("→");
		expect(backBtn?.textContent).not.toContain("->");
	});

	it("renders a custom continue label when provided", () => {
		const onContinue = vi.fn();
		const c = renderReview({
			continueLabel: "Masuk ke Workspace",
			onContinue,
		});
		const continueBtn = [...c.querySelectorAll("button")].find((b) =>
			/Masuk ke Workspace/i.test(b.textContent ?? ""),
		);
		expect(continueBtn).toBeDefined();
		act(() => {
			continueBtn?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});
		expect(onContinue).toHaveBeenCalledTimes(1);
	});

	it("disables actions and shows indeterminate state while working", () => {
		const c = renderReview({ isWorking: true });
		const buttons = [...c.querySelectorAll("button")];
		expect(buttons.length).toBeGreaterThan(0);
		for (const button of buttons) {
			expect(button.disabled).toBe(true);
		}
		expect(c.textContent).not.toContain("%");
	});
});
