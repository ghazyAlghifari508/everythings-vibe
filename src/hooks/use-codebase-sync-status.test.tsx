// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SyncStatusResponse } from "@/lib/codebase-sync";
import { useCodebaseSyncStatus } from "./use-codebase-sync-status";

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
	document.body.innerHTML = "";
	vi.unstubAllGlobals();
});

function statusResponse(
	overrides: Partial<SyncStatusResponse> = {},
): SyncStatusResponse {
	return {
		projectId: "cb_hook_1",
		sessionId: "sess_hook_1",
		status: "waiting_for_cli",
		...overrides,
	};
}

interface Probe {
	latest: SyncStatusResponse | null;
	error: string | null;
	calls: () => number;
	rerender: (options: HookOptions) => void;
}

type HookOptions = Parameters<typeof useCodebaseSyncStatus>[0];

function renderProbe(options: HookOptions): Probe {
	const probe: Probe = {
		latest: null,
		error: null,
		calls: () => 0,
		rerender: () => {},
	};
	function Harness({ hookOptions }: { hookOptions: HookOptions }) {
		const { status, error } = useCodebaseSyncStatus(hookOptions);
		probe.latest = status;
		probe.error = error;
		return null;
	}
	container = document.createElement("div");
	document.body.appendChild(container);
	const nextRoot = createRoot(container);
	root = nextRoot;
	const spy = vi.spyOn(globalThis, "fetch");
	act(() => {
		nextRoot.render(<Harness hookOptions={options} />);
	});
	probe.calls = () => spy.mock.calls.length;
	probe.rerender = (next: HookOptions) => {
		act(() => {
			nextRoot.render(<Harness hookOptions={next} />);
		});
	};
	return probe;
}

async function settle(ms = 60) {
	await act(async () => {
		await new Promise((resolve) => setTimeout(resolve, ms));
	});
}

describe("useCodebaseSyncStatus", () => {
	it("stays idle and issues no request while disabled", async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		const probe = renderProbe({
			codebaseId: "cb_hook_1",
			enabled: false,
		});
		await settle();
		expect(fetchMock).not.toHaveBeenCalled();
		expect(probe.latest).toBeNull();
		expect(probe.error).toBeNull();
	});

	it("polls one request per tick against the codebase status endpoint", async () => {
		const fetchMock = vi.fn(async (_input: unknown) => ({
			ok: true,
			status: 200,
			json: async () => statusResponse({ status: "connected" }),
		}));
		vi.stubGlobal("fetch", fetchMock);
		const probe = renderProbe({
			codebaseId: "cb_hook_1",
			pollIntervalMs: 15,
		});
		await settle(80);
		expect(fetchMock).toHaveBeenCalled();
		expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
			"/api/codebases/cb_hook_1/status",
		);
		expect(probe.latest?.status).toBe("connected");
		expect(probe.error).toBeNull();
	});

	it("runs exactly one polling loop for a mounted consumer", async () => {
		const fetchMock = vi.fn(async (_input: unknown) => ({
			ok: true,
			status: 200,
			json: async () => statusResponse({ status: "connected" }),
		}));
		vi.stubGlobal("fetch", fetchMock);
		const probe = renderProbe({
			codebaseId: "cb_hook_1",
			pollIntervalMs: 60,
		});
		await settle(190);
		// One consumer must never fan out into overlapping request streams.
		expect(probe.calls()).toBeLessThanOrEqual(4);
	});

	it("pins subsequent polls to the observed session id", async () => {
		const fetchMock = vi.fn(async (_input: unknown) => ({
			ok: true,
			status: 200,
			json: async () =>
				statusResponse({ status: "uploading", sessionId: "sess_pin_hook" }),
		}));
		vi.stubGlobal("fetch", fetchMock);
		renderProbe({ codebaseId: "cb_hook_1", pollIntervalMs: 15 });
		await settle(80);
		expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(2);
		expect(String(fetchMock.mock.calls[1]?.[0] ?? "")).toContain(
			"sessionId=sess_pin_hook",
		);
	});

	it("attaches the analysis project so persisted analysis status is reported", async () => {
		const fetchMock = vi.fn(async (_input: unknown) => ({
			ok: true,
			status: 200,
			json: async () => statusResponse({ status: "uploaded" }),
		}));
		vi.stubGlobal("fetch", fetchMock);
		renderProbe({
			codebaseId: "cb_hook_1",
			analysisProjectId: "proj_feature_hook",
			pollIntervalMs: 15,
		});
		await settle();
		expect(String(fetchMock.mock.calls[0]?.[0] ?? "")).toContain(
			"projectId=proj_feature_hook",
		);
	});

	it("surfaces a server error instead of inventing a waiting state", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async (_input: unknown) => ({
				ok: false,
				status: 500,
				json: async () => ({ error: "Gagal membaca status sync" }),
			})),
		);
		const probe = renderProbe({
			codebaseId: "cb_hook_1",
			pollIntervalMs: 15,
		});
		await settle();
		expect(probe.error).toBe("Gagal membaca status sync");
		expect(probe.latest).toBeNull();
	});

	it("retires a hung request through the abort timeout and keeps polling", async () => {
		let calls = 0;
		vi.stubGlobal(
			"fetch",
			vi.fn(async (_input: unknown, init?: { signal?: AbortSignal }) => {
				calls += 1;
				if (calls === 1) {
					return new Promise((_resolve, reject) => {
						init?.signal?.addEventListener(
							"abort",
							() => {
								const error = new Error("aborted");
								error.name = "AbortError";
								reject(error);
							},
							{ once: true },
						);
					});
				}
				return {
					ok: true,
					status: 200,
					json: async () => statusResponse({ status: "connected" }),
				};
			}),
		);
		const probe = renderProbe({
			codebaseId: "cb_hook_1",
			pollIntervalMs: 15,
			requestTimeoutMs: 30,
		});
		await settle(160);
		expect(calls).toBeGreaterThanOrEqual(2);
		expect(probe.latest?.status).toBe("connected");
	});

	it("keeps only one request in flight so slow responses cannot overlap", async () => {
		let resolveFirst!: (value: unknown) => void;
		const gate = new Promise((resolve) => {
			resolveFirst = resolve;
		});
		const fetchMock = vi.fn(async (_input: unknown) => {
			await gate;
			return { ok: true, status: 200, json: async () => statusResponse() };
		});
		vi.stubGlobal("fetch", fetchMock);
		renderProbe({ codebaseId: "cb_hook_1", pollIntervalMs: 15 });
		await settle(90);
		expect(fetchMock).toHaveBeenCalledTimes(1);
		await act(async () => {
			resolveFirst(null);
		});
		await settle();
	});

	it("never lets a stale response overwrite a newer codebase", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async (input: unknown) => {
				const url = String(input);
				if (url.includes("cb_new")) {
					await new Promise((resolve) => setTimeout(resolve, 5));
					return {
						ok: true,
						status: 200,
						json: async () =>
							statusResponse({
								projectId: "cb_new",
								sessionId: "sess_new_hook",
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
							projectId: "cb_hook_1",
							sessionId: "sess_old_hook",
							status: "waiting_for_cli",
						}),
				};
			}),
		);
		const probe = renderProbe({
			codebaseId: "cb_hook_1",
			pollIntervalMs: 15,
		});
		await settle(10);
		probe.rerender({ codebaseId: "cb_new", pollIntervalMs: 15 });
		await settle(140);
		// A late reply for the abandoned codebase must never repaint the screen
		// as "waiting for CLI".
		expect(probe.latest?.status).toBe("connected");
		expect(probe.latest?.projectId).toBe("cb_new");
	});

	it("stops polling once the session reaches a terminal sync status", async () => {
		const fetchMock = vi.fn(async (_input: unknown) => ({
			ok: true,
			status: 200,
			json: async () =>
				statusResponse({ status: "ready", snapshotId: "snap_hook_1" }),
		}));
		vi.stubGlobal("fetch", fetchMock);
		renderProbe({ codebaseId: "cb_hook_1", pollIntervalMs: 15 });
		await settle(90);
		const afterTerminal = fetchMock.mock.calls.length;
		await settle(90);
		expect(fetchMock.mock.calls.length).toBe(afterTerminal);
	});

	it("seeds from a recovered status without a second source of truth", async () => {
		const fetchMock = vi.fn(async (_input: unknown) => ({
			ok: true,
			status: 200,
			json: async () => statusResponse({ status: "uploaded" }),
		}));
		vi.stubGlobal("fetch", fetchMock);
		const probe = renderProbe({
			codebaseId: "cb_hook_1",
			initialStatus: statusResponse({
				status: "connected",
				sessionId: "sess_seed_hook",
			}),
			pollIntervalMs: 15,
		});
		expect(probe.latest?.status).toBe("connected");
		await settle(60);
		expect(probe.latest?.status).toBe("uploaded");
		// The recovered session id pins the very first poll instead of being
		// re-derived from a second request.
		expect(String(fetchMock.mock.calls[0]?.[0] ?? "")).toContain(
			"sessionId=sess_seed_hook",
		);
	});
});
