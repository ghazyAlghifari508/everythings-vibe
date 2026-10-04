// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SyncStatusResponse } from "@/lib/codebase-sync";
import { SyncStatus } from "./sync-status";

let container: HTMLDivElement;
let root: Root | null = null;

afterEach(() => {
	if (root) {
		const r = root;
		act(() => {
			r.unmount();
		});
		root = null;
	}
	container?.remove();
	vi.unstubAllGlobals();
	vi.useRealTimers();
});

function statusResponse(
	overrides: Partial<SyncStatusResponse> = {},
): SyncStatusResponse {
	return {
		projectId: "proj_lc_1",
		sessionId: "sess_lc_1",
		status: "uploading",
		...overrides,
	};
}

function renderLifecycle(
	props: Partial<React.ComponentProps<typeof SyncStatus>> = {},
) {
	container = document.createElement("div");
	document.body.appendChild(container);
	const nextRoot = createRoot(container);
	root = nextRoot;
	act(() => {
		nextRoot.render(
			<SyncStatus projectId="proj_lc_1" pollIntervalMs={15} {...props} />,
		);
	});
	return container;
}

function rerenderLifecycle(
	props: Partial<React.ComponentProps<typeof SyncStatus>> = {},
) {
	if (!root) throw new Error("no root to rerender");
	act(() => {
		root?.render(
			<SyncStatus projectId="proj_lc_1" pollIntervalMs={15} {...props} />,
		);
	});
	return container;
}

async function settle(ms = 60) {
	await act(async () => {
		await new Promise((resolve) => setTimeout(resolve, ms));
	});
}

describe("SyncStatus live reconciliation lifecycle", () => {
	it("initial poll observes waiting_for_cli as honest standby", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => ({
				ok: true,
				status: 200,
				json: async () =>
					statusResponse({
						status: "waiting_for_cli",
						sessionId: "sess_wait_lc",
					}),
			})),
		);
		const c = renderLifecycle();
		await settle(60);
		expect(c.textContent).toContain("CLI Agent Belum Terhubung");
		expect(c.querySelector('[data-testid="cli-waiting-alert"]')).not.toBeNull();
	});

	it("mounted client moves connected to uploading to uploaded without remount", async () => {
		let calls = 0;
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => {
				calls += 1;
				const payload =
					calls === 1
						? statusResponse({
								status: "connected",
								sessionId: "sess_chain_lc",
							})
						: calls === 2
							? statusResponse({
									status: "uploading",
									sessionId: "sess_chain_lc",
								})
							: statusResponse({
									status: "uploaded",
									sessionId: "sess_chain_lc",
									snapshotId: "snap_chain_lc",
									fileCount: 12,
									excludedCount: 3,
								});
				return { ok: true, status: 200, json: async () => payload };
			}),
		);
		const c = renderLifecycle({ pollIntervalMs: 15 });
		await settle(120);
		expect(c.textContent).toContain("Source code tersinkron");
		expect(c.textContent).toContain("12");
	});

	it("forwards uploaded snapshot to onStatus for parent transition", async () => {
		const onStatus = vi.fn();
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => ({
				ok: true,
				status: 200,
				json: async () =>
					statusResponse({
						status: "uploaded",
						sessionId: "sess_fwd_lc",
						snapshotId: "snap_fwd_lc",
						fileCount: 37,
						excludedCount: 6,
					}),
			})),
		);
		renderLifecycle({ onStatus, pollIntervalMs: 15 });
		await settle(60);
		expect(onStatus).toHaveBeenCalledWith(
			expect.objectContaining({
				status: "uploaded",
				snapshotId: "snap_fwd_lc",
				fileCount: 37,
			}),
		);
	});

	it("hung first request is retired and polling recovers", {
		timeout: 15000,
	}, async () => {
		let calls = 0;
		vi.stubGlobal(
			"fetch",
			vi.fn(async (_input: unknown, init?: { signal?: AbortSignal }) => {
				calls += 1;
				if (calls === 1) {
					return new Promise((_resolve, reject) => {
						const signal = init?.signal;
						if (signal) {
							if (signal.aborted) {
								const err = new Error("aborted");
								err.name = "AbortError";
								reject(err);
								return;
							}
							signal.addEventListener(
								"abort",
								() => {
									const err = new Error("aborted");
									err.name = "AbortError";
									reject(err);
								},
								{ once: true },
							);
						}
					});
				}
				return {
					ok: true,
					status: 200,
					json: async () =>
						statusResponse({
							status: "connected",
							sessionId: "sess_hung_lc",
						}),
				};
			}),
		);
		const c = renderLifecycle({
			pollIntervalMs: 15,
			requestTimeoutMs: 30,
		});
		await settle(160);
		expect(calls).toBeGreaterThanOrEqual(2);
		expect(c.textContent).toContain("Repository terhubung");
	});

	it("cleanup during in-flight does not block the next lifecycle", {
		timeout: 15000,
	}, async () => {
		let firstResolve!: (value: unknown) => void;
		let calls = 0;
		const fetchMock = vi.fn(
			async (_input: unknown, init?: { signal?: AbortSignal }) => {
				calls += 1;
				if (calls === 1) {
					return new Promise((resolve, reject) => {
						firstResolve = resolve as (value: unknown) => void;
						init?.signal?.addEventListener(
							"abort",
							() => {
								const err = new Error("aborted");
								err.name = "AbortError";
								reject(err);
							},
							{ once: true },
						);
					});
				}
				return {
					ok: true,
					status: 200,
					json: async () =>
						statusResponse({
							status: "connected",
							sessionId: "sess_cleanup_lc",
						}),
				};
			},
		);
		vi.stubGlobal("fetch", fetchMock);
		const c = renderLifecycle({ pollIntervalMs: 15, requestTimeoutMs: 30 });
		await settle(30);
		expect(fetchMock).toHaveBeenCalledTimes(1);
		rerenderLifecycle({
			pollIntervalMs: 15,
			requestTimeoutMs: 30,
			projectId: "proj_lc_2",
		});
		await act(async () => {
			firstResolve({
				ok: true,
				status: 200,
				json: async () =>
					statusResponse({
						projectId: "proj_lc_1",
						sessionId: "sess_stale_lc",
						status: "waiting_for_cli",
					}),
			});
		});
		await settle(120);
		expect(c.textContent).toContain("Repository terhubung");
		expect(c.textContent).not.toContain("Menghubungi server...");
	});

	it("stale response never overwrites a newer session", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async (input: unknown) => {
				const url = String(input);
				if (url.includes("proj_new_lc")) {
					await new Promise((resolve) => setTimeout(resolve, 5));
					return {
						ok: true,
						status: 200,
						json: async () =>
							statusResponse({
								projectId: "proj_new_lc",
								sessionId: "sess_new_lc",
								status: "connected",
							}),
					};
				}
				await new Promise((resolve) => setTimeout(resolve, 30));
				return {
					ok: true,
					status: 200,
					json: async () =>
						statusResponse({
							projectId: "proj_lc_1",
							sessionId: "sess_old_lc",
							status: "waiting_for_cli",
						}),
				};
			}),
		);
		const c = renderLifecycle({ projectId: "proj_lc_1", pollIntervalMs: 15 });
		await settle(10);
		rerenderLifecycle({ projectId: "proj_new_lc", pollIntervalMs: 15 });
		await settle(120);
		expect(c.textContent).toContain("Repository terhubung");
		expect(c.textContent).not.toContain("CLI Agent Belum Terhubung");
	});
});
