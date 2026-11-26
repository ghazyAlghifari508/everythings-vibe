// @vitest-environment jsdom
//
// Conclusion-gate readiness contract for the existing-codebase onboarding.
//
// The gate must open from server truth alone: once the status route names a
// ready analysis for the current project/snapshot, the browser reads that
// persisted output and enables "Lanjut ke Kesimpulan" without a page refresh,
// and it never unlocks on a mismatched id, snapshot, or project.
import { act, cleanup, renderHook } from "@testing-library/react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ScreenConnect } from "../components/workspace/screen-connect";
import { useCodebaseSyncStream } from "../hooks/use-codebase-sync-stream";
import {
	useOnboardingAnalysis,
	useOnboardingSummaryGate,
} from "../hooks/use-onboarding-analysis";
import { useOnboardingAnalysisState } from "../hooks/use-onboarding-analysis-state";
import type { SyncStatusResponse } from "../services/sync";
import { hasReadyAnalysisForSnapshot } from "../services/workspace-readiness";

const CODEBASE = { id: "repo", name: "Repository" };
const PROJECT = "project";
const SNAPSHOT = "snapshot";
const ANALYSIS = "analysis-1";

const SUGGESTIONS = [
	{
		id: "feature",
		title: "Tambah fitur",
		description: "Deskripsi",
		prompt: "Prompt",
	},
	{
		id: "bugfix",
		title: "Perbaiki bug",
		description: "Deskripsi",
		prompt: "Prompt",
	},
	{
		id: "refactor",
		title: "Rapikan kode",
		description: "Deskripsi",
		prompt: "Prompt",
	},
	{
		id: "ui",
		title: "Perbaiki tampilan",
		description: "Deskripsi",
		prompt: "Prompt",
	},
];

const OUTPUT = {
	projectId: PROJECT,
	snapshotId: SNAPSHOT,
	starterSuggestions: SUGGESTIONS,
};

const READY_ROW = {
	id: ANALYSIS,
	projectId: PROJECT,
	snapshotId: SNAPSHOT,
	status: "ready",
	output: OUTPUT,
};

const UPLOADED = {
	projectId: "repo",
	sessionId: "session",
	snapshotId: SNAPSHOT,
	status: "uploaded",
	cliConnectedAt: "2026-01-01T00:00:00.000Z",
} as SyncStatusResponse;

function readyStatus(overrides: Partial<SyncStatusResponse> = {}) {
	return {
		...UPLOADED,
		analysisProjectId: PROJECT,
		analysisId: ANALYSIS,
		analysisStatus: "ready",
		analysisAttemptId: ANALYSIS,
		analysisAttemptStatus: "ready",
		...overrides,
	} as SyncStatusResponse;
}

interface ServerBehavior {
	/** Analysis trigger (POST). Defaults to reusing the ready row. */
	trigger?: () => Response | Promise<Response>;
	/** Analysis read (GET). Defaults to serving the ready row. */
	read?: () => Response | Promise<Response>;
}

function installServer(behavior: ServerBehavior = {}) {
	const calls: string[] = [];
	const fetchMock = vi.fn(
		async (input: RequestInfo | URL, init?: RequestInit) => {
			const url = String(input);
			const method = init?.method ?? "GET";
			calls.push(`${method} ${url}`);
			if (url.endsWith("/features"))
				return Response.json({ projectId: PROJECT });
			if (url.includes("/codebase/analysis")) {
				if (method === "POST") {
					return behavior.trigger
						? behavior.trigger()
						: Response.json(READY_ROW);
				}
				return behavior.read ? behavior.read() : Response.json(READY_ROW);
			}
			throw new Error(`unexpected fetch ${method} ${url}`);
		},
	);
	vi.stubGlobal("fetch", fetchMock);
	return {
		calls,
		posts: () => calls.filter((call) => call.startsWith("POST ")),
		analysisPosts: () =>
			calls.filter(
				(call) =>
					call.startsWith("POST ") && call.includes("/codebase/analysis"),
			),
		reads: () =>
			calls.filter(
				(call) =>
					call.startsWith("GET ") && call.includes("/codebase/analysis"),
			),
	};
}

async function flush(cycles = 10) {
	for (let index = 0; index < cycles; index += 1) {
		await act(async () => {
			// One macrotask per cycle so a chained fetch/parse settles.
			await new Promise<void>((resolve) => {
				setTimeout(resolve, 0);
			});
		});
	}
}

function setup(initialStatus: SyncStatusResponse) {
	return renderHook(
		({ current }: { current: SyncStatusResponse }) => {
			const state = useOnboardingAnalysisState();
			// Mirrors the page composition: the trigger/read hook plus the gate,
			// reading the same state and the same reconciled status frame.
			const reviewReady = hasReadyAnalysisForSnapshot(
				state.analysis,
				current.snapshotId ?? null,
			);
			useOnboardingAnalysis({
				state,
				codebase: CODEBASE,
				lastStatus: current,
				reviewReady,
			});
			const { canContinueToSummary } = useOnboardingSummaryGate({
				state,
				codebase: CODEBASE,
				lastStatus: current,
			});
			return { state, canContinueToSummary };
		},
		{ initialProps: { current: initialStatus } },
	);
}

beforeEach(() => {
	(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
	try {
		localStorage.clear();
		sessionStorage.clear();
	} catch {
		// Best effort only.
	}
});

afterEach(() => {
	cleanup();
	try {
		localStorage.clear();
		sessionStorage.clear();
	} catch {
		// Best effort only.
	}
	vi.unstubAllGlobals();
});

describe("conclusion gate reconciliation", () => {
	it("enables without refresh once the server reports the analysis ready", async () => {
		const server = installServer();
		const { result, rerender } = setup(UPLOADED);
		await flush();

		expect(result.current.state.featureProjectId).toBe(PROJECT);
		expect(server.analysisPosts()).toHaveLength(1);

		act(() => {
			rerender({ current: readyStatus() });
		});
		await flush();

		expect(result.current.state.analysis?.id).toBe(ANALYSIS);
		expect(result.current.canContinueToSummary).toBe(true);
		// The trigger response already carried the row: reconciliation must not
		// bill (or even POST) a second attempt.
		expect(server.analysisPosts()).toHaveLength(1);
	});

	it("waits while status is ready but no output has arrived, then enables", async () => {
		let readServed = false;
		const server = installServer({
			// A server-owned attempt is already running: nothing to trigger.
			trigger: () =>
				Response.json({ code: "ANALYSIS_IN_PROGRESS" }, { status: 409 }),
			read: () =>
				readServed
					? Response.json(READY_ROW)
					: Response.json(
							{ error: "Belum ada analisis codebase" },
							{ status: 404 },
						),
		});
		const { result, rerender } = setup(readyStatus());
		await flush();

		expect(result.current.state.analysis).toBeNull();
		expect(result.current.canContinueToSummary).toBe(false);

		readServed = true;
		// The next real frame is the retrigger: the read is retried for the same
		// identity instead of waiting for a refresh.
		act(() => {
			rerender({
				current: readyStatus({
					analysisAttemptUpdatedAt: "2026-01-01T00:00:05.000Z",
				}),
			});
		});
		await flush();

		expect(result.current.state.analysis?.id).toBe(ANALYSIS);
		expect(result.current.canContinueToSummary).toBe(true);
		expect(server.reads().length).toBeGreaterThanOrEqual(2);
	});

	it("reconciles while a trigger request is still in flight", async () => {
		// The browser's own POST never settles (long model run, dropped
		// connection). Server truth must still unlock the step.
		installServer({ trigger: () => new Promise<Response>(() => {}) });
		const { result, rerender } = setup(UPLOADED);
		await flush(3);
		expect(result.current.state.analysisWorking).toBe(true);
		expect(result.current.canContinueToSummary).toBe(false);

		// The model finishes server-side while this browser still waits on its
		// own POST: the persisted output must unlock the step without a refresh.
		act(() => {
			rerender({ current: readyStatus() });
		});
		await flush();

		expect(result.current.state.analysis?.id).toBe(ANALYSIS);
		expect(result.current.canContinueToSummary).toBe(true);
	});

	it("reads a persisted output that becomes servable later", async () => {
		let served: Response | null = null;
		installServer({
			trigger: () =>
				Response.json({ code: "ANALYSIS_IN_PROGRESS" }, { status: 409 }),
			read: () =>
				served ??
				Response.json(
					{ error: "Belum ada analisis codebase" },
					{ status: 404 },
				),
		});
		const { result, rerender } = setup(readyStatus());
		await flush();
		expect(result.current.canContinueToSummary).toBe(false);

		served = Response.json(READY_ROW);
		act(() => {
			rerender({ current: readyStatus({ analysisAttemptStatus: "pending" }) });
		});
		await flush();

		expect(result.current.canContinueToSummary).toBe(true);
	});

	it("passes the gate with valid starter suggestions", async () => {
		installServer();
		const { result } = setup(readyStatus());
		await flush();
		expect(result.current.canContinueToSummary).toBe(true);
	});

	it("does not unlock when the status names another analysis id", async () => {
		installServer();
		const { result } = setup(readyStatus({ analysisId: "analysis-other" }));
		await flush();

		expect(result.current.state.analysis?.id).toBe(ANALYSIS);
		expect(result.current.canContinueToSummary).toBe(false);
	});

	it("does not unlock when the served output belongs to another snapshot", async () => {
		installServer({
			trigger: () =>
				Response.json({ ...READY_ROW, snapshotId: "snapshot-old" }),
			read: () => Response.json({ ...READY_ROW, snapshotId: "snapshot-old" }),
		});
		const { result } = setup(readyStatus());
		await flush();
		expect(result.current.canContinueToSummary).toBe(false);
	});

	it("does not unlock when the served output belongs to another project", async () => {
		installServer({
			trigger: () =>
				Response.json({ ...READY_ROW, projectId: "project-other" }),
			read: () => Response.json({ ...READY_ROW, projectId: "project-other" }),
		});
		const { result } = setup(readyStatus());
		await flush();
		expect(result.current.canContinueToSummary).toBe(false);
	});

	it("keeps the reconciled row when a stale frame names an older analysis", async () => {
		installServer();
		const { result, rerender } = setup(readyStatus());
		await flush();
		expect(result.current.canContinueToSummary).toBe(true);

		act(() => {
			rerender({ current: readyStatus({ analysisId: "analysis-older" }) });
		});
		await flush();
		// The client keeps the row the server actually serves: it never rewinds
		// to a superseded attempt.
		expect(result.current.state.analysis?.id).toBe(ANALYSIS);

		act(() => {
			rerender({ current: readyStatus() });
		});
		await flush();
		expect(result.current.canContinueToSummary).toBe(true);
	});

	it("reaches the same final state on a fresh mount (refresh)", async () => {
		installServer();
		const first = setup(readyStatus());
		await flush();
		expect(first.result.current.canContinueToSummary).toBe(true);
		first.unmount();

		const second = setup(readyStatus());
		await flush();
		expect(second.result.current.state.analysis?.id).toBe(ANALYSIS);
		expect(second.result.current.canContinueToSummary).toBe(true);
	});

	it("reconciles again after a transient read failure on the next frame", async () => {
		let failures = 1;
		installServer({
			trigger: () =>
				Response.json({ code: "ANALYSIS_IN_PROGRESS" }, { status: 409 }),
			read: () => {
				if (failures > 0) {
					failures -= 1;
					throw new TypeError("offline");
				}
				return Response.json(READY_ROW);
			},
		});
		const { result, rerender } = setup(readyStatus());
		await flush();
		expect(result.current.canContinueToSummary).toBe(false);

		act(() => {
			rerender({
				current: readyStatus({
					analysisAttemptUpdatedAt: "2026-01-01T00:00:09.000Z",
				}),
			});
		});
		await flush();

		expect(result.current.canContinueToSummary).toBe(true);
	});

	it("never triggers a duplicate analysis and never charges again on re-fetch", async () => {
		const server = installServer({
			trigger: () =>
				Response.json({ code: "ANALYSIS_IN_PROGRESS" }, { status: 409 }),
		});
		const { rerender } = setup(UPLOADED);
		await flush();
		for (let frame = 0; frame < 4; frame += 1) {
			act(() => {
				rerender({
					current: readyStatus({
						analysisAttemptUpdatedAt: `2026-01-01T00:00:1${frame}.000Z`,
					}),
				});
			});
			await flush();
		}

		expect(server.analysisPosts()).toHaveLength(1);
		expect(server.calls.some((call) => call.includes("preflight"))).toBe(false);
	});

	it("never navigates away while reconciling", async () => {
		const before = window.location.pathname;
		installServer();
		const { result } = setup(UPLOADED);
		await flush();
		expect(result.current.canContinueToSummary).toBe(false);
		expect(window.location.pathname).toBe(before);
		expect(window.history.length).toBe(1);
	});
});

describe("conclusion gate presentation", () => {
	let container: HTMLDivElement;
	let root: Root | null = null;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(() => {
		if (root) {
			const mounted = root;
			act(() => {
				mounted.unmount();
			});
			root = null;
		}
		container?.remove();
		document.body.innerHTML = "";
	});

	function renderConnect(
		props: Partial<React.ComponentProps<typeof ScreenConnect>>,
	) {
		act(() => {
			root?.render(
				<ScreenConnect
					projectName="Repository"
					payload={null}
					status={readyStatus()}
					onContinueToSummary={() => {}}
					{...props}
				/>,
			);
		});
		return container;
	}

	it("keeps the repair action and the closed gate for a legacy analysis", () => {
		const container = renderConnect({
			canContinueToSummary: false,
			isLegacyAnalysisMissingSuggestions: true,
			onRefreshLegacySuggestions: () => {},
		});
		expect(
			container.querySelector('[data-testid="legacy-analysis-warning"]'),
		).not.toBeNull();
		expect(
			container.querySelector(
				'[data-testid="refresh-legacy-suggestions-button"]',
			),
		).not.toBeNull();
		const cta = container.querySelector(
			'[data-testid="sync-continue-to-summary"]',
		) as HTMLButtonElement;
		// A missing advisory field is repaired, never bypassed.
		expect(cta.disabled).toBe(true);
	});

	it("shows the enabled action and no repair warning once reconciled", () => {
		const container = renderConnect({ canContinueToSummary: true });
		const cta = container.querySelector(
			'[data-testid="sync-continue-to-summary"]',
		) as HTMLButtonElement;
		expect(cta.disabled).toBe(false);
		expect(
			container.querySelector('[data-testid="legacy-analysis-warning"]'),
		).toBeNull();
	});
});

describe("sync stream reconciliation", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("re-subscribes with the analysis project so frames carry the ready identity", async () => {
		const urls: string[] = [];
		class FakeEventSource {
			onopen: (() => void) | null = null;
			onerror: (() => void) | null = null;
			close = vi.fn();
			addEventListener = vi.fn();
			constructor(public url: string) {
				urls.push(url);
			}
		}
		vi.stubGlobal("EventSource", FakeEventSource);

		const { rerender } = renderHook(
			({ analysisProjectId }: { analysisProjectId: string | null }) =>
				useCodebaseSyncStream({
					codebaseId: "repo",
					sessionId: "session",
					analysisProjectId,
				}),
			{ initialProps: { analysisProjectId: null as string | null } },
		);
		act(() => {
			rerender({ analysisProjectId: PROJECT });
		});
		await flush(2);

		expect(urls[0]).toBe("/api/codebases/repo/sync-stream?sessionId=session");
		expect(urls[1]).toBe(
			`/api/codebases/repo/sync-stream?sessionId=session&projectId=${PROJECT}`,
		);
	});
});
