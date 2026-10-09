import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
	post: null as
		| null
		| ((args: {
				request: Request;
				params: { id: string };
		  }) => Promise<Response>),
	selects: [] as unknown[][],
	selectCalls: 0,
	requestAnalysis: vi.fn(),
	claimRefresh: vi.fn(),
	reserve: vi.fn(),
	release: vi.fn(),
	settle: vi.fn(),
	effectiveState: "active_paid",
	updates: [] as Array<{ values: unknown; condition: unknown }>,
}));

vi.mock("@tanstack/react-router", () => ({
	createFileRoute:
		() => (options: { server: { handlers: { POST: typeof state.post } } }) => {
			state.post = options.server.handlers.POST;
			return options;
		},
}));
vi.mock("drizzle-orm", () => ({
	and: (...args: unknown[]) => ({ args }),
	desc: (column: unknown) => ({ column }),
	eq: (column: unknown, value: unknown) => ({ column, value }),
	inArray: (column: unknown, values: unknown[]) => ({ column, values }),
	isNull: (column: unknown) => ({ column }),
}));
vi.mock("@/db/schema", () => {
	const cols = (table: string, names: string[]) =>
		Object.fromEntries(names.map((name) => [name, `${table}.${name}`]));
	return {
		codebaseAnalyses: cols("analyses", [
			"id",
			"projectId",
			"snapshotId",
			"status",
			"output",
			"createdAt",
		]),
		codebaseSnapshots: cols("snapshots", [
			"id",
			"syncSessionId",
			"status",
			"fileCount",
			"contentSize",
			"createdAt",
		]),
		codebaseSyncSessions: cols("sessions", [
			"id",
			"projectId",
			"codebaseId",
			"userId",
			"createdAt",
		]),
		codebases: cols("codebases", ["id", "userId"]),
		projects: cols("projects", [
			"id",
			"projectMode",
			"codebaseId",
			"userId",
			"deletedAt",
		]),
		subscriptions: cols("subscriptions", [
			"plan",
			"status",
			"credits",
			"creditsUsed",
			"creditsReserved",
			"currentPeriodStart",
			"currentPeriodEnd",
			"cancelledAt",
			"createdAt",
			"userId",
		]),
	};
});
vi.mock("@/db", () => ({
	db: {
		select: () => {
			const selectIndex = state.selectCalls++;

			const rows = state.selects[selectIndex] ?? [];
			const chain: Record<string, unknown> = {};
			chain.from = () => chain;
			chain.where = () => chain;
			chain.orderBy = () =>
				selectIndex === 3 || selectIndex === 5 ? Promise.resolve(rows) : chain;
			chain.limit = () => Promise.resolve(rows);
			return chain;
		},
		update: () => {
			const chain: Record<string, unknown> = {};
			chain.set = (values: unknown) => {
				chain.where = (condition: unknown) => {
					state.updates.push({ values, condition });
					return Promise.resolve([]);
				};
				return chain;
			};
			chain.where = () => Promise.resolve([]);
			return chain;
		},
	},
}));
vi.mock("@/lib/session", () => ({
	requireUser: vi.fn(async () => ({ id: "user-1" })),
}));
vi.mock("@/lib/rate-limit", () => ({
	checkRateLimit: vi.fn(async () => ({ allowed: true })),
}));
vi.mock("@/lib/billing", () => ({
	resolveSubscriptionState: vi.fn(() => ({ state: state.effectiveState })),
}));
vi.mock("@/lib/codebase-analysis.server", () => ({
	AnalysisServiceError: class AnalysisServiceError extends Error {
		code: string;
		analysisId?: string;
		constructor(code: string, message: string, analysisId?: string) {
			super(message);
			this.code = code;
			this.analysisId = analysisId;
		}
	},
	claimStarterSuggestionRefresh: state.claimRefresh,
	requestCodebaseAnalysis: state.requestAnalysis,
}));
vi.mock("@/lib/services/credit-service", () => ({
	buildCodebaseMetrics: vi.fn(() => ({ units: 1 })),
	createCreditQuote: vi.fn(() => ({ maximumCredits: 1 })),
	formatInsufficientCreditsError: vi.fn(() => ({ error: "insufficient" })),
	formatSubscriptionPausedError: vi.fn(() => ({ error: "paused" })),
	isReleasableReservation: vi.fn((value: string) => value !== "running"),
	markCreditOperationRunning: vi.fn(async () => ({ state: "running" })),
	releaseCreditOperation: state.release,
	reserveActiveCreditOperation: state.reserve,
	settleCreditOperation: state.settle,
}));

const suggestions = [
	{
		id: "feature",
		title: "Feature",
		description: "Add a feature",
		prompt: "Build it",
	},
	{
		id: "bugfix",
		title: "Bug fix",
		description: "Fix a bug",
		prompt: "Fix it",
	},
	{
		id: "refactor",
		title: "Refactor",
		description: "Refactor code",
		prompt: "Refactor it",
	},
	{ id: "ui", title: "UI", description: "Improve UI", prompt: "Improve it" },
];
const legacy = {
	id: "analysis-legacy",
	projectId: "project-1",
	snapshotId: "snapshot-1",
	status: "ready",
	output: {
		projectId: "project-1",
		snapshotId: "snapshot-1",
		framework: "React",
	},
	createdAt: new Date("2025-01-01T00:00:00Z"),
};
const snapshot = {
	id: "snapshot-1",
	status: "uploaded",
	fileCount: 3,
	contentSize: 500,
};
const project = {
	id: "project-1",
	projectMode: "existing_codebase",
	codebaseId: "codebase-1",
	userId: "user-1",
};
const subscription = {
	plan: "pro",
	status: "active",
	credits: 10,
	creditsUsed: 0,
	creditsReserved: 0,
};

import "../routes/api/v1/projects/$id/codebase/analysis";

function post() {
	if (!state.post) throw new Error("analysis POST route was not registered");
	return state.post;
}

function setup(analyses: unknown[] = [legacy], ordinary = false) {
	state.selectCalls = 0;
	state.selects = [
		[{ plan: "pro" }],
		[project],
		[{ userId: "user-1" }],
		[{ id: "session-1" }],
		[snapshot],
		analyses,
		ordinary ? [legacy] : [subscription],
		ordinary
			? [subscription]
			: [
					{
						...legacy,
						id: "analysis-new",
						status: "ready",
						output: { ...legacy.output, starterSuggestions: suggestions },
					},
				],
	];
	state.claimRefresh.mockResolvedValue({
		action: "create",
		analysisId: "analysis-new",
	});
	state.requestAnalysis.mockResolvedValue({ id: "analysis-new" });
	state.reserve.mockResolvedValue({ id: "credit-op-1", state: "reserved" });
	state.release.mockResolvedValue({ state: "released" });
	state.settle.mockResolvedValue({ state: "settled" });
}

function request(body: unknown) {
	return new Request("http://localhost/api", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(body),
	});
}

beforeEach(() => {
	vi.clearAllMocks();
	state.selectCalls = 0;
	state.effectiveState = "active_paid";
	state.selects = [];
	state.updates = [];
});

describe("analysis refresh POST route", () => {
	it("creates an appended attempt only for the pinned legacy analysis", async () => {
		setup();
		const response = await post()({
			request: request({
				snapshotId: "snapshot-1",
				refreshStarterSuggestionsForAnalysisId: "analysis-legacy",
			}),
			params: { id: "project-1" },
		});
		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({
			id: "analysis-new",
			status: "ready",
		});
		expect(state.claimRefresh).toHaveBeenCalledWith({
			projectId: "project-1",
			snapshotId: "snapshot-1",
			targetAnalysisId: "analysis-legacy",
			scope: { codebaseId: "codebase-1" },
		});
		expect(state.requestAnalysis).toHaveBeenCalledWith(
			"project-1",
			"snapshot-1",
			{},
			{ codebaseId: "codebase-1", claimedAnalysisId: "analysis-new" },
		);
	});

	it("rejects malformed legacy output without reserving credit or calling the model", async () => {
		setup([{ ...legacy, output: { ...legacy.output, framework: 7 } }]);
		const response = await post()({
			request: request({
				snapshotId: "snapshot-1",
				refreshStarterSuggestionsForAnalysisId: "analysis-legacy",
			}),
			params: { id: "project-1" },
		});
		expect(response.status).toBe(409);
		expect(await response.json()).toMatchObject({
			code: "ANALYSIS_REFRESH_NOT_ALLOWED",
		});
		expect(state.reserve).not.toHaveBeenCalled();
		expect(state.requestAnalysis).not.toHaveBeenCalled();
	});

	it("keeps ordinary ready-analysis requests on the existing free reuse path", async () => {
		setup([legacy], true);
		const response = await post()({
			request: request({ snapshotId: "snapshot-1" }),
			params: { id: "project-1" },
		});
		expect(response.status).toBe(200);
		expect((await response.json()).id).toBe("analysis-legacy");
		expect(state.reserve).not.toHaveBeenCalled();
		expect(state.requestAnalysis).not.toHaveBeenCalled();
	});

	it("does not claim a refresh when credits are insufficient", async () => {
		setup();
		state.selects[6] = [{ ...subscription, credits: 0 }];
		const response = await post()({
			request: request({
				snapshotId: "snapshot-1",
				refreshStarterSuggestionsForAnalysisId: "analysis-legacy",
			}),
			params: { id: "project-1" },
		});
		expect(response.status).toBe(403);
		expect(state.claimRefresh).not.toHaveBeenCalled();
	});

	it("does not claim a refresh for a paused subscription", async () => {
		setup();
		state.effectiveState = "paused";
		const response = await post()({
			request: request({
				snapshotId: "snapshot-1",
				refreshStarterSuggestionsForAnalysisId: "analysis-legacy",
			}),
			params: { id: "project-1" },
		});
		expect(response.status).toBe(403);
		expect(state.claimRefresh).not.toHaveBeenCalled();
	});

	it("marks a claimed refresh failed when credit reservation fails", async () => {
		setup();
		state.reserve.mockRejectedValueOnce(new Error("reservation failed"));
		const response = await post()({
			request: request({
				snapshotId: "snapshot-1",
				refreshStarterSuggestionsForAnalysisId: "analysis-legacy",
			}),
			params: { id: "project-1" },
		});
		expect(response.status).toBe(403);
		expect(state.updates).toHaveLength(1);
		expect(state.updates[0]?.values).toMatchObject({
			status: "failed",
			errorCode: "ANALYSIS_FAILED",
		});
	});
});
