// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CodebaseAnalysis } from "@/features/codebase/services/analysis";
import { CodebaseReview } from "../components/planning/codebase-review";

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
	it("renders main heading 'Ringkasan repository' and updated description", () => {
		const c = renderReview();
		expect(c.textContent).toContain("Ringkasan repository");
		expect(c.textContent).toContain(
			"Berikut gambaran aplikasi dan teknologi dari repository yang sudah disinkronkan. Buka workspace untuk mulai merencanakan fitur.",
		);
	});

	it("removes redundant labels and badges from the header and impact sections", () => {
		const c = renderReview();
		expect(c.textContent).not.toContain(
			"CODEBASE ANALYSIS · REVIEW BEFORE GENERATE",
		);
		expect(c.textContent).not.toContain("Kami menemukan konteks aplikasimu.");
		expect(c.textContent).not.toContain(
			"Review ringkasan ini sebelum everythings-vibe membuat pertanyaan.",
		);
		expect(c.textContent).not.toContain("Sync selesai");
		expect(c.textContent).not.toContain("AI generated · review");
		expect(c.textContent).not.toContain(
			"Semua temuan di atas tanpa ketidakpastian tercatat.",
		);
		expect(c.textContent).not.toContain("Perlu verifikasi");
	});

	it("does not display raw snapshot ID in primary UI text", () => {
		const c = renderReview();
		expect(c.textContent).not.toContain("snap_123");
		expect(c.textContent).not.toContain("ID: snap_123");
	});

	it("retains dynamic snapshot metadata internally on DOM attributes and props", () => {
		const c = renderReview();
		const nav = c.querySelector('[data-testid="review-nav"]');
		expect(nav).not.toBeNull();
		expect(nav?.getAttribute("data-snapshot-id")).toBe("snap_123");
		expect(nav?.getAttribute("data-snapshot-created-at")).toBe(
			"2026-09-19T10:00:00.000Z",
		);
	});

	it("renders the detected environment without inventing missing values", () => {
		const c = renderReview();
		expect(c.textContent).toContain("Teknologi repository");
		expect(c.textContent).toContain("TanStack Start");
		expect(c.textContent).toContain("TypeScript");
		expect(c.textContent).toContain("PostgreSQL");
		expect(c.textContent).toContain("Better Auth");
	});

	it("renders the repository structure and application sections", () => {
		const c = renderReview();
		expect(c.textContent).toContain("Struktur repository");
		expect(c.textContent).toContain("Bagian aplikasi");
		expect(c.textContent).toContain("src/routes");
		expect(c.textContent).toContain("src/db/schema.ts");
		expect(c.textContent).toContain("src/routes/api");
	});

	it("does not categorize impact areas by array index or repeat arbitrary categories", () => {
		const multiAreasAnalysis: CodebaseAnalysis = {
			...analysis,
			impactAreas: [
				"Katalog dan halaman detail proyek",
				"Sistem navigasi dan tata letak responsif",
				"Penyajian sertifikat",
				"Interaksi tema",
				"Alur kontak",
			],
		};
		const c = renderReview({ analysis: multiAreasAnalysis });
		expect(c.textContent).not.toContain("Database & State");
		expect(c.textContent).not.toContain("Application & Logic");
		expect(c.textContent).not.toContain("Interface & Routing");
		expect(c.textContent).toContain("Katalog dan halaman detail proyek");
		expect(c.textContent).toContain("Sistem navigasi dan tata letak responsif");
		expect(c.textContent).toContain("Penyajian sertifikat");
		expect(c.textContent).toContain("Interaksi tema");
		expect(c.textContent).toContain("Alur kontak");
	});

	it("renders structured applicationModules when present in analysis", () => {
		const structuredAnalysis: CodebaseAnalysis = {
			...analysis,
			applicationModules: [
				{
					name: "Halaman proyek",
					description: "Daftar dan detail karya portofolio",
				},
				{
					name: "Navigasi dan tampilan",
					description: "Menu, layout, dan tema tampilan",
				},
			],
		};
		const c = renderReview({ analysis: structuredAnalysis });
		expect(c.textContent).toContain("Halaman proyek");
		expect(c.textContent).toContain("Daftar dan detail karya portofolio");
		expect(c.textContent).toContain("Navigasi dan tampilan");
		expect(c.textContent).toContain("Menu, layout, dan tema tampilan");
	});

	it("shows dash for undefined metadata counts instead of false 0", () => {
		const c = renderReview({ fileCount: undefined, excludedCount: undefined });
		expect(c.textContent).toContain("— file terindeks (— dikecualikan)");
	});

	it("summarizes exclusions by count without file contents", () => {
		const c = renderReview();
		expect(c.textContent).toContain("7");
		expect(c.textContent).not.toContain(SECRET_CANARY);
	});

	it("renders findings and uncertainties under distinct sections without generic warning badges", () => {
		const c = renderReview();
		expect(c.textContent).toContain("Temuan arsitektur");
		expect(c.textContent).toContain("Batas auth");
		expect(c.textContent).toContain("Sesi dibaca dari header Better Auth.");
		expect(c.textContent).toContain("Hal yang belum dapat dipastikan");
		expect(c.textContent).toContain(
			"Jalur refresh token tidak terlihat di snapshot.",
		);
		expect(c.textContent).toContain("Tidak ada cakupan tes untuk alur sync");
		expect(c.textContent).not.toContain("Perlu verifikasi");
	});

	it("does not create false database/auth claims when database and auth are null or absent", () => {
		const { database: _d, auth: _a, findings: _f, ...withoutDbAuth } = analysis;
		const c = renderReview({
			analysis: { ...withoutDbAuth, database: null, auth: null, findings: [] },
		});
		expect(c.textContent).not.toContain("PostgreSQL");
		expect(c.textContent).not.toContain("Better Auth");
		expect(c.textContent).toMatch(/tidak terdeteksi/i);
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
		expect(c.textContent).toContain("File relevan (1)");
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
	it("renders dynamic repository data from analysis without hardcoding", () => {
		const customAnalysis: CodebaseAnalysis = {
			projectId: "proj_custom",
			snapshotId: "snap_custom",
			summary: "Aplikasi e-commerce berbasis Go dan Vue.",
			framework: "Vue.js",
			language: "Go",
			packageManager: "npm",
			dependencies: ["gin", "gorm"],
			database: "MySQL",
			auth: "JWT",
			moduleMap: [{ path: "cmd/server", summary: "Server entrypoint" }],
			relevantFiles: ["cmd/server/main.go"],
			impactAreas: ["api/orders"],
			findings: [
				{
					title: "Pengelolaan pesanan",
					detail: "Pesanan disimpan ke database MySQL melalui GORM.",
				},
			],
		};
		const c = renderReview({ analysis: customAnalysis });
		expect(c.textContent).toContain("Vue.js");
		expect(c.textContent).toContain("Go");
		expect(c.textContent).toContain("MySQL");
		expect(c.textContent).toContain("JWT");
		expect(c.textContent).toContain("cmd/server");
		expect(c.textContent).toContain("main.go");
		expect(c.textContent).toContain("api/orders");
		expect(c.textContent).toContain("Pengelolaan pesanan");
	});
});
