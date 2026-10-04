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
	projectId: "cb-onboard-1",
	apiBaseUrl: "http://localhost:3000",
	syncToken: "onboard-token-1",
	syncCommand:
		"vibeeverything codebase sync --project-id cb-onboard-1 --sync-token onboard-token-1",
	expiresAt: new Date(Date.now() + 3600000).toISOString(),
};

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
		fileCount: 37,
		excludedCount: 6,
	};
}

function uploadedAnalyzedStatus() {
	return { ...uploadedStatus(), analysisStatus: "ready" };
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

describe("PlanCodebasePage onboarding analysis", () => {
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

	it("runs a real analysis through the existing feature/analysis boundary once the snapshot lands", {
		timeout: 20000,
	}, async () => {
		const flow = mockOnboardingFlow();
		await startSyncing();
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
	});

	it("never renders a separate snapshot-ready sibling card below the sync card", {
		timeout: 20000,
	}, async () => {
		mockOnboardingFlow();
		await startSyncing();
		await waitFor(
			() => {
				expect(screen.getByText("Source code tersinkron")).toBeDefined();
			},
			{ timeout: 10000, interval: 100 },
		);
		expect(screen.queryByText("Snapshot siap")).toBeNull();
		expect(screen.queryByText("Snapshot Siap")).toBeNull();
	});

	it("keeps the review CTA inside the sync card and disabled until real analysis is ready", {
		timeout: 20000,
	}, async () => {
		mockOnboardingFlow();
		await startSyncing();
		await waitFor(
			() => {
				expect(screen.getByText("Source code tersinkron")).toBeDefined();
			},
			{ timeout: 10000, interval: 100 },
		);
		const card = screen.getByTestId("sync-card");
		expect(card).not.toBeNull();
		const cta = card.querySelector(
			'[data-testid="plan-continue-to-summary"]',
		) as HTMLButtonElement | null;
		expect(cta).not.toBeNull();
		await waitFor(
			() => {
				expect(cta?.disabled).toBe(false);
			},
			{ timeout: 10000, interval: 100 },
		);
	});

	it("renders the canonical CodebaseReview with real analysis values in the final step", {
		timeout: 20000,
	}, async () => {
		mockOnboardingFlow();
		await startSyncing();
		await waitFor(
			() => {
				const card = screen.queryByTestId("sync-card");
				const cta = card?.querySelector(
					'[data-testid="plan-continue-to-summary"]',
				) as HTMLButtonElement | null;
				expect(cta?.disabled).toBe(false);
			},
			{ timeout: 12000, interval: 100 },
		);
		(
			screen
				.getByTestId("sync-card")
				.querySelector(
					'[data-testid="plan-continue-to-summary"]',
				) as HTMLButtonElement
		).click();
		await waitFor(
			() => {
				expect(screen.getByText("Detected environment")).toBeDefined();
			},
			{ timeout: 6000, interval: 100 },
		);
		expect(screen.getByText("TanStack Start")).toBeDefined();
		expect(screen.getByText("TypeScript")).toBeDefined();
		expect(screen.getByText("PostgreSQL")).toBeDefined();
		expect(screen.queryByText("Snapshot siap")).toBeNull();
	});

	it("recovered uploaded state without ready analysis stays on sync instead of jumping to summary", {
		timeout: 20000,
	}, async () => {
		try {
			sessionStorage.setItem("prdfy:plan-codebase-id", "cb-onboard-1");
			sessionStorage.setItem("prdfy:plan-codebase-name", "Onboard Repo");
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
						json: async () => uploadedStatus(),
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
						json: async () => ({
							...analysisReadyPayload(),
							status: "pending",
							output: null,
						}),
					};
				}
				if (
					url.startsWith("/api/v1/projects/proj-onboard-1/codebase/analysis")
				) {
					return Response.json(
						{ error: "Belum ada analisis codebase" },
						{ status: 404 },
					);
				}
				throw new Error(`unexpected fetch ${method} ${url}`);
			}),
		);
		render(<PlanCodebasePage />);
		await waitFor(
			() => {
				expect(screen.getByText("Source code tersinkron")).toBeDefined();
			},
			{ timeout: 10000, interval: 100 },
		);
		expect(screen.queryByTestId("codebase-sync-summary")).toBeNull();
	});

	it("review-to-sync back navigation stays on sync despite server already ready", {
		timeout: 20000,
	}, async () => {
		mockOnboardingFlow();
		await startSyncing();
		await waitFor(
			() => {
				const card = screen.queryByTestId("sync-card");
				const cta = card?.querySelector(
					'[data-testid="plan-continue-to-summary"]',
				) as HTMLButtonElement | null;
				expect(cta?.disabled).toBe(false);
			},
			{ timeout: 12000, interval: 100 },
		);
		(
			screen
				.getByTestId("sync-card")
				.querySelector(
					'[data-testid="plan-continue-to-summary"]',
				) as HTMLButtonElement
		).click();
		await waitFor(() => {
			expect(screen.getByText("Detected environment")).toBeDefined();
		});
		screen.getByRole("button", { name: /Kembali ke Sinkronisasi/i }).click();
		await waitFor(() => {
			expect(screen.getByText("Sync codebase")).toBeDefined();
		});
		expect(screen.queryByText("Detected environment")).toBeNull();
		await waitFor(
			() => {
				expect(screen.getByText("Analisis codebase selesai")).toBeDefined();
			},
			{ timeout: 10000, interval: 100 },
		);
		expect(screen.queryByText("Detected environment")).toBeNull();
	});
});
