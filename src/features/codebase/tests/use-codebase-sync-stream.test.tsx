// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	type SyncStreamConnection,
	useCodebaseSyncStream,
} from "@/features/codebase/hooks/use-codebase-sync-stream";
import type { SyncStatusResponse } from "@/features/codebase/services/sync";

/**
 * Live progress channel contract.
 *
 * The browser must receive real transitions from the stream, resume after a
 * channel drop, and fall back to polling when the channel cannot be used. A
 * dropped channel is a delivery fact only: it must never clear the attempt or
 * read as a failed sync.
 */

class FakeEventSource {
	static instances: FakeEventSource[] = [];
	readonly url: string;
	closed = false;
	onopen: (() => void) | null = null;
	onerror: (() => void) | null = null;
	private readonly listeners = new Map<
		string,
		Set<(event: MessageEvent<string>) => void>
	>();

	constructor(url: string) {
		this.url = url;
		FakeEventSource.instances.push(this);
	}

	addEventListener(
		type: string,
		listener: (event: MessageEvent<string>) => void,
	) {
		const set = this.listeners.get(type) ?? new Set();
		set.add(listener);
		this.listeners.set(type, set);
	}

	emit(type: string, data?: unknown) {
		if (type === "open") {
			this.onopen?.();
			return;
		}
		if (type === "error") {
			this.onerror?.();
			return;
		}
		const payload = {
			data: typeof data === "string" ? data : JSON.stringify(data),
		} as MessageEvent<string>;
		for (const listener of this.listeners.get(type) ?? []) listener(payload);
	}

	close() {
		this.closed = true;
	}
}

function statusResponse(
	overrides: Partial<SyncStatusResponse> = {},
): SyncStatusResponse {
	return {
		projectId: "cb_stream_hook",
		sessionId: "sess_stream_hook",
		status: "waiting_for_cli",
		snapshotId: null,
		...overrides,
	};
}

interface Probe {
	latest: SyncStatusResponse | null;
	connection: SyncStreamConnection;
}

type HookOptions = Parameters<typeof useCodebaseSyncStream>[0];

let container: HTMLDivElement;
let root: Root | null = null;

function renderProbe(options: HookOptions): Probe {
	const probe: Probe = { latest: null, connection: "idle" };
	function Harness({ hookOptions }: { hookOptions: HookOptions }) {
		const { status, connection } = useCodebaseSyncStream(hookOptions);
		probe.latest = status;
		probe.connection = connection;
		return null;
	}
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
	act(() => {
		root?.render(<Harness hookOptions={options} />);
	});
	return probe;
}

beforeEach(() => {
	(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
	FakeEventSource.instances = [];
});

afterEach(() => {
	if (root) {
		const current = root;
		act(() => {
			current.unmount();
		});
		root = null;
	}
	container?.remove();
	document.body.innerHTML = "";
	vi.unstubAllGlobals();
	vi.useRealTimers();
});

describe("live sync progress stream", () => {
	it("delivers frames scoped to the watched session", () => {
		vi.stubGlobal("EventSource", FakeEventSource);
		const probe = renderProbe({
			codebaseId: "cb_stream_hook",
			sessionId: "sess_stream_hook",
			analysisProjectId: "proj_1",
		});

		const source = FakeEventSource.instances.at(-1);
		expect(source?.url).toContain("/api/codebases/cb_stream_hook/sync-stream");
		expect(source?.url).toContain("sessionId=sess_stream_hook");
		expect(source?.url).toContain("projectId=proj_1");

		act(() => {
			source?.emit("open");
		});
		act(() => {
			source?.emit(
				"sync",
				statusResponse({ status: "connected", snapshotId: "snap_1" }),
			);
		});

		expect(probe.connection).toBe("live");
		expect(probe.latest?.status).toBe("connected");
	});

	it("drops a late frame from a superseded session", () => {
		vi.stubGlobal("EventSource", FakeEventSource);
		const probe = renderProbe({
			codebaseId: "cb_stream_hook",
			sessionId: "sess_new",
		});
		const source = FakeEventSource.instances.at(-1);

		act(() => {
			source?.emit("sync", statusResponse({ sessionId: "sess_old" }));
		});
		expect(probe.latest).toBeNull();

		act(() => {
			source?.emit("sync", statusResponse({ sessionId: "sess_new" }));
		});
		expect(probe.latest?.sessionId).toBe("sess_new");
	});

	it("resumes after a dropped channel instead of reporting a failure", () => {
		vi.useFakeTimers();
		vi.stubGlobal("EventSource", FakeEventSource);
		const probe = renderProbe({
			codebaseId: "cb_stream_hook",
			sessionId: "sess_stream_hook",
		});

		const first = FakeEventSource.instances.at(-1);
		act(() => {
			first?.emit("open");
			first?.emit("sync", statusResponse({ status: "connected" }));
		});
		expect(probe.connection).toBe("live");

		act(() => {
			first?.emit("error");
		});
		expect(probe.connection).toBe("reconnecting");

		act(() => {
			vi.advanceTimersByTime(1_500);
		});
		const second = FakeEventSource.instances.at(-1);
		expect(FakeEventSource.instances).toHaveLength(2);
		expect(second?.url).toContain("sessionId=sess_stream_hook");

		// Reconnect replays current state, so nothing is lost by the gap.
		act(() => {
			second?.emit("sync", statusResponse({ status: "uploading" }));
		});
		expect(probe.latest?.status).toBe("uploading");
		expect(probe.connection).toBe("live");
	});

	it("reports the channel as unavailable after exhausting reconnects", () => {
		vi.useFakeTimers();
		vi.stubGlobal("EventSource", FakeEventSource);
		const probe = renderProbe({
			codebaseId: "cb_stream_hook",
			sessionId: "sess_stream_hook",
		});

		for (let attempt = 0; attempt < 5; attempt += 1) {
			const source = FakeEventSource.instances.at(-1);
			act(() => {
				source?.emit("error");
			});
			act(() => {
				vi.advanceTimersByTime(5_000);
			});
		}

		expect(probe.connection).toBe("unavailable");
		// Nothing about the attempt is cleared or marked failed by a lost channel.
		expect(probe.latest).toBeNull();
	});

	it("stays out of the way when the runtime has no streaming support", () => {
		vi.stubGlobal("EventSource", undefined);
		const probe = renderProbe({
			codebaseId: "cb_stream_hook",
			sessionId: "sess_stream_hook",
		});
		expect(probe.connection).toBe("unavailable");
		expect(probe.latest).toBeNull();
	});

	it("does nothing until there is a codebase to watch", () => {
		vi.stubGlobal("EventSource", FakeEventSource);
		const probe = renderProbe({ codebaseId: null });
		expect(probe.connection).toBe("idle");
		expect(FakeEventSource.instances).toHaveLength(0);
	});
});
