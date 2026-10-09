// @vitest-environment jsdom
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
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
const VALID_STARTER_SUGGESTIONS = [
	{
		id: "feature",
		title: "Feature task",
		description: "A focused task description.",
		prompt: "Implement a feature.",
		relevantPaths: ["src/feature.ts"],
	},
	{
		id: "bugfix",
		title: "Bugfix task",
		description: "A focused bugfix description.",
		prompt: "Fix a bug.",
		relevantPaths: ["src/bugfix.ts"],
	},
	{
		id: "refactor",
		title: "Refactor task",
		description: "A focused refactor description.",
		prompt: "Refactor a module.",
		relevantPaths: ["src/refactor.ts"],
	},
	{
		id: "ui",
		title: "UI task",
		description: "A focused UI description.",
		prompt: "Improve UI.",
		relevantPaths: ["src/ui.ts"],
	},
];

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
	starterSuggestions: VALID_STARTER_SUGGESTIONS,
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
		cliConnectedAt: "2026-10-09T10:00:00.000Z",
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
					json: async () => ({
						...payload,
						analysisId: "ana-nav-1",
						analysisStatus: "ready",
					}),
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

async function startSyncStep() {
	render(<PlanCodebasePage />);
	await waitFor(() => {
		expect(
			screen.getByText("Sync codebase dengan VibeEverything"),
		).toBeDefined();
	});
}

function summaryCta(): HTMLButtonElement {
	return screen.getByTestId("sync-continue-to-summary") as HTMLButtonElement;
}

async function waitForEnabledSummaryCta() {
	await waitFor(
		() => {
			expect(summaryCta().disabled).toBe(false);
		},
		{ timeout: 15000, interval: 100 },
	);
}

describe("PlanCodebasePage two-step navigation policy", () => {
	beforeEach(() => {
		useUIStore.getState().setCodebasePlanStep("sync");
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

	it("renders the whole sync lifecycle on step 1 and never navigates away from it", async () => {
		const flow = mockPlanFlow([waitingPayload(), uploadedPayload()]);
		await startSyncStep();

		// The upload landing while the user still watches step 1 updates that same
		// screen in place. There is no separate monitor screen to be pushed onto.
		await waitFor(
			() => {
				expect(screen.getByText("Sinkronisasi selesai")).toBeDefined();
			},
			{ timeout: 10000, interval: 100 },
		);
		expect(flow.getStatusCalls()).toBeGreaterThanOrEqual(2);
		expect(
			screen.getByText("Sync codebase dengan VibeEverything"),
		).toBeDefined();
		expect(screen.queryByTestId("codebase-sync-summary")).toBeNull();
	}, 20000);

	it("shows exactly one sync progress surface on step 1", async () => {
		mockPlanFlow([waitingPayload(), uploadedPayload()]);
		await startSyncStep();
		await waitFor(
			() => {
				expect(screen.getByText("Sinkronisasi selesai")).toBeDefined();
			},
			{ timeout: 10000, interval: 100 },
		);
		// CTA stays disabled when analysis is not ready
		expect(summaryCta().disabled).toBe(true);

		// Handshake and upload, rendered once each. A duplicated monitor screen is
		// exactly what this asserts cannot happen.
		expect(screen.getAllByTestId("sync-stage-agent")).toHaveLength(1);
		expect(screen.getAllByTestId("sync-stage-sync")).toHaveLength(1);
		expect(screen.queryByTestId("sync-card")).toBeNull();
		expect(screen.queryByText(/Lanjut ke Pantau Sync/i)).toBeNull();
		expect(screen.queryByText(/Kembali ke Prompt Sync/i)).toBeNull();
		expect(screen.queryByText(/CLI Agent Belum Terhubung/i)).toBeNull();
	}, 20000);
	it("keeps a legacy analyzing session reported as a finished sync", async () => {
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
		await startSyncStep();
		await waitFor(
			() => {
				expect(screen.getByText("Sinkronisasi selesai")).toBeDefined();
			},
			{ timeout: 10000, interval: 100 },
		);
		// A finished transport is a finished sync; the model running behind it is
		// never rendered as a sync stage.
		expect(screen.queryByText(/Menganalisis codebase/i)).toBeNull();
		expect(screen.queryByTestId("codebase-sync-summary")).toBeNull();
	}, 20000);

	it("opens the conclusion step directly from the snapshot CTA", async () => {
		mockPlanFlow([waitingPayload(), uploadedPayload()], {
			withAnalysis: true,
		});
		await startSyncStep();
		await waitForEnabledSummaryCta();
		fireEvent.click(summaryCta());

		await waitFor(() => {
			expect(screen.getByText("Detected environment")).toBeDefined();
		});
		expect(screen.getByText("snap-nav-1")).toBeDefined();
		// One hop, straight to the conclusion step.
		expect(
			screen.queryByText("Sync codebase dengan VibeEverything"),
		).toBeNull();
	}, 25000);

	it("never auto-opens the conclusion step while the analysis is still pending", async () => {
		const flow = mockPlanFlow([waitingPayload(), uploadedPayload()], {
			withAnalysis: true,
		});
		await startSyncStep();
		await waitFor(
			() => {
				expect(
					flow.fetchMock.mock.calls.some(
						(call) =>
							call[1]?.method === "POST" &&
							String(call[0]).includes(
								"/api/v1/projects/proj-nav-1/codebase/analysis",
							),
					),
				).toBe(true);
			},
			{ timeout: 10000, interval: 100 },
		);
		// The snapshot being analysed keeps the CTA disabled and does not pull the user forward on its own.
		expect(screen.queryByTestId("codebase-sync-summary")).toBeNull();
		await waitForEnabledSummaryCta();
		expect(screen.queryByTestId("codebase-sync-summary")).toBeNull();
	}, 25000);

	it("keeps review-to-sync back navigation available and stable across later polls", async () => {
		mockPlanFlow([waitingPayload(), uploadedPayload()], {
			withAnalysis: true,
		});
		await startSyncStep();
		await waitForEnabledSummaryCta();
		fireEvent.click(summaryCta());
		await waitFor(() => {
			expect(screen.getByText("Detected environment")).toBeDefined();
		});

		screen.getByRole("button", { name: /Kembali ke Sinkronisasi/i }).click();
		await waitFor(() => {
			expect(
				screen.getByText("Sync codebase dengan VibeEverything"),
			).toBeDefined();
		});
		// Going back lands on a completed sync, and it stays there: a later poll
		// reporting a ready analysis must not drag the user forward again.
		await waitFor(
			() => {
				expect(screen.getByText("Sinkronisasi selesai")).toBeDefined();
			},
			{ timeout: 10000, interval: 100 },
		);
		expect(screen.queryByTestId("codebase-sync-summary")).toBeNull();
	}, 25000);

	it("allows returning to the conclusion step while the analysis stays valid", async () => {
		mockPlanFlow([waitingPayload(), uploadedPayload()], {
			withAnalysis: true,
		});
		await startSyncStep();
		await waitForEnabledSummaryCta();
		fireEvent.click(summaryCta());
		await waitFor(() => {
			expect(screen.getByText("Detected environment")).toBeDefined();
		});
		screen.getByRole("button", { name: /Kembali ke Sinkronisasi/i }).click();
		await waitForEnabledSummaryCta();
		fireEvent.click(summaryCta());
		await waitFor(() => {
			expect(screen.getByText("Detected environment")).toBeDefined();
		});
	}, 25000);

	it("renders validated analysis values, never a snapshot-only summary", async () => {
		mockPlanFlow([waitingPayload(), uploadedPayload()], {
			withAnalysis: true,
		});
		await startSyncStep();
		await waitForEnabledSummaryCta();
		fireEvent.click(summaryCta());
		await waitFor(() => {
			expect(screen.getByText("Detected environment")).toBeDefined();
		});
		expect(screen.queryByText("Snapshot siap")).toBeNull();
		expect(
			screen.queryByText(/Kesimpulan Analisis Codebase & Stack/),
		).toBeNull();
		expect(screen.getByText("TanStack Start")).toBeDefined();
		expect(screen.getByText("snap-nav-1")).toBeDefined();
	}, 25000);
});
