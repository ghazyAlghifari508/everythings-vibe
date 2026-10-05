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

const PLACEHOLDER = "Repository Lokal";
const DETECTED_NAME = "react-movie-app";

function syncPayload() {
	return {
		projectId: "cb-name-1",
		apiBaseUrl: "http://localhost:3000",
		syncToken: "name-token-1",
		syncCommand:
			"vibeeverything codebase sync --project-id cb-name-1 --sync-token name-token-1",
		expiresAt: new Date(Date.now() + 3600000).toISOString(),
	};
}

async function advanceToSyncScreen() {
	// The prompt CTA is gated on real CLI handshake evidence, so wait for the
	// canonical poll to report one before advancing.
	await waitFor(
		() => {
			const cta = screen.getByTestId("prompt-continue-to-sync");
			expect((cta as HTMLButtonElement).disabled).toBe(false);
		},
		{ timeout: 15000, interval: 50 },
	);
	fireEvent.click(screen.getByTestId("prompt-continue-to-sync"));
	await waitFor(() => {
		expect(screen.getByText("Sync codebase")).toBeDefined();
	});
}
describe("PlanCodebasePage repository name", () => {
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

	it("shows the placeholder until the CLI reports the real repository name", {
		timeout: 20000,
	}, async () => {
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

		render(<PlanCodebasePage />);

		await waitFor(() => {
			expect(
				screen.getByText("Sync codebase dengan VibeEverything"),
			).toBeDefined();
		});

		await advanceToSyncScreen();

		await waitFor(
			() => {
				expect(document.body.textContent).toContain(
					`PROJECT / ${DETECTED_NAME.toUpperCase()}`,
				);
			},
			{ timeout: 15000, interval: 100 },
		);
		expect(statusCalls).toBeGreaterThanOrEqual(2);
		expect(document.body.textContent).not.toContain(PLACEHOLDER.toUpperCase());
	});

	it("keeps showing a user-renamed name reported by the server", {
		timeout: 20000,
	}, async () => {
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

		render(<PlanCodebasePage />);

		await waitFor(() => {
			expect(
				screen.getByText("Sync codebase dengan VibeEverything"),
			).toBeDefined();
		});

		await advanceToSyncScreen();

		await waitFor(
			() => {
				expect(document.body.textContent).toContain(
					"PROJECT / MOVIE APP PORTFOLIO",
				);
			},
			{ timeout: 15000, interval: 100 },
		);
		expect(statusCalls).toBeGreaterThanOrEqual(1);
		expect(document.body.textContent).not.toContain(PLACEHOLDER.toUpperCase());
	});
});
