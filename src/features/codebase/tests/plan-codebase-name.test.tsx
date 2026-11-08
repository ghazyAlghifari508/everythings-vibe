// @vitest-environment jsdom
import { cleanup, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useUIStore } from "@/store";
import { renderConnectedOnboarding } from "./render-connected-onboarding";

vi.mock("@/features/billing/hooks/use-user-plan", () => ({
	useUserPlan: () => ({ data: undefined, refetch: vi.fn() }),
}));
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

const PLACEHOLDER = "Repository Lokal";
const DETECTED_NAME = "react-movie-app";

function syncPayload() {
	return {
		projectId: "cb-name-1",
		apiBaseUrl: "http://localhost:3000",
		syncToken: "name-token-1",
		syncCommand:
			"everythings-vibe codebase sync --project-id cb-name-1 --sync-token name-token-1",
		expiresAt: new Date(Date.now() + 3600000).toISOString(),
	};
}

describe("PlanCodebasePage repository name", () => {
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

	it("never presents a repository identity in the sync header, not even the provisional name", async () => {
		let statusCalls = 0;
		vi.stubGlobal(
			"fetch",
			vi.fn(async (input: unknown, init?: { method?: string }) => {
				const url = String(input);
				const method = init?.method ?? "GET";
				if (url === "/api/codebases" && method === "POST") {
					return {
						ok: true,
						status: 200,
						json: async () => ({
							id: "cb-name-1",
							name: PLACEHOLDER,
							sync: syncPayload(),
						}),
					};
				}
				if (url.includes("/api/codebases/cb-name-1/status")) {
					statusCalls += 1;
					return {
						ok: true,
						status: 200,
						json: async () => ({
							projectId: "cb-name-1",
							sessionId: "sess-name-1",
							// The server can only learn the name once the CLI has
							// handshaken, so the session advances before it reports one.
							status: statusCalls > 1 ? "connected" : "waiting_for_cli",
							snapshotId: null,
							...(statusCalls > 1
								? { codebaseName: DETECTED_NAME }
								: { codebaseName: PLACEHOLDER }),
						}),
					};
				}
				throw new Error(`unexpected fetch ${method} ${url}`);
			}),
		);

		await renderConnectedOnboarding();

		await waitFor(() => {
			expect(
				screen.getByText("Sync codebase dengan everythings-vibe"),
			).toBeDefined();
		});
		// No eyebrow exists any more: a placeholder is never presented as the
		// repository, and neither is a detected name on this screen. Identity
		// belongs to History/Workspace once the CLI has identified it.
		const headerText = document.body.textContent ?? "";
		expect(headerText).not.toContain("Project /");
		expect(headerText).not.toContain("Repository belum terdeteksi");
		expect(headerText).not.toContain(PLACEHOLDER);

		// The handshake still reaches the screen: the sync progress row reports
		// the agent instead of a fabricated identity.
		await waitFor(
			() => {
				expect(document.body.textContent).toContain("Agent terhubung");
			},
			{ timeout: 15000, interval: 100 },
		);
		expect(statusCalls).toBeGreaterThanOrEqual(2);
		expect(document.body.textContent ?? "").not.toContain(DETECTED_NAME);
	}, 20000);

	it("keeps a server-reported repository name out of the sync header", async () => {
		let statusCalls = 0;
		vi.stubGlobal(
			"fetch",
			vi.fn(async (input: unknown, init?: { method?: string }) => {
				const url = String(input);
				const method = init?.method ?? "GET";
				if (url === "/api/codebases" && method === "POST") {
					return {
						ok: true,
						status: 200,
						json: async () => ({
							id: "cb-name-1",
							name: PLACEHOLDER,
							sync: syncPayload(),
						}),
					};
				}
				if (url.includes("/api/codebases/cb-name-1/status")) {
					statusCalls += 1;
					return {
						ok: true,
						status: 200,
						json: async () => ({
							projectId: "cb-name-1",
							sessionId: "sess-name-1",
							status: "connected",
							snapshotId: null,
							codebaseName: "Movie App Portfolio",
						}),
					};
				}
				throw new Error(`unexpected fetch ${method} ${url}`);
			}),
		);

		await renderConnectedOnboarding();

		await waitFor(() => {
			expect(
				screen.getByText("Sync codebase dengan everythings-vibe"),
			).toBeDefined();
		});

		await waitFor(
			() => {
				expect(document.body.textContent).toContain("Agent terhubung");
			},
			{ timeout: 15000, interval: 100 },
		);
		expect(statusCalls).toBeGreaterThanOrEqual(1);
		const headerText = document.body.textContent ?? "";
		expect(headerText).not.toContain("Project /");
		expect(headerText).not.toContain(PLACEHOLDER);
	}, 20000);
});
