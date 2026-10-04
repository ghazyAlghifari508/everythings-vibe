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

function mockPlanFlow(statuses: Array<Record<string, unknown>>) {
	let statusCalls = 0;
	const fetchMock = vi.fn(async (input: unknown) => {
		const url = String(input);
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
			return { ok: true, status: 200, json: async () => payload };
		}
		throw new Error(`unexpected fetch ${url}`);
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

	it("uploaded observed live does not auto-advance away from Pantau Sync", async () => {
		const flow = mockPlanFlow([waitingPayload(), uploadedPayload()]);
		await startSyncing();
		await waitFor(
			() => {
				expect(
					screen.getByText("Snapshot terkirim dan terverifikasi"),
				).toBeDefined();
			},
			{ timeout: 6000, interval: 100 },
		);
		expect(flow.getStatusCalls()).toBeGreaterThanOrEqual(2);
		expect(screen.queryByTestId("codebase-sync-summary")).toBeNull();
	});

	it("analyzing observed live does not auto-advance away from Pantau Sync", async () => {
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
				expect(screen.getByText("Menyusun analisis codebase")).toBeDefined();
			},
			{ timeout: 6000, interval: 100 },
		);
		expect(screen.queryByTestId("codebase-sync-summary")).toBeNull();
	});

	it("ready without analysis output does not render the analysis review", async () => {
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
				expect(screen.getByText("Analisis codebase selesai")).toBeDefined();
			},
			{ timeout: 6000, interval: 100 },
		);
		expect(screen.queryByTestId("codebase-sync-summary")).toBeNull();
		expect(screen.queryByText("Detected environment")).toBeNull();
	});

	it("explicit snapshot-ready continue advances sync to the snapshot handoff", async () => {
		mockPlanFlow([waitingPayload(), uploadedPayload()]);
		await startSyncing();
		await waitFor(
			() => {
				expect(screen.getByTestId("plan-continue-to-summary")).toBeDefined();
			},
			{ timeout: 6000, interval: 100 },
		);
		screen.getByTestId("plan-continue-to-summary").click();
		await waitFor(() => {
			expect(screen.getByTestId("codebase-sync-summary")).toBeDefined();
		});
		expect(screen.getByText("snap-nav-1")).toBeDefined();
	});

	it("manual Back to Pantau Sync sticks across later polls without flicker", async () => {
		mockPlanFlow([waitingPayload(), uploadedPayload()]);
		await startSyncing();
		await waitFor(
			() => {
				expect(screen.getByTestId("plan-continue-to-summary")).toBeDefined();
			},
			{ timeout: 6000, interval: 100 },
		);
		screen.getByTestId("plan-continue-to-summary").click();
		await waitFor(() => {
			expect(screen.getByTestId("codebase-sync-summary")).toBeDefined();
		});
		screen.getByRole("button", { name: /Kembali ke Pantau Sync/i }).click();
		await waitFor(() => {
			expect(screen.getByText("Sync codebase")).toBeDefined();
		});
		expect(screen.queryByTestId("codebase-sync-summary")).toBeNull();
		await waitFor(
			() => {
				expect(
					screen.getByText("Snapshot terkirim dan terverifikasi"),
				).toBeDefined();
			},
			{ timeout: 6000, interval: 100 },
		);
		expect(screen.queryByTestId("codebase-sync-summary")).toBeNull();
	});

	it("explicit return from sync to the handoff stays allowed while the snapshot is valid", async () => {
		mockPlanFlow([waitingPayload(), uploadedPayload()]);
		await startSyncing();
		await waitFor(
			() => {
				expect(screen.getByTestId("plan-continue-to-summary")).toBeDefined();
			},
			{ timeout: 6000, interval: 100 },
		);
		screen.getByTestId("plan-continue-to-summary").click();
		await waitFor(() => {
			expect(screen.getByTestId("codebase-sync-summary")).toBeDefined();
		});
		screen.getByRole("button", { name: /Kembali ke Pantau Sync/i }).click();
		await waitFor(() => {
			expect(screen.getByTestId("plan-continue-to-summary")).toBeDefined();
		});
		screen.getByTestId("plan-continue-to-summary").click();
		await waitFor(() => {
			expect(screen.getByTestId("codebase-sync-summary")).toBeDefined();
		});
	});

	it("snapshot handoff never claims to be the analysis conclusion", async () => {
		mockPlanFlow([waitingPayload(), uploadedPayload()]);
		await startSyncing();
		await waitFor(
			() => {
				expect(screen.getByTestId("plan-continue-to-summary")).toBeDefined();
			},
			{ timeout: 6000, interval: 100 },
		);
		screen.getByTestId("plan-continue-to-summary").click();
		await waitFor(() => {
			expect(screen.getByTestId("codebase-sync-summary")).toBeDefined();
		});
		expect(
			screen.queryByText("Kesimpulan Analisis Codebase & Stack"),
		).toBeNull();
		expect(screen.getByText("snap-nav-1")).toBeDefined();
	});
});
