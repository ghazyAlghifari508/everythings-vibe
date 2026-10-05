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

const ANALYSIS_OUTPUT = {
	projectId: "proj-live-1",
	snapshotId: "snap-live-1",
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

describe("PlanCodebasePage live sync reconciliation", () => {
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

	it("mounted Pantau Sync detects the uploaded snapshot without refresh and waits for explicit continue", {
		timeout: 20000,
	}, async () => {
		const syncPayload = {
			projectId: "cb-live-1",
			apiBaseUrl: "http://localhost:3000",
			syncToken: "live-token-1",
			syncCommand:
				"vibeeverything codebase sync --project-id cb-live-1 --sync-token live-token-1",
			expiresAt: new Date(Date.now() + 3600000).toISOString(),
		};
		let statusCalls = 0;
		let analysisTriggered = false;
		vi.stubGlobal(
			"fetch",
			vi.fn(async (input: unknown, init?: { method?: string }) => {
				const url = String(input);
				const method = init?.method ?? "GET";
				if (url === "/api/codebases" && (!init || !init.method)) {
					return {
						ok: true,
						status: 200,
						json: async () => ({
							id: "cb-live-1",
							name: "Live Repo",
							sync: syncPayload,
						}),
					};
				}
				if (url === "/api/codebases" && init?.method === "POST") {
					return {
						ok: true,
						status: 200,
						json: async () => ({
							id: "cb-live-1",
							name: "Live Repo",
							sync: syncPayload,
						}),
					};
				}
				if (url.includes("/api/codebases/cb-live-1/status")) {
					statusCalls += 1;
					if (statusCalls === 1) {
						return {
							ok: true,
							status: 200,
							json: async () => ({
								projectId: "cb-live-1",
								sessionId: "sess-live-1",
								status: "waiting_for_cli",
								snapshotId: null,
							}),
						};
					}
					return {
						ok: true,
						status: 200,
						json: async () => ({
							projectId: "cb-live-1",
							sessionId: "sess-live-1",
							status: "uploaded",
							snapshotId: "snap-live-1",
							fileCount: 37,
							excludedCount: 6,
							...(analysisTriggered
								? { analysisStatus: "ready" as const }
								: {}),
						}),
					};
				}
				if (url === "/api/codebases/cb-live-1/features" && method === "POST") {
					return {
						ok: true,
						status: 200,
						json: async () => ({
							projectId: "proj-live-1",
							name: "Live Repo",
						}),
					};
				}
				if (
					url === "/api/v1/projects/proj-live-1/codebase/analysis" &&
					method === "POST"
				) {
					analysisTriggered = true;
					return {
						ok: true,
						status: 200,
						json: async () => ({
							id: "ana-live-1",
							projectId: "proj-live-1",
							snapshotId: "snap-live-1",
							status: "ready",
							output: ANALYSIS_OUTPUT,
						}),
					};
				}
				if (url.startsWith("/api/v1/projects/proj-live-1/codebase/analysis")) {
					return {
						ok: true,
						status: 200,
						json: async () => ({
							id: "ana-live-1",
							projectId: "proj-live-1",
							snapshotId: "snap-live-1",
							status: "ready",
							output: ANALYSIS_OUTPUT,
						}),
					};
				}
				throw new Error(`unexpected fetch ${method} ${url}`);
			}),
		);

		render(<PlanCodebasePage />);

		await waitFor(() => {
			expect(
				screen.getByText("Sync codebase dengan VibeEverything"),
			).toBeDefined();
		});

		// The gate waits for the canonical poll interval, so allow for it.
		const monitorButton = await waitFor(
			() => {
				const cta = screen.getByTestId(
					"prompt-continue-to-sync",
				) as HTMLButtonElement;
				expect(cta.disabled).toBe(false);
				return cta;
			},
			{ timeout: 15000, interval: 100 },
		);
		monitorButton.click();

		await waitFor(() => {
			expect(screen.getByText("Sync codebase")).toBeDefined();
		});

		await waitFor(
			() => {
				expect(screen.getByText("Source code tersinkron")).toBeDefined();
			},
			{ timeout: 10000, interval: 100 },
		);
		expect(statusCalls).toBeGreaterThanOrEqual(2);
		expect(screen.queryByTestId("codebase-sync-summary")).toBeNull();
		expect(screen.queryByText("Snapshot siap")).toBeNull();
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
		expect(screen.getByText("snap-live-1")).toBeDefined();
	});
});
