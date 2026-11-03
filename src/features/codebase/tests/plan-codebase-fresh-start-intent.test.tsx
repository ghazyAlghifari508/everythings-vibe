// @vitest-environment jsdom
import { cleanup, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parsePlanCodebaseSearch } from "@/features/codebase/services/onboarding-intent";
import { readPlanCodebaseProjectPointer } from "@/features/codebase/services/plan-storage";
import {
	PLAN_CODEBASE_ID_STORAGE_KEY,
	PLAN_CODEBASE_NAME_STORAGE_KEY,
	PLAN_CODEBASE_PROJECT_STORAGE_KEY,
} from "@/features/codebase/services/sync";
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

const OLD_CODEBASE_ID = "cb-old-1";
const OLD_CODEBASE_NAME = "repo-lama";
const OLD_PROJECT_ID = "proj-old-1";
const NEW_CODEBASE_ID = "cb-new-1";

/** An abandoned attempt: upload finished, its analysis failed. */
function abandonedAttemptStatus(): Record<string, unknown> {
	return {
		projectId: OLD_CODEBASE_ID,
		sessionId: "sess-old-1",
		status: "uploaded",
		codebaseName: OLD_CODEBASE_NAME,
		snapshotId: "snap-old-1",
		fileCount: 12,
		excludedCount: 2,
		cliConnectedAt: "2026-10-09T10:00:00.000Z",
		analysisAttemptId: "ana-old-2",
		analysisAttemptStatus: "failed",
		expiresAt: "2026-10-09T11:00:00.000Z",
	};
}

function freshSessionStatus(): Record<string, unknown> {
	return {
		projectId: NEW_CODEBASE_ID,
		sessionId: "sess-new-1",
		status: "waiting_for_cli",
		snapshotId: null,
	};
}

/**
 * The browser pointer a previous recovery left behind. The repository still
 * exists and still has an uploaded snapshot, so nothing server-side marks it
 * stale — only the navigation intent can tell the two intents apart.
 */
function seedAbandonedPointer() {
	sessionStorage.setItem(PLAN_CODEBASE_ID_STORAGE_KEY, OLD_CODEBASE_ID);
	sessionStorage.setItem(PLAN_CODEBASE_NAME_STORAGE_KEY, OLD_CODEBASE_NAME);
	sessionStorage.setItem(PLAN_CODEBASE_PROJECT_STORAGE_KEY, OLD_PROJECT_ID);
}

interface Call {
	url: string;
	method: string;
}

/** Records every request and answers each endpoint the onboarding flow uses. */
function stubOnboardingFetch(options?: {
	/** What the abandoned repository still reports, if it is ever asked. */
	oldStatus?: Record<string, unknown>;
}): Call[] {
	const calls: Call[] = [];
	const oldStatus = options?.oldStatus ?? abandonedAttemptStatus();
	const created = {
		id: NEW_CODEBASE_ID,
		name: "Repo Baru",
		sync: {
			projectId: NEW_CODEBASE_ID,
			apiBaseUrl: "http://localhost:3000",
			syncToken: "fresh-token",
			syncCommand:
				"everythings-vibe codebase sync --project-id cb-new-1 --sync-token fresh-token",
			expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
		},
	};
	vi.stubGlobal(
		"fetch",
		vi.fn(async (input: unknown, init?: RequestInit) => {
			const url = String(input);
			const method = init?.method ?? "GET";
			calls.push({ url, method });
			if (url === "/api/codebases" && method === "POST") {
				return { ok: true, status: 200, json: async () => created };
			}
			if (url.includes(`/api/codebases/${OLD_CODEBASE_ID}/status`)) {
				return {
					ok: true,
					status: 200,
					json: async () => oldStatus,
				};
			}
			if (url.includes(`/api/codebases/${NEW_CODEBASE_ID}/status`)) {
				return {
					ok: true,
					status: 200,
					json: async () => freshSessionStatus(),
				};
			}
			// Analysis/stream channels stay unanswered; both callers treat a dead
			// channel as "no data" and the assertions never depend on them.
			return { ok: false, status: 503, json: async () => ({}) };
		}),
	);
	return calls;
}

beforeEach(() => {
	useUIStore.getState().setCodebasePlanStep("sync");
	sessionStorage.clear();
});

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
	sessionStorage.clear();
});

describe("parsePlanCodebaseSearch", () => {
	it("keeps only the two known intents", () => {
		expect(parsePlanCodebaseSearch({ intent: "new" })).toEqual({
			intent: "new",
		});
		expect(parsePlanCodebaseSearch({ intent: "resume" })).toEqual({
			intent: "resume",
		});
		expect(parsePlanCodebaseSearch({ intent: "sneaky" })).toEqual({});
		expect(parsePlanCodebaseSearch({})).toEqual({});
	});
});

describe("PlanCodebasePage fresh-start intent", () => {
	it("starts a new repository instead of resuming the abandoned attempt", async () => {
		seedAbandonedPointer();
		const calls = stubOnboardingFetch();

		await renderConnectedOnboarding({ intent: "new" });

		await waitFor(() => {
			expect(
				screen.getByRole("button", { name: "Salin prompt untuk AI agent" }),
			).toBeDefined();
		});

		// A brand new session was minted...
		expect(
			calls.some(
				(call) => call.url === "/api/codebases" && call.method === "POST",
			),
		).toBe(true);
		// ...and the abandoned repository was never polled or resumed.
		expect(
			calls.some((call) =>
				call.url.startsWith(`/api/codebases/${OLD_CODEBASE_ID}/status`),
			),
		).toBe(false);
	});

	it("renders no analysis or progress from the previous session", async () => {
		seedAbandonedPointer();
		stubOnboardingFetch();

		await renderConnectedOnboarding({ intent: "new" });

		await waitFor(() => {
			expect(
				screen.getByRole("button", { name: "Salin prompt untuk AI agent" }),
			).toBeDefined();
		});

		expect(screen.queryByText(/Analisis belum berhasil/)).toBeNull();
		expect(screen.queryByText(/Menganalisis repository/)).toBeNull();
		expect(screen.queryByText(/Sinkronisasi selesai/)).toBeNull();
	});

	it("never surfaces the previous session's sync error", async () => {
		seedAbandonedPointer();
		stubOnboardingFetch({
			oldStatus: {
				...abandonedAttemptStatus(),
				status: "failed",
				snapshotId: null,
				analysisAttemptStatus: undefined,
				errorMessage: "Snapshot tidak lengkap.",
			},
		});

		await renderConnectedOnboarding({ intent: "new" });

		await waitFor(() => {
			expect(
				screen.getByRole("button", { name: "Salin prompt untuk AI agent" }),
			).toBeDefined();
		});

		expect(screen.queryByText(/Snapshot tidak lengkap/)).toBeNull();
		expect(screen.queryByText(/Sinkronisasi belum berhasil/)).toBeNull();
	});

	it("drops the previous project pointer and rebinds to the new session", async () => {
		seedAbandonedPointer();
		stubOnboardingFetch();

		await renderConnectedOnboarding({ intent: "new" });

		await waitFor(() => {
			expect(
				screen.getByRole("button", { name: "Salin prompt untuk AI agent" }),
			).toBeDefined();
		});

		expect(readPlanCodebaseProjectPointer()).toBeNull();
		expect(sessionStorage.getItem(PLAN_CODEBASE_ID_STORAGE_KEY)).toBe(
			NEW_CODEBASE_ID,
		);
	});
});

describe("PlanCodebasePage bare visit", () => {
	it("still resumes the stored attempt when no intent is given", async () => {
		seedAbandonedPointer();
		const calls = stubOnboardingFetch();

		await renderConnectedOnboarding();

		await waitFor(() => {
			expect(
				calls.some((call) =>
					call.url.startsWith(`/api/codebases/${OLD_CODEBASE_ID}/status`),
				),
			).toBe(true);
		});

		// Recovery resumes: the failed analysis of the uploaded snapshot is shown
		// with its own retry, and no new repository session is created.
		expect(await screen.findByText(/Analisis belum berhasil/)).toBeDefined();
		expect(
			calls.some(
				(call) => call.url === "/api/codebases" && call.method === "POST",
			),
		).toBe(false);
	});
});
