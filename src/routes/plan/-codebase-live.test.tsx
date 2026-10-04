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

	it("mounted Pantau Sync receives uploaded snapshot and shows summary without refresh", async () => {
		const syncPayload = {
			projectId: "cb-live-1",
			apiBaseUrl: "http://localhost:3000",
			syncToken: "live-token-1",
			syncCommand:
				"vibeeverything codebase sync --project-id cb-live-1 --sync-token live-token-1",
			expiresAt: new Date(Date.now() + 3600000).toISOString(),
		};
		let statusCalls = 0;
		vi.stubGlobal(
			"fetch",
			vi.fn(async (input: unknown, init?: { method?: string }) => {
				const url = String(input);
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
						}),
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

		const monitorButton = screen.getByRole("button", {
			name: /Lanjut ke Pantau Sync/i,
		});
		monitorButton.click();

		await waitFor(
			() => {
				expect(screen.getByTestId("codebase-sync-summary")).toBeDefined();
			},
			{ timeout: 6000, interval: 100 },
		);
		expect(screen.getByText("snap-live-1")).toBeDefined();
		expect(statusCalls).toBeGreaterThanOrEqual(2);
	});
});
