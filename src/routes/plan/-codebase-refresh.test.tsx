// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	PLAN_CODEBASE_ID_STORAGE_KEY,
	PLAN_CODEBASE_NAME_STORAGE_KEY,
	PLAN_CODEBASE_PROJECT_STORAGE_KEY,
	PLAN_CODEBASE_STEP_STORAGE_KEY,
} from "@/lib/codebase-sync";
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

const OUTPUT = {
	projectId: "proj-refresh-1",
	snapshotId: "snap-refresh-1",
	framework: "TanStack Start",
	language: "TypeScript",
};

interface RecoveryCase {
	codebaseId: string;
	/** Persisted navigation intent, absent when the user never chose one. */
	storedStep?: string;
	status: Record<string, unknown>;
	/** Analysis POST response; omitted means the attempt stays pending. */
	analysis?: Record<string, unknown>;
}

function seed(pointers: {
	codebaseId: string;
	name?: string;
	projectId?: string;
	step?: string;
}) {
	sessionStorage.setItem(PLAN_CODEBASE_ID_STORAGE_KEY, pointers.codebaseId);
	sessionStorage.setItem(
		PLAN_CODEBASE_NAME_STORAGE_KEY,
		pointers.name ?? "Refresh Repo",
	);
	if (pointers.projectId) {
		sessionStorage.setItem(
			PLAN_CODEBASE_PROJECT_STORAGE_KEY,
			pointers.projectId,
		);
	}
	if (pointers.step) {
		sessionStorage.setItem(PLAN_CODEBASE_STEP_STORAGE_KEY, pointers.step);
	}
}

function mockRecovery(input: RecoveryCase) {
	const fetchMock = vi.fn(async (raw: unknown, init?: RequestInit) => {
		const url = String(raw);
		const method = init?.method ?? "GET";
		if (url.includes(`/api/codebases/${input.codebaseId}/status`)) {
			return {
				ok: true,
				status: 200,
				json: async () => input.status,
			};
		}
		if (url.endsWith("/features") && method === "POST") {
			return {
				ok: true,
				status: 200,
				json: async () => ({
					projectId: "proj-refresh-1",
					name: "Refresh Repo",
				}),
			};
		}
		if (url.includes("/codebase/analysis") && method === "POST") {
			return {
				ok: true,
				status: 200,
				json: async () =>
					input.analysis ?? {
						id: "ana-refresh-1",
						projectId: "proj-refresh-1",
						snapshotId: "snap-refresh-1",
						status: "pending",
						output: null,
					},
			};
		}
		if (url.includes("/codebase/analysis")) {
			// The read boundary reports whatever the server persisted for this
			// snapshot; a case with no stored analysis stays honestly pending.
			return {
				ok: true,
				status: 200,
				json: async () =>
					input.analysis ?? {
						id: "ana-refresh-1",
						projectId: "proj-refresh-1",
						snapshotId: "snap-refresh-1",
						status: "pending",
						output: null,
					},
			};
		}
		if (url.endsWith("/session") && method === "POST") {
			return {
				ok: true,
				status: 200,
				json: async () => ({
					projectId: input.codebaseId,
					apiBaseUrl: "http://localhost:3000",
					syncToken: `fresh-${input.codebaseId}`,
					syncCommand: "vibeeverything codebase sync",
					expiresAt: new Date(Date.now() + 3600000).toISOString(),
				}),
			};
		}
		throw new Error(`unexpected fetch ${method} ${url}`);
	});
	vi.stubGlobal("fetch", fetchMock);
	return fetchMock;
}

describe("PlanCodebasePage refresh recovery matrix", () => {
	beforeEach(() => {
		useUIStore.getState().setCodebasePlanStep("sync");
		sessionStorage.clear();
	});

	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
		sessionStorage.clear();
	});

	it("recovers an active sync attempt with the live prompt and stages", async () => {
		seed({ codebaseId: "cb-refresh-wait", step: "sync" });
		const fetchMock = mockRecovery({
			codebaseId: "cb-refresh-wait",
			status: {
				projectId: "cb-refresh-wait",
				sessionId: "sess-refresh-wait",
				status: "uploading",
				snapshotId: null,
				cliConnectedAt: "2026-09-19T10:00:00.000Z",
			},
		});

		render(<PlanCodebasePage />);

		await waitFor(
			() => {
				expect(screen.getByText("Agent terhubung")).toBeDefined();
			},
			{ timeout: 15000, interval: 100 },
		);
		expect(screen.getByText("Menyinkronkan codebase...")).toBeDefined();
		expect(
			(screen.getByTestId("sync-continue-to-summary") as HTMLButtonElement)
				.disabled,
		).toBe(true);
		// A mid-attempt refresh must not mint a second codebase.
		expect(fetchMock).not.toHaveBeenCalledWith(
			"/api/codebases",
			expect.objectContaining({ method: "POST" }),
		);
	}, 20000);

	it("recovers a completed sync while the user was still on the sync step", async () => {
		seed({ codebaseId: "cb-refresh-done", step: "sync" });
		mockRecovery({
			codebaseId: "cb-refresh-done",
			status: {
				projectId: "cb-refresh-done",
				sessionId: "sess-refresh-done",
				status: "uploaded",
				snapshotId: "snap-refresh-1",
				fileCount: 42,
				analysisStatus: "pending",
			},
		});

		render(<PlanCodebasePage />);

		// The stored intent is honoured: the user comes back to the completed
		// sync state they were watching, not to a step they never reached.
		await waitFor(
			() => {
				expect(screen.getByText("Sinkronisasi selesai")).toBeDefined();
			},
			{ timeout: 15000, interval: 100 },
		);
		expect(
			(screen.getByTestId("sync-continue-to-summary") as HTMLButtonElement)
				.disabled,
		).toBe(false);
	}, 20000);

	it("recovers a pending analysis on the conclusion step", async () => {
		seed({
			codebaseId: "cb-refresh-pending",
			step: "summary",
			projectId: "proj-refresh-1",
		});
		mockRecovery({
			codebaseId: "cb-refresh-pending",
			status: {
				projectId: "cb-refresh-pending",
				sessionId: "sess-refresh-pending",
				status: "uploaded",
				snapshotId: "snap-refresh-1",
				fileCount: 42,
				analysisStatus: "pending",
			},
		});

		render(<PlanCodebasePage />);

		await waitFor(
			() => {
				expect(screen.getByTestId("codebase-analysis-pending")).not.toBeNull();
			},
			{ timeout: 15000, interval: 100 },
		);
		// The workspace opens on the snapshot, without waiting for the model.
		expect(
			(screen.getByTestId("conclusion-enter-workspace") as HTMLButtonElement)
				.disabled,
		).toBe(false);
	}, 20000);

	it("recovers a ready analysis straight into the review", async () => {
		seed({
			codebaseId: "cb-refresh-ready",
			step: "summary",
			projectId: "proj-refresh-1",
		});
		mockRecovery({
			codebaseId: "cb-refresh-ready",
			status: {
				projectId: "cb-refresh-ready",
				sessionId: "sess-refresh-ready",
				status: "uploaded",
				snapshotId: "snap-refresh-1",
				fileCount: 42,
				analysisStatus: "ready",
			},
			analysis: {
				id: "ana-refresh-1",
				projectId: "proj-refresh-1",
				snapshotId: "snap-refresh-1",
				status: "ready",
				output: OUTPUT,
			},
		});

		render(<PlanCodebasePage />);

		await waitFor(
			() => {
				expect(screen.getByText("Detected environment")).toBeDefined();
			},
			{ timeout: 15000, interval: 100 },
		);
		expect(screen.getByText("TanStack Start")).toBeDefined();
	}, 20000);

	it("rejects a conclusion intent that the server cannot support", async () => {
		// Stored intent says the conclusion step, but no snapshot exists for the
		// current attempt. A summary must never be faked for work that cannot run.
		seed({ codebaseId: "cb-refresh-bogus", step: "summary" });
		mockRecovery({
			codebaseId: "cb-refresh-bogus",
			status: {
				projectId: "cb-refresh-bogus",
				sessionId: "sess-refresh-bogus",
				status: "waiting_for_cli",
				snapshotId: null,
			},
		});

		render(<PlanCodebasePage />);

		await waitFor(
			() => {
				expect(screen.getByTestId("sync-continue-to-summary")).toBeDefined();
			},
			{ timeout: 15000, interval: 100 },
		);
		expect(screen.queryByTestId("codebase-sync-summary")).toBeNull();
		await waitFor(
			() => {
				expect(screen.getByText("Paste prompt lalu jalankan")).toBeDefined();
			},
			{ timeout: 15000, interval: 100 },
		);
		expect(screen.queryByText("Menunggu agent")).toBeNull();
		expect(document.querySelectorAll("[data-stage-state]")).toHaveLength(0);
	}, 20000);

	it("maps a retired three-step pointer onto the sync step", async () => {
		// A session stored before the collapse must not strand the user.
		seed({ codebaseId: "cb-refresh-legacy", step: "syncing" });
		mockRecovery({
			codebaseId: "cb-refresh-legacy",
			status: {
				projectId: "cb-refresh-legacy",
				sessionId: "sess-refresh-legacy",
				status: "uploading",
				snapshotId: null,
				cliConnectedAt: "2026-09-19T10:00:00.000Z",
			},
		});

		render(<PlanCodebasePage />);

		await waitFor(
			() => {
				expect(
					screen.getByText("Sync codebase dengan VibeEverything"),
				).toBeDefined();
			},
			{ timeout: 15000, interval: 100 },
		);
		expect(screen.queryByTestId("codebase-sync-summary")).toBeNull();
	}, 20000);
});
