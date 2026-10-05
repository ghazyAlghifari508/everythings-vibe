// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useUIStore } from "@/store";
import { PlanCodebasePage } from "./codebase";

vi.mock("@tanstack/react-router", () => ({
	createFileRoute: () => (options: unknown) => options,
	useNavigate: () => vi.fn(),
	Link: ({
		children,
		to,
		className,
	}: {
		children: React.ReactNode;
		to: string;
		className?: string;
	}) => (
		<a href={to} className={className}>
			{children}
		</a>
	),
}));

const SYNC_PAYLOAD = {
	projectId: "cb-nav-1",
	apiBaseUrl: "http://localhost:3000",
	syncToken: "nav-token-1",
	syncCommand:
		"vibeeverything codebase sync --project-id cb-nav-1 --sync-token nav-token-1",
	expiresAt: new Date(Date.now() + 3600000).toISOString(),
};

const ANALYSIS_OUTPUT = {
	projectId: "proj-nav-1",
	snapshotId: "snap-nav-1",
	framework: "TanStack Start",
	language: "TypeScript",
	packageManager: "pnpm",
	dependencies: ["react"],
	database: "PostgreSQL",
	auth: "Better Auth",
	moduleMap: [{ path: "src/routes", summary: "File-based routes" }],
	relevantFiles: ["src/db/schema.ts"],
	impactAreas: ["src/routes/api"],
	limitations: [],
	findings: [],
};

function analysisReadyPayload() {
	return {
		id: "ana-nav-1",
		projectId: "proj-nav-1",
		snapshotId: "snap-nav-1",
		status: "ready",
		output: ANALYSIS_OUTPUT,
	};
}

function waitingPayload() {
	return {
		projectId: "cb-nav-1",
		sessionId: "sess-nav-1",
		status: "waiting_for_cli",
		snapshotId: null,
	};
}

function uploadedPayload() {
	return {
		projectId: "cb-nav-1",
		sessionId: "sess-nav-1",
		status: "uploaded",
		snapshotId: "snap-nav-1",
		fileCount: 37,
		excludedCount: 6,
	};
}

function mockPlanFlow(
	statuses: Array<Record<string, unknown>>,
	options?: { withAnalysis?: boolean },
) {
	let statusCalls = 0;
	let analysisTriggered = false;
	const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
		const url = String(input);
		const method = init?.method ?? "GET";
		if (url === "/api/codebases") {
			return {
				ok: true,
				status: 200,
				json: async () => ({
					id: "cb-nav-1",
					name: "Nav Repo",
					sync: SYNC_PAYLOAD,
				}),
			};
		}
		if (url.includes("/api/codebases/cb-nav-1/status")) {
			statusCalls += 1;
			const payload = statuses[Math.min(statusCalls - 1, statuses.length - 1)];
			if (
				options?.withAnalysis &&
				analysisTriggered &&
				typeof payload === "object" &&
				payload !== null &&
				"snapshotId" in payload &&
				typeof payload.snapshotId === "string"
			) {
				return {
					ok: true,
					status: 200,
					json: async () => ({ ...payload, analysisStatus: "ready" }),
				};
			}
			return { ok: true, status: 200, json: async () => payload };
		}
		if (
			options?.withAnalysis &&
			url === "/api/codebases/cb-nav-1/features" &&
			method === "POST"
		) {
			return {
				ok: true,
				status: 200,
				json: async () => ({ projectId: "proj-nav-1", name: "Nav Repo" }),
			};
		}
		if (
			options?.withAnalysis &&
			url === "/api/v1/projects/proj-nav-1/codebase/analysis" &&
			method === "POST"
		) {
			analysisTriggered = true;
			return {
				ok: true,
				status: 200,
				json: async () => analysisReadyPayload(),
			};
		}
		if (
			options?.withAnalysis &&
			url.startsWith("/api/v1/projects/proj-nav-1/codebase/analysis")
		) {
			return {
				ok: true,
				status: 200,
				json: async () => analysisReadyPayload(),
			};
		}
		throw new Error(`unexpected fetch ${method} ${url}`);
	});
	vi.stubGlobal("fetch", fetchMock);
	return {
		fetchMock,
		getStatusCalls: () => statusCalls,
	};
}

async function startSyncing() {
	render(<PlanCodebasePage />);
	await waitFor(() => {
		expect(
			screen.getByText("Sync codebase dengan VibeEverything"),
		).toBeDefined();
	});
	screen.getByRole("button", { name: /Lanjut ke Pantau Sync/i }).click();
	await waitFor(() => {
		expect(screen.getByText("Sync codebase")).toBeDefined();
	});
}

async function waitForEnabledReviewCta() {
	await waitFor(
		() => {
			const card = screen.queryByTestId("sync-card");
			const cta = card?.querySelector(
				'[data-testid="plan-continue-to-summary"]',
			) as HTMLButtonElement | null;
			expect(cta?.disabled).toBe(false);
		},
		{ timeout: 15000, interval: 100 },
	);
}

function clickReviewCta() {
	(
		screen
			.getByTestId("sync-card")
			.querySelector(
				'[data-testid="plan-continue-to-summary"]',
			) as HTMLButtonElement
	).click();
}

describe("PlanCodebasePage navigation policy", () => {
	beforeEach(() => {
		useUIStore.getState().setCodebasePlanStep("prompt");
		try {
			sessionStorage.clear();
		} catch {
			// Best-effort only.
		}
	});

	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
		try {
			sessionStorage.clear();
		} catch {
			// Best-effort only.
		}
	});

	it("uploaded observed live does not auto-advance away from Pantau Sync", {
		timeout: 20000,
	}, async () => {
		const flow = mockPlanFlow([waitingPayload(), uploadedPayload()]);
		await startSyncing();
		await waitFor(
			() => {
				expect(screen.getByText("Source code tersinkron")).toBeDefined();
			},
			{ timeout: 6000, interval: 100 },
		);
		expect(flow.getStatusCalls()).toBeGreaterThanOrEqual(2);
		expect(screen.queryByTestId("codebase-sync-summary")).toBeNull();
	});

	it("analyzing observed live does not auto-advance away from Pantau Sync", {
		timeout: 20000,
	}, async () => {
		mockPlanFlow([
			waitingPayload(),
			{
				projectId: "cb-nav-1",
				sessionId: "sess-nav-1",
				status: "analyzing",
				snapshotId: "snap-nav-1",
				fileCount: 37,
			},
		]);
		await startSyncing();
		await waitFor(
			() => {
				expect(screen.getByText("Source code tersinkron")).toBeDefined();
			},
			{ timeout: 6000, interval: 100 },
		);
		// A finished transport is a finished sync; the model running behind it
		// is never rendered as a third stage.
		expect(screen.queryByText(/Menganalisis codebase/i)).toBeNull();
		expect(screen.queryByTestId("codebase-sync-summary")).toBeNull();
	});

	it("ready without analysis output does not render the analysis review", {
		timeout: 20000,
	}, async () => {
		mockPlanFlow([
			waitingPayload(),
			{
				projectId: "cb-nav-1",
				sessionId: "sess-nav-1",
				status: "ready",
				snapshotId: "snap-nav-1",
				fileCount: 37,
			},
		]);
		await startSyncing();
		await waitFor(
			() => {
				expect(screen.getByText("Source code tersinkron")).toBeDefined();
			},
			{ timeout: 6000, interval: 100 },
		);
		// Reaching `ready` never auto-opens the review, and no analysis stage
		// claims the work is done on the user's behalf.
		expect(screen.queryByTestId("codebase-sync-summary")).toBeNull();
		expect(screen.queryByText("Detected environment")).toBeNull();
		expect(screen.queryByText(/Analisis codebase selesai/i)).toBeNull();
	});

	it("explicit review continue advances sync to the validated analysis review", {
		timeout: 20000,
	}, async () => {
		mockPlanFlow([waitingPayload(), uploadedPayload()], {
			withAnalysis: true,
		});
		await startSyncing();
		await waitForEnabledReviewCta();
		clickReviewCta();
		await waitFor(() => {
			expect(screen.getByText("Detected environment")).toBeDefined();
		});
		expect(screen.getByText("snap-nav-1")).toBeDefined();
	});

	it("manual Back to Pantau Sync sticks across later polls without flicker", {
		timeout: 20000,
	}, async () => {
		mockPlanFlow([waitingPayload(), uploadedPayload()], {
			withAnalysis: true,
		});
		await startSyncing();
		await waitForEnabledReviewCta();
		clickReviewCta();
		await waitFor(() => {
			expect(screen.getByText("Detected environment")).toBeDefined();
		});
		screen.getByRole("button", { name: /Kembali ke Sinkronisasi/i }).click();
		await waitFor(() => {
			expect(screen.getByText("Sync codebase")).toBeDefined();
		});
		expect(screen.queryByTestId("codebase-sync-summary")).toBeNull();
		await waitFor(
			() => {
				expect(screen.getByText("Source code tersinkron")).toBeDefined();
			},
			{ timeout: 6000, interval: 100 },
		);
		expect(screen.queryByTestId("codebase-sync-summary")).toBeNull();
	});

	it("explicit return from sync to the review stays allowed while the analysis is valid", {
		timeout: 20000,
	}, async () => {
		mockPlanFlow([waitingPayload(), uploadedPayload()], {
			withAnalysis: true,
		});
		await startSyncing();
		await waitForEnabledReviewCta();
		clickReviewCta();
		await waitFor(() => {
			expect(screen.getByText("Detected environment")).toBeDefined();
		});
		screen.getByRole("button", { name: /Kembali ke Sinkronisasi/i }).click();
		await waitForEnabledReviewCta();
		clickReviewCta();
		await waitFor(() => {
			expect(screen.getByText("Detected environment")).toBeDefined();
		});
	});

	it("final review renders validated analysis, never a snapshot-only table", {
		timeout: 20000,
	}, async () => {
		mockPlanFlow([waitingPayload(), uploadedPayload()], {
			withAnalysis: true,
		});
		await startSyncing();
		await waitForEnabledReviewCta();
		clickReviewCta();
		await waitFor(() => {
			expect(screen.getByText("Detected environment")).toBeDefined();
		});
		expect(screen.queryByText("Snapshot siap")).toBeNull();
		expect(screen.queryByText("Sync Selesai — Snapshot Siap")).toBeNull();
		expect(
			screen.queryByText("Kesimpulan Analisis Codebase & Stack"),
		).toBeNull();
		expect(screen.getByText("TanStack Start")).toBeDefined();
		expect(screen.getByText("snap-nav-1")).toBeDefined();
	});
});
