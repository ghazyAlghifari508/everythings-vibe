// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
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

const OUTPUT = {
	projectId: "proj-retry-1",
	snapshotId: "snap-retry-1",
	framework: "Next.js",
	language: "TypeScript",
};

function uploadedStatus() {
	return {
		projectId: "cb-retry-1",
		sessionId: "sess-retry-1",
		status: "uploaded",
		snapshotId: "snap-retry-1",
		fileCount: 24,
		excludedCount: 3,
	};
}

function freshTokenPayload(projectId: string) {
	return {
		projectId,
		apiBaseUrl: "http://localhost:3000",
		syncToken: `fresh-${projectId}`,
		syncCommand: "vibeeverything codebase sync",
		expiresAt: new Date(Date.now() + 3600000).toISOString(),
	};
}

describe("PlanCodebasePage conclusion step recovery and retry", () => {
	beforeEach(() => {
		useUIStore.getState().setCodebasePlanStep("sync");
		try {
			sessionStorage.setItem("prdfy:plan-codebase-id", "cb-retry-1");
			sessionStorage.setItem("prdfy:plan-codebase-name", "Retry Repo");
		} catch {
			// Storage unavailable still exercises the fresh path below.
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

	it("rebuilds the live status from persisted handshake evidence after a refresh", async () => {
		try {
			// Mid-attempt session: the browser never observed `connected`, but the
			// handshake timestamp is persisted on the server row.
			sessionStorage.setItem("prdfy:plan-codebase-id", "cb-live-gate-1");
			sessionStorage.setItem("prdfy:plan-codebase-name", "Live Gate Repo");
			// The user was reading the sync step when they refreshed.
			sessionStorage.setItem("prdfy:plan-codebase-step", "sync");
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
						projectId: "cb-live-gate-1",
						sessionId: "sess-live-gate-1",
						status: "uploading",
						snapshotId: null,
						cliConnectedAt: "2026-09-19T10:00:00.000Z",
					}),
				};
			}
			if (url.endsWith("/session") && method === "POST") {
				return {
					ok: true,
					status: 200,
					json: async () => freshTokenPayload("cb-live-gate-1"),
				};
			}
			throw new Error(`unexpected fetch ${method} ${url}`);
		});
		vi.stubGlobal("fetch", fetchMock);

		render(<PlanCodebasePage />);

		// The gate is reconstructed from the server row, not from React memory and
		// not from a copy click. The one-time sync token is deliberately not
		// restorable, so the prompt area offers a fresh one instead.
		await waitFor(
			() => {
				expect(screen.getByText("Agent terhubung")).toBeDefined();
			},
			{ timeout: 15000, interval: 100 },
		);
		expect(
			screen.getByText(
				"Token sync hanya berlaku sekali dan tidak disimpan di browser.",
			),
		).toBeDefined();
		expect(
			screen.getByRole("button", { name: /Dapatkan token baru/i }),
		).toBeDefined();
		// Handshake evidence alone is not a finished transport: no snapshot exists
		// yet, so the conclusion step stays shut.
		expect(
			(screen.getByTestId("sync-continue-to-summary") as HTMLButtonElement)
				.disabled,
		).toBe(true);
	}, 20000);

	it("keeps the conclusion step shut on refresh while the server still waits for the CLI", async () => {
		try {
			sessionStorage.setItem("prdfy:plan-codebase-id", "cb-wait-gate-1");
			sessionStorage.setItem("prdfy:plan-codebase-name", "Waiting Gate Repo");
			sessionStorage.setItem("prdfy:plan-codebase-step", "summary");
		} catch {
			// Best-effort only.
		}
		vi.stubGlobal(
			"fetch",
			vi.fn(async (input: unknown, init?: RequestInit) => {
				const url = String(input);
				const method = init?.method ?? "GET";
				if (url.includes("/status")) {
					return {
						ok: true,
						status: 200,
						json: async () => ({
							projectId: "cb-wait-gate-1",
							sessionId: "sess-wait-gate-1",
							status: "waiting_for_cli",
							snapshotId: null,
						}),
					};
				}
				if (url.endsWith("/session") && method === "POST") {
					return {
						ok: true,
						status: 200,
						json: async () => freshTokenPayload("cb-wait-gate-1"),
					};
				}
				throw new Error(`unexpected fetch ${method} ${url}`);
			}),
		);

		render(<PlanCodebasePage />);

		// A fresh token is minted, but there is still no handshake and no
		// snapshot. A stored "summary" intent cannot manufacture either one.
		await waitFor(
			() => {
				expect(screen.getByTestId("sync-continue-to-summary")).toBeDefined();
			},
			{ timeout: 15000, interval: 100 },
		);
		expect(
			(screen.getByTestId("sync-continue-to-summary") as HTMLButtonElement)
				.disabled,
		).toBe(true);
		expect(screen.queryByTestId("codebase-sync-summary")).toBeNull();
		// The server's own verdict is what the step reports: waiting on the agent, with instructions only.
		await waitFor(
			() => {
				expect(screen.getByText("Paste prompt lalu jalankan")).toBeDefined();
			},
			{ timeout: 15000, interval: 100 },
		);
		expect(
			document.querySelector('[data-testid="sync-stage-agent"]'),
		).toBeNull();
		expect(document.querySelectorAll("[data-stage-state]")).toHaveLength(0);
	}, 20000);

	it("retries a failed analysis through the real boundary and shows the result", async () => {
		let analysisPosts = 0;
		let analysisFailed = true;
		const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
			const url = String(input);
			const method = init?.method ?? "GET";
			if (url.includes("/status")) {
				return {
					ok: true,
					status: 200,
					json: async () => ({
						...uploadedStatus(),
						...(analysisFailed ? { analysisStatus: "failed" } : {}),
					}),
				};
			}
			if (url.endsWith("/features") && method === "POST") {
				return {
					ok: true,
					status: 200,
					json: async () => ({ projectId: "proj-retry-1", name: "Retry Repo" }),
				};
			}
			if (url.endsWith("/codebase/analysis") && method === "POST") {
				analysisPosts += 1;
				if (analysisPosts === 1) {
					return {
						ok: false,
						status: 502,
						json: async () => ({
							error: "Analisis codebase gagal. Coba analisis ulang.",
							code: "ANALYSIS_FAILED",
						}),
					};
				}
				analysisFailed = false;
				return {
					ok: true,
					status: 200,
					json: async () => ({
						id: "ana-retry-1",
						projectId: "proj-retry-1",
						snapshotId: "snap-retry-1",
						status: "ready",
						output: OUTPUT,
					}),
				};
			}
			if (url.includes("/codebase/analysis")) {
				return {
					ok: true,
					status: 200,
					json: async () => ({
						id: "ana-retry-1",
						projectId: "proj-retry-1",
						snapshotId: "snap-retry-1",
						status: "ready",
						output: OUTPUT,
					}),
				};
			}
			throw new Error(`unexpected fetch ${method} ${url}`);
		});
		vi.stubGlobal("fetch", fetchMock);

		render(<PlanCodebasePage />);
		await waitFor(
			() => {
				expect(screen.getByTestId("codebase-sync-summary")).not.toBeNull();
			},
			{ timeout: 15000, interval: 100 },
		);

		await waitFor(
			() => {
				expect(screen.getByTestId("codebase-analysis-failed")).not.toBeNull();
			},
			{ timeout: 15000, interval: 100 },
		);
		// The failure never becomes a sync failure and never blocks the workspace.
		expect(screen.queryByText(/Sync gagal/i)).toBeNull();
		expect(
			(screen.getByTestId("conclusion-enter-workspace") as HTMLButtonElement)
				.disabled,
		).toBe(false);

		const retry = screen.getByRole("button", { name: /Coba analisis lagi/i });
		act(() => {
			retry.click();
		});

		await waitFor(
			() => {
				expect(screen.getByText("Detected environment")).toBeDefined();
			},
			{ timeout: 15000, interval: 100 },
		);
		expect(analysisPosts).toBe(2);
		// The pending state replaced the failure in place — no extra step.
		expect(screen.queryByTestId("codebase-analysis-failed")).toBeNull();
		expect(screen.getByText("Next.js")).toBeDefined();
	}, 25000);
});
