// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useUIStore } from "@/store";
import { PlanCodebasePage } from "./codebase";

const mockNavigate = vi.fn();

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

const RECOVER_OUTPUT = {
	projectId: "proj-recover-1",
	snapshotId: "snap-recover-1",
	framework: "TanStack Start",
	language: "TypeScript",
	starterSuggestions: VALID_STARTER_SUGGESTIONS,
};

function readyAnalysis(
	overrides: Record<string, unknown> = {},
): Record<string, unknown> {
	return {
		id: "ana-recover-1",
		projectId: "proj-recover-1",
		snapshotId: "snap-recover-1",
		status: "ready",
		output: RECOVER_OUTPUT,
		...overrides,
	};
}

vi.mock("@tanstack/react-router", () => ({
	createFileRoute: () => (options: unknown) => options,
	useNavigate: () => mockNavigate,
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

describe("PlanCodebasePage Loading Spinner & Flow Contract", () => {
	beforeEach(() => {
		useUIStore.getState().setCodebasePlanStep("sync");
		mockNavigate.mockReset();
		try {
			sessionStorage.clear();
		} catch {
			// jsdom without storage still runs the fresh-create path.
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

	it("renders vertically and horizontally centered loading spinner before prompt sync arrives", () => {
		// Mock fetch that hangs to inspect the initial loading state
		vi.stubGlobal(
			"fetch",
			vi.fn(() => new Promise(() => {})),
		);

		const { container } = render(<PlanCodebasePage />);

		// Spinner and text exist
		expect(screen.getByText("Menyiapkan sesi sync...")).toBeDefined();
		expect(
			screen.getByText(
				"Menghubungkan repository dan menginisialisasi instruksi CLI",
			),
		).toBeDefined();

		// Check centering layout classes on container
		const centeringWrapper = container.querySelector(
			".flex.flex-1.items-center.justify-center.min-h-\\[50vh\\]",
		);
		expect(centeringWrapper).not.toBeNull();

		// Check the spinner element itself
		const spinner = container.querySelector(".animate-spin");
		expect(spinner).not.toBeNull();
		expect(spinner?.classList.contains("border-t-indigo")).toBe(true);
	});

	it("transitions to ScreenConnect prompt sync once codebase session is created", async () => {
		const mockSyncPayload = {
			projectId: "cb-123",
			apiBaseUrl: "http://localhost:3000",
			syncToken: "test-token-abc",
			syncCommand:
				"vibeeverything codebase sync --project-id cb-123 --token test-token-abc",
			expiresAt: new Date(Date.now() + 3600000).toISOString(),
		};

		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({
				ok: true,
				status: 200,
				json: async () => ({
					id: "cb-123",
					name: "my-existing-app",
					sync: mockSyncPayload,
				}),
			}),
		);

		render(<PlanCodebasePage />);

		// Wait for ScreenConnect to mount
		await waitFor(() => {
			expect(
				screen.getByText("Sync codebase dengan VibeEverything"),
			).toBeDefined();
		});

		// Loading spinner wrapper is no longer in the DOM
		expect(screen.queryByText("Menyiapkan sesi sync...")).toBeNull();
	});

	it("displays error banner and retry button if codebase creation fails", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockRejectedValue(new Error("Network connection lost")),
		);

		render(<PlanCodebasePage />);

		await waitFor(() => {
			expect(screen.getByText("Server tidak dapat dihubungi.")).toBeDefined();
		});

		expect(screen.getByRole("button", { name: "Coba lagi" })).toBeDefined();
	});

	it("recovers uploaded persisted state after refresh without creating a new codebase", {
		timeout: 20000,
	}, async () => {
		try {
			sessionStorage.setItem("prdfy:plan-codebase-id", "cb-recover-1");
			sessionStorage.setItem("prdfy:plan-codebase-name", "Recovered Repo");
		} catch {
			// Storage unavailable still exercises the fresh path below.
		}
		let analysisTriggered = false;
		const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
			const url = String(input);
			const method = init?.method ?? "GET";
			if (url.includes("/status")) {
				return {
					ok: true,
					status: 200,
					json: async () => ({
						projectId: "cb-recover-1",
						sessionId: "sess-recover-1",
						status: "uploaded",
						snapshotId: "snap-recover-1",
						fileCount: 37,
						excludedCount: 5,
						...(analysisTriggered
							? {
									analysisStatus: "ready" as const,
									analysisId: "ana-recover-1",
								}
							: {}),
					}),
				};
			}
			if (url.endsWith("/features") && method === "POST") {
				return {
					ok: true,
					status: 200,
					json: async () => ({
						projectId: "proj-recover-1",
						name: "Recovered Repo",
					}),
				};
			}
			if (url.endsWith("/codebase/analysis") && method === "POST") {
				analysisTriggered = true;
				return {
					ok: true,
					status: 200,
					json: async () => readyAnalysis(),
				};
			}
			if (url.includes("/codebase/analysis")) {
				return {
					ok: true,
					status: 200,
					json: async () => readyAnalysis(),
				};
			}
			throw new Error(`unexpected fetch ${method} ${url}`);
		});
		vi.stubGlobal("fetch", fetchMock);

		render(<PlanCodebasePage />);

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
		expect(fetchMock).not.toHaveBeenCalledWith(
			"/api/codebases",
			expect.objectContaining({ method: "POST" }),
		);
		await waitFor(
			() => {
				expect(analysisTriggered).toBe(true);
			},
			{ timeout: 10000, interval: 100 },
		);
		await waitFor(() => {
			expect(cta.disabled).toBe(false);
		});
		cta.click();
		await waitFor(
			() => {
				expect(screen.getByText("Detected environment")).toBeDefined();
			},
			{ timeout: 10000, interval: 100 },
		);
	});

	it("recovers directly to the validated review when analysis output is already stored", {
		timeout: 20000,
	}, async () => {
		try {
			sessionStorage.setItem("prdfy:plan-codebase-id", "cb-recover-2");
			sessionStorage.setItem("prdfy:plan-codebase-name", "Recovered Repo");
			sessionStorage.setItem(
				"prdfy:plan-codebase-project-id",
				"proj-recover-2",
			);
			sessionStorage.setItem("prdfy:plan-codebase-step", "summary");
		} catch {
			// Best-effort only.
		}
		const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
			const url = String(input);
			const method = init?.method ?? "GET";
			if (url.includes("/status")) {
				return {
					ok: true,
					status: 200,
					json: async () => ({
						projectId: "cb-recover-2",
						sessionId: "sess-recover-2",
						status: "uploaded",
						snapshotId: "snap-recover-2",
						analysisId: "ana-recover-2",
						analysisStatus: "ready" as const,
						fileCount: 12,
						excludedCount: 1,
					}),
				};
			}
			if (url.includes("/codebase/analysis")) {
				return {
					ok: true,
					status: 200,
					json: async () => ({
						id: "ana-recover-2",
						projectId: "proj-recover-2",
						snapshotId: "snap-recover-2",
						status: "ready",
						output: {
							projectId: "proj-recover-2",
							snapshotId: "snap-recover-2",
							framework: "TanStack Start",
							language: "TypeScript",
							starterSuggestions: VALID_STARTER_SUGGESTIONS,
						},
					}),
				};
			}
			throw new Error(`unexpected fetch ${method} ${url}`);
		});
		vi.stubGlobal("fetch", fetchMock);

		render(<PlanCodebasePage />);

		await waitFor(
			() => {
				expect(screen.getByText("Detected environment")).toBeDefined();
			},
			{ timeout: 10000, interval: 100 },
		);
		expect(screen.getByText("TanStack Start")).toBeDefined();
		expect(fetchMock).not.toHaveBeenCalledWith(
			"/api/codebases",
			expect.objectContaining({ method: "POST" }),
		);
	});

	it("recovers an uploaded session with pending analysis into Sync screen with Next disabled", {
		timeout: 20000,
	}, async () => {
		try {
			sessionStorage.setItem("prdfy:plan-codebase-id", "cb-ws-1");
			sessionStorage.setItem("prdfy:plan-codebase-name", "Workspace Repo");
			sessionStorage.setItem("prdfy:plan-codebase-step", "summary");
		} catch {
			// Storage unavailable still exercises the fresh path below.
		}
		const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
			const url = String(input);
			const method = init?.method ?? "GET";
			if (url.includes("/status")) {
				return {
					ok: true,
					status: 200,
					json: async () => ({
						projectId: "cb-ws-1",
						sessionId: "sess-ws-1",
						status: "uploaded",
						snapshotId: "snap-ws-1",
						fileCount: 37,
						excludedCount: 5,
						analysisStatus: "pending" as const,
					}),
				};
			}
			if (url.endsWith("/features") && method === "POST") {
				return {
					ok: true,
					status: 200,
					json: async () => ({
						projectId: "proj-ws-1",
						name: "Workspace Repo",
					}),
				};
			}
			if (url.endsWith("/codebase/analysis") && method === "POST") {
				// Real pending analysis: no output yet, so the review stays closed.
				return {
					ok: true,
					status: 200,
					json: async () => ({
						id: "ana-ws-1",
						projectId: "proj-ws-1",
						snapshotId: "snap-ws-1",
						status: "pending",
						output: null,
					}),
				};
			}
			throw new Error(`unexpected fetch ${method} ${url}`);
		});
		vi.stubGlobal("fetch", fetchMock);

		render(<PlanCodebasePage />);

		// An uploaded snapshot with pending analysis recovers to Sync screen
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
		expect(screen.queryByText(/Sync gagal/i)).toBeNull();
	});

	it("mints a fresh token when recovering a waiting session without a payload", async () => {
		try {
			sessionStorage.setItem("prdfy:plan-codebase-id", "cb-wait-1");
			sessionStorage.setItem("prdfy:plan-codebase-name", "Waiting Repo");
		} catch {
			// Best-effort only.
		}
		const freshPayload = {
			projectId: "cb-wait-1",
			apiBaseUrl: "http://localhost:3000",
			syncToken: "fresh-token-xyz",
			syncCommand:
				"vibeeverything codebase sync --project-id cb-wait-1 --sync-token <token>",
			expiresAt: new Date(Date.now() + 3600000).toISOString(),
		};
		vi.stubGlobal(
			"fetch",
			vi.fn(async (input: unknown, init?: { method?: string }) => {
				const url = String(input);
				if (url.includes("/status")) {
					return {
						ok: true,
						status: 200,
						json: async () => ({
							projectId: "cb-wait-1",
							sessionId: "sess-wait-1",
							status: "waiting_for_cli",
							snapshotId: null,
						}),
					};
				}
				if (url.endsWith("/session") && init?.method === "POST") {
					return {
						ok: true,
						status: 200,
						json: async () => freshPayload,
					};
				}
				throw new Error(`unexpected fetch ${url}`);
			}),
		);

		render(<PlanCodebasePage />);

		await waitFor(() => {
			expect(
				screen.getByText("Sync codebase dengan VibeEverything"),
			).toBeDefined();
		});
		expect(screen.getByText(/fresh-token-xyz/)).toBeDefined();
	});
});
