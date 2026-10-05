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

function syncPayload() {
	return {
		projectId: "cb-intent-1",
		apiBaseUrl: "http://localhost:3000",
		syncToken: "intent-token",
		syncCommand:
			"vibeeverything codebase sync --project-id cb-intent-1 --sync-token intent-token",
		expiresAt: new Date(Date.now() + 3600000).toISOString(),
	};
}

describe("PlanCodebasePage onboarding feature intent", () => {
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

	it("sends the neutral onboarding intent instead of the provisional placeholder", async () => {
		const featureBodies: unknown[] = [];
		vi.stubGlobal(
			"fetch",
			vi.fn(
				async (input: unknown, init?: { method?: string; body?: string }) => {
					const url = String(input);
					const method = init?.method ?? "GET";
					if (url === "/api/codebases" && method === "POST") {
						return {
							ok: true,
							status: 200,
							json: async () => ({
								id: "cb-intent-1",
								name: "Repository Lokal",
								sync: syncPayload(),
							}),
						};
					}
					if (url.includes("/api/codebases/cb-intent-1/status")) {
						return {
							ok: true,
							status: 200,
							json: async () => ({
								projectId: "cb-intent-1",
								sessionId: "sess-intent-1",
								status: "uploaded",
								snapshotId: "snap-intent-1",
								fileCount: 4,
								excludedCount: 1,
							}),
						};
					}
					if (
						url === "/api/codebases/cb-intent-1/features" &&
						method === "POST"
					) {
						featureBodies.push(init?.body ? JSON.parse(init.body) : null);
						return {
							ok: true,
							status: 200,
							json: async () => ({
								projectId: "proj-intent-1",
								name: "Ringkasan Codebase",
							}),
						};
					}
					if (
						url === "/api/v1/projects/proj-intent-1/codebase/analysis" &&
						method === "POST"
					) {
						return {
							ok: true,
							status: 200,
							json: async () => ({
								id: "ana-intent-1",
								projectId: "proj-intent-1",
								snapshotId: "snap-intent-1",
								status: "pending",
							}),
						};
					}
					throw new Error(`unexpected fetch ${method} ${url}`);
				},
			),
		);

		render(<PlanCodebasePage />);
		await waitFor(() => {
			expect(
				screen.getByText("Sync codebase dengan VibeEverything"),
			).toBeDefined();
		});

		await waitFor(
			() => {
				expect(featureBodies.length).toBeGreaterThan(0);
			},
			{ timeout: 15000, interval: 100 },
		);
		// The provisional creation label must never become feature intent.
		for (const body of featureBodies) {
			expect(body).toMatchObject({ message: "Ringkasan codebase awal" });
			expect(JSON.stringify(body)).not.toContain("Repository Lokal");
		}
	}, 20000);
});
