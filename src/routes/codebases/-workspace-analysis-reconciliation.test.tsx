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
	feature: { id: string; name: string; featuresStatus?: string | null } | null;
	onboardingFeature: { id: string; name: string } | null;
	currentSnapshotId: string | null;
	analysis: null;
	hasStoredSnapshot: boolean;
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
		feature: { id: PROJECT_ID, name: "Workspace feature" },
		onboardingFeature: { id: PROJECT_ID, name: "Workspace feature" },
		currentSnapshotId: snapshotId,
		analysis: null,
		hasStoredSnapshot: false,
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
		const fetchMock = vi.fn(
			async (input: RequestInfo | URL, _init?: RequestInit) => {
				const url = String(input);
				if (url.startsWith("/api/codebases/codebase-1/status")) {
					statusReads += 1;
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
			feature: { id: PROJECT_ID, name: "Workspace feature" },
			onboardingFeature: { id: PROJECT_ID, name: "Workspace feature" },
			currentSnapshotId: "snapshot-empty",
			analysis: null,
			hasStoredSnapshot: true,
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
