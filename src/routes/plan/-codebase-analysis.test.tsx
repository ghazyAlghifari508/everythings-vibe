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
	projectId: "cb-onboard-1",
	apiBaseUrl: "http://localhost:3000",
	syncToken: "onboard-token-1",
	syncCommand:
		"vibeeverything codebase sync --project-id cb-onboard-1 --sync-token onboard-token-1",
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
	projectId: "proj-onboard-1",
	snapshotId: "snap-onboard-1",
	framework: "TanStack Start",
	language: "TypeScript",
	packageManager: "pnpm",
	dependencies: ["react", "drizzle-orm"],
	database: "PostgreSQL",
	auth: "Better Auth",
	moduleMap: [{ path: "src/routes", summary: "File-based routes" }],
	relevantFiles: ["src/db/schema.ts"],
	impactAreas: ["src/routes/api"],
	limitations: ["Cakupan snapshot terbatas"],
	findings: [
		{
			title: "Batas auth",
			detail: "Sesi dibaca dari header Better Auth.",
		},
	],
	starterSuggestions: VALID_STARTER_SUGGESTIONS,
};

function analysisReadyPayload() {
	return {
		id: "ana-onboard-1",
		projectId: "proj-onboard-1",
		snapshotId: "snap-onboard-1",
		status: "ready",
		output: ANALYSIS_OUTPUT,
	};
}

function waitingStatus() {
	return {
		projectId: "cb-onboard-1",
		sessionId: "sess-onboard-1",
		status: "waiting_for_cli",
		snapshotId: null,
	};
}

function uploadedStatus() {
	return {
		projectId: "cb-onboard-1",
		sessionId: "sess-onboard-1",
		status: "uploaded",
		snapshotId: "snap-onboard-1",
		cliConnectedAt: "2026-10-09T10:00:00.000Z",
		fileCount: 37,
		excludedCount: 6,
	};
}

function uploadedAnalyzedStatus() {
	return {
		...uploadedStatus(),
		analysisId: "ana-onboard-1",
		analysisStatus: "ready",
	};
}

// Full onboarding flow: create -> poll waiting/uploaded -> ensure feature
// project -> trigger real analysis -> status reports ready -> review CTA.
function mockOnboardingFlow() {
	let statusCalls = 0;
	let analysisTriggered = false;
	const calls: string[] = [];
	const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
		const url = String(input);
		const method = init?.method ?? "GET";
		calls.push(`${method} ${url}`);
		if (url === "/api/codebases" && method === "POST") {
			return {
				ok: true,
				status: 200,
				json: async () => ({
					id: "cb-onboard-1",
					name: "Onboard Repo",
					sync: SYNC_PAYLOAD,
				}),
			};
		}
		if (url.includes("/api/codebases/cb-onboard-1/status")) {
			statusCalls += 1;
			if (statusCalls === 1) {
				return { ok: true, status: 200, json: async () => waitingStatus() };
			}
			return {
				ok: true,
				status: 200,
				json: async () =>
					analysisTriggered ? uploadedAnalyzedStatus() : uploadedStatus(),
			};
		}
		if (url === "/api/codebases/cb-onboard-1/features" && method === "POST") {
			return {
				ok: true,
				status: 200,
				json: async () => ({
					projectId: "proj-onboard-1",
					name: "Onboard Repo",
				}),
			};
		}
		if (
			url === "/api/v1/projects/proj-onboard-1/codebase/analysis" &&
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
			url.startsWith("/api/v1/projects/proj-onboard-1/codebase/analysis") &&
			method === "GET"
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
		calls,
		getStatusCalls: () => statusCalls,
		wasAnalysisTriggered: () => analysisTriggered,
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

async function waitForEnabledSummaryCta() {
	await waitFor(
		() => {
			const cta = screen.getByTestId(
				"sync-continue-to-summary",
			) as HTMLButtonElement;
			expect(cta.disabled).toBe(false);
		},
		{ timeout: 15000, interval: 100 },
	);
}

describe("PlanCodebasePage onboarding analysis", () => {
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

	it("runs a real analysis through the existing feature/analysis boundary once the snapshot lands", async () => {
		const flow = mockOnboardingFlow();
		await startSyncStep();
		await waitFor(
			() => {
				expect(flow.wasAnalysisTriggered()).toBe(true);
			},
			{ timeout: 10000, interval: 100 },
		);
		expect(
			flow.calls.some((call) =>
				call.includes("/api/codebases/cb-onboard-1/features"),
			),
		).toBe(true);
		expect(
			flow.calls.some((call) =>
				call.includes("/api/v1/projects/proj-onboard-1/codebase/analysis"),
			),
		).toBe(true);
	}, 20000);

	it("never renders a separate snapshot-ready sibling card below the sync status", async () => {
		mockOnboardingFlow();
		await startSyncStep();
		await waitFor(
			() => {
				expect(screen.getByText("Sinkronisasi selesai")).toBeDefined();
			},
			{ timeout: 10000, interval: 100 },
		);
		expect(screen.queryByText("Snapshot siap")).toBeNull();
		expect(screen.queryByText("Snapshot Siap")).toBeNull();
	}, 20000);

	it("keeps the conclusion CTA disabled until a real snapshot exists", async () => {
		mockOnboardingFlow();
		await startSyncStep();
		await waitFor(
			() => {
				expect(screen.getByText("Paste prompt lalu jalankan")).toBeDefined();
			},
			{ timeout: 10000, interval: 100 },
		);
		expect(screen.queryByText("Menunggu agent")).toBeNull();
		const cta = screen.getByTestId(
			"sync-continue-to-summary",
		) as HTMLButtonElement;
		expect(cta.disabled).toBe(true);
		await waitForEnabledSummaryCta();
	}, 20000);

	it("renders the canonical CodebaseReview with real analysis values in the conclusion step", async () => {
		mockOnboardingFlow();
		await startSyncStep();
		await waitForEnabledSummaryCta();
		fireEvent.click(
			screen.getByTestId("sync-continue-to-summary") as HTMLButtonElement,
		);
		await waitFor(
			() => {
				expect(screen.getByText("Detected environment")).toBeDefined();
			},
			{ timeout: 10000, interval: 100 },
		);
		expect(screen.getByText("TanStack Start")).toBeDefined();
		expect(screen.getByText("TypeScript")).toBeDefined();
		expect(screen.getByText("PostgreSQL")).toBeDefined();
		expect(screen.queryByText("Snapshot siap")).toBeNull();
	}, 25000);

	it("recovers an uploaded snapshot with a pending analysis into Sync waiting state with Next disabled, even with summary intent", async () => {
		try {
			sessionStorage.setItem("prdfy:plan-codebase-id", "cb-onboard-1");
			sessionStorage.setItem("prdfy:plan-codebase-name", "Onboard Repo");
			sessionStorage.setItem("prdfy:plan-codebase-step", "summary");
		} catch {
			// Best-effort only.
		}
		let statusPollCount = 0;
		vi.stubGlobal(
			"fetch",
			vi.fn(async (input: unknown, init?: RequestInit) => {
				const url = String(input);
				const method = init?.method ?? "GET";
				if (url.includes("/api/codebases/cb-onboard-1/status")) {
					statusPollCount += 1;
					if (statusPollCount < 3) {
						return {
							ok: true,
							status: 200,
							json: async () => ({
								...uploadedStatus(),
								analysisStatus: "pending",
							}),
						};
					}
					return {
						ok: true,
						status: 200,
						json: async () => uploadedAnalyzedStatus(),
					};
				}
				if (
					url === "/api/codebases/cb-onboard-1/features" &&
					method === "POST"
				) {
					return {
						ok: true,
						status: 200,
						json: async () => ({
							projectId: "proj-onboard-1",
							name: "Onboard Repo",
						}),
					};
				}
				if (
					url === "/api/v1/projects/proj-onboard-1/codebase/analysis" &&
					method === "POST"
				) {
					return {
						ok: true,
						status: 200,
						json: async () => analysisReadyPayload(),
					};
				}
				if (
					url.startsWith("/api/v1/projects/proj-onboard-1/codebase/analysis")
				) {
					if (statusPollCount >= 3) {
						return {
							ok: true,
							status: 200,
							json: async () => analysisReadyPayload(),
						};
					}
					return Response.json(
						{ error: "Belum ada analisis codebase" },
						{ status: 404 },
					);
				}
				throw new Error(`unexpected fetch ${method} ${url}`);
			}),
		);
		render(<PlanCodebasePage />);
		// Waiting in Sync step initially
		await waitFor(
			() => {
				expect(
					screen.getByText("Sync codebase dengan VibeEverything"),
				).toBeDefined();
			},
			{ timeout: 10000, interval: 100 },
		);
		const cta = screen.getByTestId(
			"sync-continue-to-summary",
		) as HTMLButtonElement;
		expect(cta.disabled).toBe(true);
		expect(screen.queryByTestId("codebase-analysis-pending")).toBeNull();

		// Eventually becomes ready and unlocks
		await waitForEnabledSummaryCta();
		expect(cta.disabled).toBe(false);

		// Clicking next immediately shows review without loading
		fireEvent.click(cta);
		await waitFor(() => {
			expect(screen.getByText("Detected environment")).toBeDefined();
		});
		expect(screen.queryByTestId("codebase-analysis-pending")).toBeNull();
	}, 20000);

	it("keeps conclusion CTA disabled when analysis is for an old snapshot", async () => {
		mockOnboardingFlow();
		vi.stubGlobal(
			"fetch",
			vi.fn(async (input: unknown, init?: RequestInit) => {
				const url = String(input);
				const method = init?.method ?? "GET";
				if (url === "/api/codebases" && method === "POST") {
					return {
						ok: true,
						status: 200,
						json: async () => ({
							id: "cb-onboard-1",
							name: "Onboard Repo",
							sync: SYNC_PAYLOAD,
						}),
					};
				}
				if (url.includes("/api/codebases/cb-onboard-1/status")) {
					return {
						ok: true,
						status: 200,
						json: async () => ({
							...uploadedStatus(),
							snapshotId: "snap-new-current",
							analysisId: "ana-old-1",
							analysisStatus: "ready",
						}),
					};
				}
				if (
					url === "/api/codebases/cb-onboard-1/features" &&
					method === "POST"
				) {
					return {
						ok: true,
						status: 200,
						json: async () => ({
							projectId: "proj-onboard-1",
							name: "Onboard Repo",
						}),
					};
				}
				if (url.includes("/api/v1/projects/proj-onboard-1/codebase/analysis")) {
					return {
						ok: true,
						status: 200,
						json: async () => ({
							...analysisReadyPayload(),
							id: "ana-old-1",
							snapshotId: "snap-old-1", // Old snapshot mismatch!
						}),
					};
				}
				throw new Error(`unexpected fetch ${method} ${url}`);
			}),
		);
		await startSyncStep();
		await waitFor(() => {
			expect(screen.getByText("Sinkronisasi selesai")).toBeDefined();
		});
		const cta = screen.getByTestId(
			"sync-continue-to-summary",
		) as HTMLButtonElement;
		expect(cta.disabled).toBe(true);
	}, 20000);

	it("displays analysis failure and allows retry inside Sync without reuploading", async () => {
		let analysisPostCount = 0;
		let sessionPostCount = 0;
		vi.stubGlobal(
			"fetch",
			vi.fn(async (input: unknown, init?: RequestInit) => {
				const url = String(input);
				const method = init?.method ?? "GET";
				if (url === "/api/codebases" && method === "POST") {
					return {
						ok: true,
						status: 200,
						json: async () => ({
							id: "cb-onboard-1",
							name: "Onboard Repo",
							sync: SYNC_PAYLOAD,
						}),
					};
				}
				if (url.includes("/api/codebases/cb-onboard-1/status")) {
					return {
						ok: true,
						status: 200,
						json: async () => ({
							...uploadedStatus(),
							analysisStatus: analysisPostCount >= 2 ? "ready" : "failed",
							analysisId: analysisPostCount >= 2 ? "ana-onboard-1" : null,
						}),
					};
				}
				if (
					url === "/api/codebases/cb-onboard-1/features" &&
					method === "POST"
				) {
					return {
						ok: true,
						status: 200,
						json: async () => ({
							projectId: "proj-onboard-1",
							name: "Onboard Repo",
						}),
					};
				}
				if (url.includes("/session") && method === "POST") {
					sessionPostCount += 1;
					return {
						ok: true,
						status: 200,
						json: async () => SYNC_PAYLOAD,
					};
				}
				if (
					url === "/api/v1/projects/proj-onboard-1/codebase/analysis" &&
					method === "POST"
				) {
					analysisPostCount += 1;
					if (analysisPostCount === 1) {
						return {
							ok: false,
							status: 500,
							json: async () => ({ error: "Analysis model failure" }),
						};
					}
					return {
						ok: true,
						status: 200,
						json: async () => analysisReadyPayload(),
					};
				}
				if (
					url.startsWith("/api/v1/projects/proj-onboard-1/codebase/analysis")
				) {
					return {
						ok: true,
						status: 200,
						json: async () => analysisReadyPayload(),
					};
				}
				throw new Error(`unexpected fetch ${method} ${url}`);
			}),
		);
		await startSyncStep();
		// Analysis failure alert shown inside Sync
		await waitFor(
			() => {
				expect(screen.getByTestId("analysis-failure-alert")).toBeDefined();
				expect(screen.getByText("Analysis model failure")).toBeDefined();
			},
			{ timeout: 10000, interval: 100 },
		);
		expect(sessionPostCount).toBe(0);

		// Retry analysis inside Sync
		const retryBtn = screen.getByTestId("retry-analysis-button");
		fireEvent.click(retryBtn);

		// After retry, analysis lands and CTA enables
		await waitForEnabledSummaryCta();
		expect(sessionPostCount).toBe(0); // Never reuploaded or minted new session!
		expect(analysisPostCount).toBe(2);
	}, 20000);

	it("displays legacy analysis warning when suggestions are missing and allows refresh POST", async () => {
		let refreshCallBody: unknown = null;
		let refreshCalled = false;
		vi.stubGlobal(
			"fetch",
			vi.fn(async (input: unknown, init?: RequestInit) => {
				const url = String(input);
				const method = init?.method ?? "GET";
				if (url === "/api/codebases" && method === "POST") {
					return {
						ok: true,
						status: 200,
						json: async () => ({
							id: "cb-onboard-1",
							name: "Onboard Repo",
							sync: SYNC_PAYLOAD,
						}),
					};
				}
				if (url.includes("/api/codebases/cb-onboard-1/status")) {
					return {
						ok: true,
						status: 200,
						json: async () => uploadedAnalyzedStatus(),
					};
				}
				if (
					url === "/api/codebases/cb-onboard-1/features" &&
					method === "POST"
				) {
					return {
						ok: true,
						status: 200,
						json: async () => ({
							projectId: "proj-onboard-1",
							name: "Onboard Repo",
						}),
					};
				}
				if (
					url === "/api/v1/projects/proj-onboard-1/codebase/analysis" &&
					method === "POST"
				) {
					if (init?.body) {
						const parsedBody = JSON.parse(String(init.body));
						if (parsedBody.refreshStarterSuggestionsForAnalysisId) {
							refreshCallBody = parsedBody;
							refreshCalled = true;
							return {
								ok: true,
								status: 200,
								json: async () => analysisReadyPayload(),
							};
						}
					}
					const { starterSuggestions: _, ...legacyOutput } = ANALYSIS_OUTPUT;
					return {
						ok: true,
						status: 200,
						json: async () => ({
							...analysisReadyPayload(),
							output: legacyOutput,
						}),
					};
				}
				if (
					url.startsWith("/api/v1/projects/proj-onboard-1/codebase/analysis")
				) {
					// Legacy analysis initially returned without suggestions
					const { starterSuggestions: _, ...legacyOutput } = ANALYSIS_OUTPUT;
					return {
						ok: true,
						status: 200,
						json: async () => ({
							...analysisReadyPayload(),
							output: refreshCalled ? ANALYSIS_OUTPUT : legacyOutput,
						}),
					};
				}
				throw new Error(`unexpected fetch ${method} ${url}`);
			}),
		);
		await startSyncStep();

		// Legacy warning shown inside Sync
		await waitFor(
			() => {
				expect(screen.getByTestId("legacy-analysis-warning")).toBeDefined();
			},
			{ timeout: 10000, interval: 100 },
		);
		expect(
			screen.getByText("Rekomendasi task awal belum tersedia"),
		).toBeDefined();
		const cta = screen.getByTestId(
			"sync-continue-to-summary",
		) as HTMLButtonElement;
		expect(cta.disabled).toBe(true);

		// Click refresh legacy suggestions
		const refreshBtn = screen.getByTestId("refresh-legacy-suggestions-button");
		fireEvent.click(refreshBtn);

		// Verify the POST body carries refreshStarterSuggestionsForAnalysisId
		await waitFor(() => {
			expect(refreshCallBody).toEqual({
				snapshotId: "snap-onboard-1",
				refreshStarterSuggestionsForAnalysisId: "ana-onboard-1",
			});
		});

		// CTA becomes enabled once refreshed
		await waitForEnabledSummaryCta();
		expect(cta.disabled).toBe(false);
	}, 20000);

	it("directly renders summary review after recovery when analysis is already ready", async () => {
		try {
			sessionStorage.setItem("prdfy:plan-codebase-id", "cb-onboard-1");
			sessionStorage.setItem("prdfy:plan-codebase-name", "Onboard Repo");
			sessionStorage.setItem(
				"prdfy:plan-codebase-project-id",
				"proj-onboard-1",
			);
			sessionStorage.setItem("prdfy:plan-codebase-step", "summary");
		} catch {
			// Best-effort only.
		}
		vi.stubGlobal(
			"fetch",
			vi.fn(async (input: unknown, init?: RequestInit) => {
				const url = String(input);
				const method = init?.method ?? "GET";
				if (url.includes("/api/codebases/cb-onboard-1/status")) {
					return {
						ok: true,
						status: 200,
						json: async () => uploadedAnalyzedStatus(),
					};
				}
				if (
					url.startsWith("/api/v1/projects/proj-onboard-1/codebase/analysis")
				) {
					return {
						ok: true,
						status: 200,
						json: async () => analysisReadyPayload(),
					};
				}
				throw new Error(`unexpected fetch ${method} ${url}`);
			}),
		);
		render(<PlanCodebasePage />);
		// Directly rendered into summary with review, no ordinary loading
		await waitFor(
			() => {
				expect(screen.getByText("Detected environment")).toBeDefined();
			},
			{ timeout: 10000, interval: 100 },
		);
		expect(screen.queryByTestId("codebase-analysis-pending")).toBeNull();
		expect(screen.getByText("TanStack Start")).toBeDefined();
	}, 20000);
	it("review-to-sync back navigation stays on the sync step despite a ready server", async () => {
		mockOnboardingFlow();
		await startSyncStep();
		await waitForEnabledSummaryCta();
		fireEvent.click(
			screen.getByTestId("sync-continue-to-summary") as HTMLButtonElement,
		);
		await waitFor(() => {
			expect(screen.getByText("Detected environment")).toBeDefined();
		});
		screen.getByRole("button", { name: /Kembali ke Sinkronisasi/i }).click();
		await waitFor(() => {
			expect(
				screen.getByText("Sync codebase dengan VibeEverything"),
			).toBeDefined();
		});
		expect(screen.queryByText("Detected environment")).toBeNull();
		await waitFor(
			() => {
				expect(screen.getByText("Sinkronisasi selesai")).toBeDefined();
			},
			{ timeout: 10000, interval: 100 },
		);
		expect(screen.queryByTestId("codebase-sync-summary")).toBeNull();
	}, 25000);
});
