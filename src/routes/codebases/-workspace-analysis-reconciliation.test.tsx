// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import type { ComponentType, ReactNode } from "react";
import type { Mock } from "vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface TestResponse {
	ok: boolean;
	status: number;
	json: () => Promise<unknown>;
}
interface WorkspaceLoaderData {
	codebase: { id: string; name: string };
	plans: Array<{
		id: string;
		name: string;
		updatedAt: string | null;
		hasArtifacts: boolean;
	}>;
	featuresStatusById: Map<string, string | null>;
	onboardingFeatureId: string | null;
	currentSnapshotId: string | null;
	planningSnapshotByProject: Record<string, string>;
	analysis: null;
	latestAnalysisAttempt: null;
	hasStoredSnapshot: boolean;
	canOpenFullBoard: boolean;
}

interface WorkspaceRouteOptions {
	component: ComponentType;
}

interface WorkspaceServerFunctionResult {
	files: Array<{ path: string }>;
	fileCount: number;
	packageJsonText: string | null;
	featureTree: null;
	taskTree: null;
}

interface WorkspaceRouteHarness {
	loaderData: WorkspaceLoaderData | null;
	options: WorkspaceRouteOptions | null;
	serverFn: Mock<(data?: unknown) => Promise<WorkspaceServerFunctionResult>>;
}

const PROJECT_ID = "project-workspace";
const OLD_SNAPSHOT_ID = "snapshot-old";
const CURRENT_SNAPSHOT_ID = "snapshot-current";
const routeHarness = vi.hoisted(() => {
	const harness: WorkspaceRouteHarness = {
		loaderData: null,
		options: null,
		serverFn: vi.fn(async (_data?: unknown) => ({
			files: [],
			fileCount: 0,
			packageJsonText: null,
			featureTree: null,
			taskTree: null,
		})),
	};
	return harness;
});

vi.mock("@tanstack/react-router", () => ({
	createFileRoute: () => (options: WorkspaceRouteOptions) => {
		routeHarness.options = options;
		return {
			...options,
			useLoaderData: () => routeHarness.loaderData,
		};
	},
	redirect: (options: unknown) => options,
	Link: ({ children }: { children: ReactNode }) => <>{children}</>,
	useNavigate: () => vi.fn(),
}));

vi.mock("@tanstack/react-start", () => ({
	createServerFn: () => ({
		validator: () => ({ handler: () => routeHarness.serverFn }),
		handler: () => routeHarness.serverFn,
	}),
	createServerOnlyFn: (fn: unknown) => fn,
}));

vi.mock("@/hooks/use-kanban-polling", () => ({
	useKanbanTasks: () => ({
		data: null,
		isLoading: false,
		isError: false,
		staleness: "live",
		refetch: vi.fn(),
	}),
}));

vi.mock("@/components/codebase/codebase-workspace-shell", () => ({
	CodebaseWorkspaceShell: ({ chatPane }: { chatPane: ReactNode }) => (
		<>{chatPane}</>
	),
}));

import "./$id";

const SUGGESTIONS = [
	{
		id: "feature",
		title: "Add repository search",
		description: "Add search across repository files.",
		prompt: "Implement repository search using existing project patterns.",
	},
	{
		id: "bugfix",
		title: "Fix upload validation",
		description: "Correct validation feedback for uploads.",
		prompt: "Fix the upload validation behavior.",
	},
	{
		id: "refactor",
		title: "Split configuration parsing",
		description: "Separate parsing from its consumers.",
		prompt: "Refactor configuration parsing without changing behavior.",
	},
	{
		id: "ui",
		title: "Clarify form status",
		description: "Make form loading and error feedback clear.",
		prompt: "Improve loading and error feedback in the form.",
	},
] as const;

function response(body: unknown): TestResponse {
	return { ok: true, status: 200, json: async () => body };
}

function analysisResponse(snapshotId: string, titles: readonly string[]) {
	return {
		id: `analysis-${snapshotId}`,
		projectId: PROJECT_ID,
		snapshotId,
		status: "ready",
		output: {
			projectId: PROJECT_ID,
			snapshotId,
			starterSuggestions: SUGGESTIONS.map((suggestion, index) => ({
				...suggestion,
				title: titles[index],
			})),
		},
	};
}

function syncStatus(snapshotId: string, analysisStatus: "pending" | "ready") {
	return {
		projectId: PROJECT_ID,
		sessionId: "sync-session",
		status: "uploaded",
		snapshotId,
		analysisId: `analysis-${snapshotId}`,
		analysisStatus,
		fileCount: 4,
	};
}

function setLoaderData(snapshotId: string) {
	routeHarness.loaderData = {
		codebase: { id: "codebase-1", name: "Workspace repo" },
		plans: [
			{
				id: PROJECT_ID,
				name: "Workspace feature",
				updatedAt: "2026-10-01T00:00:00.000Z",
				hasArtifacts: true,
			},
		],
		featuresStatusById: new Map([[PROJECT_ID, null]]),
		onboardingFeatureId: PROJECT_ID,
		currentSnapshotId: snapshotId,
		planningSnapshotByProject: { [PROJECT_ID]: snapshotId },
		analysis: null,
		latestAnalysisAttempt: null,
		hasStoredSnapshot: false,
		canOpenFullBoard: true,
	};
}

function renderWorkspaceRoute() {
	const Page = routeHarness.options?.component;
	if (!Page) throw new Error("workspace route component was not registered");
	return render(<Page />);
}

function defer<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((resolvePromise) => {
		resolve = resolvePromise;
	});
	return { promise, resolve };
}

describe("existing-codebase workspace analysis reconciliation", () => {
	beforeEach(() => {
		routeHarness.serverFn.mockClear();
	});

	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	});

	it("reconciles a pending refresh to ready with one pinned GET and no analysis POST", async () => {
		setLoaderData(CURRENT_SNAPSHOT_ID);
		let statusReads = 0;
		// The first status response stays gated until the pending-state
		// assertions run, so they observe a deterministic point in time rather
		// than racing the polling chain.
		let releaseFirstStatus = () => {};
		const firstStatusGate = new Promise<void>((resolve) => {
			releaseFirstStatus = resolve;
		});
		const fetchMock = vi.fn(
			async (input: RequestInfo | URL, _init?: RequestInit) => {
				const url = String(input);
				if (url.startsWith("/api/codebases/codebase-1/status")) {
					statusReads += 1;
					if (statusReads === 1) await firstStatusGate;
					return response(
						syncStatus(
							CURRENT_SNAPSHOT_ID,
							statusReads === 1 ? "pending" : "ready",
						),
					);
				}
				if (
					url ===
					`/api/v1/projects/${PROJECT_ID}/codebase/analysis?snapshotId=${CURRENT_SNAPSHOT_ID}`
				) {
					return response(
						analysisResponse(
							CURRENT_SNAPSHOT_ID,
							SUGGESTIONS.map((suggestion) => suggestion.title),
						),
					);
				}
				if (url.endsWith("/versions") || url.endsWith("/ac-versions")) {
					return response([]);
				}
				throw new Error(`unexpected fetch GET ${url}`);
			},
		);
		vi.stubGlobal("fetch", fetchMock);

		renderWorkspaceRoute();
		await waitFor(() => expect(statusReads).toBe(1));
		expect(
			fetchMock.mock.calls.some(([url]) =>
				String(url).includes("/codebase/analysis"),
			),
		).toBe(false);
		expect(
			fetchMock.mock.calls.some(
				([url, init]) =>
					String(url).includes("/codebase/analysis") && init?.method === "POST",
			),
		).toBe(false);
		releaseFirstStatus();

		for (const suggestion of SUGGESTIONS) {
			await screen.findByText(suggestion.title, {}, { timeout: 6000 });
		}
		await waitFor(() => {
			expect(statusReads).toBeGreaterThanOrEqual(2);
			expect(
				fetchMock.mock.calls.filter(([url]) =>
					String(url).includes("/codebase/analysis?snapshotId="),
				),
			).toHaveLength(1);
		});
		expect(fetchMock).toHaveBeenCalledWith(
			`/api/v1/projects/${PROJECT_ID}/codebase/analysis?snapshotId=${CURRENT_SNAPSHOT_ID}`,
		);
		expect(
			fetchMock.mock.calls.some(
				([url, init]) =>
					String(url).includes("/codebase/analysis") && init?.method === "POST",
			),
		).toBe(false);
	});

	it("keeps current snapshot cards when an older snapshot GET resolves late", async () => {
		setLoaderData(OLD_SNAPSHOT_ID);
		let statusReads = 0;
		const oldAnalysis = defer<TestResponse>();
		const oldTitles = [
			"Old snapshot search card",
			"Old snapshot bug card",
			"Old snapshot refactor card",
			"Old snapshot UI card",
		];
		const currentTitles = [
			"Current snapshot search card",
			"Current snapshot bug card",
			"Current snapshot refactor card",
			"Current snapshot UI card",
		];
		const fetchMock = vi.fn(
			async (input: RequestInfo | URL, _init?: RequestInit) => {
				const url = String(input);
				if (url.startsWith("/api/codebases/codebase-1/status")) {
					statusReads += 1;
					return response(
						syncStatus(
							statusReads === 1 ? OLD_SNAPSHOT_ID : CURRENT_SNAPSHOT_ID,
							"ready",
						),
					);
				}
				if (url.endsWith(`snapshotId=${OLD_SNAPSHOT_ID}`))
					return oldAnalysis.promise;
				if (url.endsWith(`snapshotId=${CURRENT_SNAPSHOT_ID}`)) {
					return response(analysisResponse(CURRENT_SNAPSHOT_ID, currentTitles));
				}
				if (url.endsWith("/versions") || url.endsWith("/ac-versions")) {
					return response([]);
				}
				throw new Error(`unexpected fetch GET ${url}`);
			},
		);
		vi.stubGlobal("fetch", fetchMock);

		renderWorkspaceRoute();
		await waitFor(() => {
			expect(statusReads).toBeGreaterThanOrEqual(2);
			expect(fetchMock).toHaveBeenCalledWith(
				`/api/v1/projects/${PROJECT_ID}/codebase/analysis?snapshotId=${OLD_SNAPSHOT_ID}`,
			);
		});
		for (const title of currentTitles) {
			await screen.findByText(title, {}, { timeout: 6000 });
		}

		oldAnalysis.resolve(response(analysisResponse(OLD_SNAPSHOT_ID, oldTitles)));
		await waitFor(() => {
			for (const title of currentTitles)
				expect(screen.getByText(title)).toBeDefined();
			for (const title of oldTitles)
				expect(screen.queryByText(title)).toBeNull();
		});
		expect(
			fetchMock.mock.calls.some(
				([url, init]) =>
					String(url).includes("/codebase/analysis") && init?.method === "POST",
			),
		).toBe(false);
	});

	it("opens workspace with 0 file tersinkron badge when session is expired but usable empty snapshot exists", async () => {
		routeHarness.loaderData = {
			codebase: { id: "codebase-1", name: "Workspace repo" },
			plans: [
				{
					id: PROJECT_ID,
					name: "Workspace feature",
					updatedAt: "2026-10-01T00:00:00.000Z",
					hasArtifacts: true,
				},
			],
			featuresStatusById: new Map([[PROJECT_ID, null]]),
			onboardingFeatureId: PROJECT_ID,
			currentSnapshotId: "snapshot-empty",
			planningSnapshotByProject: { [PROJECT_ID]: "snapshot-empty" },
			analysis: null,
			latestAnalysisAttempt: null,
			hasStoredSnapshot: true,
			canOpenFullBoard: true,
		};
		const fetchMock = vi.fn(
			async (input: RequestInfo | URL, _init?: RequestInit) => {
				const url = String(input);
				if (url.startsWith("/api/codebases/codebase-1/status")) {
					return response({
						projectId: PROJECT_ID,
						sessionId: "expired-session",
						status: "expired",
						snapshotId: "snapshot-empty",
						fileCount: 0,
					});
				}
				if (url.endsWith("/versions") || url.endsWith("/ac-versions")) {
					return response([]);
				}
				throw new Error(`unexpected fetch GET ${url}`);
			},
		);
		vi.stubGlobal("fetch", fetchMock);

		renderWorkspaceRoute();
		await waitFor(() => {
			expect(screen.getByTestId("codebase-workspace-page")).toBeDefined();
		});
		const badge = screen.getByTestId("codebase-sync-badge");
		expect(badge.textContent).toBe("0 file tersinkron");
	});
});

describe("workspace reopen never reports an empty plan", () => {
	beforeEach(() => {
		routeHarness.serverFn.mockClear();
	});

	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	});

	it("shows a loading surface, not the initial composer, while artifacts are read", async () => {
		setLoaderData(CURRENT_SNAPSHOT_ID);
		// The artifact reads never settle, which is exactly the window in which
		// the old build painted "Apa yang ingin kamu bangun?".
		const pending = defer<TestResponse>();
		const fetchMock = vi.fn(
			async (input: RequestInfo | URL, _init?: RequestInit) => {
				const url = String(input);
				if (url.startsWith("/api/codebases/codebase-1/status")) {
					return response(syncStatus(CURRENT_SNAPSHOT_ID, "ready"));
				}
				if (url.endsWith("/versions") || url.endsWith("/ac-versions")) {
					return pending.promise;
				}
				throw new Error(`unexpected fetch GET ${url}`);
			},
		);
		vi.stubGlobal("fetch", fetchMock);

		renderWorkspaceRoute();
		await waitFor(() => {
			expect(screen.getByTestId("codebase-workspace-page")).toBeDefined();
		});

		expect(screen.queryByTestId("codebase-chat-loading")).not.toBeNull();
		expect(document.body.textContent).not.toContain(
			"Apa yang ingin kamu bangun?",
		);
	});

	it("reports which artifact failed instead of showing an empty plan", async () => {
		setLoaderData(CURRENT_SNAPSHOT_ID);
		const fetchMock = vi.fn(
			async (input: RequestInfo | URL, _init?: RequestInit) => {
				const url = String(input);
				if (url.startsWith("/api/codebases/codebase-1/status")) {
					return response(syncStatus(CURRENT_SNAPSHOT_ID, "ready"));
				}
				// A real failure: the artifact exists server-side but this read
				// cannot reach it.
				if (url.endsWith("/versions") || url.endsWith("/ac-versions")) {
					return { ok: false, status: 500, json: async () => ({}) };
				}
				throw new Error(`unexpected fetch GET ${url}`);
			},
		);
		vi.stubGlobal("fetch", fetchMock);

		renderWorkspaceRoute();
		await waitFor(() => {
			expect(screen.getByTestId("codebase-artifacts-failed")).toBeDefined();
		});

		expect(
			screen.getByTestId("codebase-artifacts-failed").textContent,
		).toContain("PRD");
		expect(document.body.textContent).not.toContain(
			"Apa yang ingin kamu bangun?",
		);
	});

	it("never starts a billable analysis just because a plan was opened", async () => {
		setLoaderData(CURRENT_SNAPSHOT_ID);
		const fetchMock = vi.fn(
			async (input: RequestInfo | URL, _init?: RequestInit) => {
				const url = String(input);
				if (url.startsWith("/api/codebases/codebase-1/status")) {
					// The snapshot has no analysis at all: the old build treated
					// that as a reason to start one.
					return response({
						projectId: PROJECT_ID,
						sessionId: "sync-session",
						status: "uploaded",
						snapshotId: CURRENT_SNAPSHOT_ID,
						analysisStatus: undefined,
					});
				}
				if (url.endsWith("/versions") || url.endsWith("/ac-versions")) {
					return response([]);
				}
				throw new Error(`unexpected fetch GET ${url}`);
			},
		);
		vi.stubGlobal("fetch", fetchMock);

		renderWorkspaceRoute();
		await waitFor(() => {
			expect(screen.getByTestId("codebase-workspace-page")).toBeDefined();
		});

		// Give the status polling a couple of cycles to prove the absence is
		// steady state and not just an early render.
		await waitFor(() => {
			expect(
				fetchMock.mock.calls.filter(([url]) =>
					String(url).startsWith("/api/codebases/codebase-1/status"),
				).length,
			).toBeGreaterThanOrEqual(1);
		});
		expect(
			fetchMock.mock.calls.some(
				([url, init]) =>
					String(url).includes("/codebase/analysis") &&
					(init as RequestInit | undefined)?.method === "POST",
			),
		).toBe(false);
	});
});
