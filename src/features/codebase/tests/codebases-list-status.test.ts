import { beforeEach, describe, expect, it, vi } from "vitest";

// P02 regression: GET /api/codebases must answer a classified response when the
// pooled Postgres connection is reset mid-request.
//
// Reproduced failure (before the fix): the handler ran two ownership-scoped
// selects with no error boundary, so drizzle's `DrizzleQueryError`
// (`cause: read ECONNRESET`) escaped the route. TanStack Start answered with
// `{"status":500,"unhandled":true,"message":"HTTPError"}`, i.e. an opaque 500
// with no retry contract, and the dev middleware logged the raw socket error.

const state = vi.hoisted(() => ({
	selectCall: 0,
	failWith: null as Error | null,
	codebases: [
		{ id: "cb-1", name: "Repo", createdAt: new Date("2026-01-01T00:00:00Z") },
	],
	snapshots: [
		{
			id: "snap-1",
			codebaseId: "cb-1",
			createdAt: new Date("2026-01-02T00:00:00Z"),
			commitSha: "abc123",
			fileCount: 7,
		},
	],
}));

const sessionMock = vi.hoisted(() => ({
	requireUser: vi.fn(async () => ({ id: "user-1" })),
}));

const captured = vi.hoisted(() => ({
	get: null as ((args: { request: Request }) => Promise<Response>) | null,
}));

vi.mock("@tanstack/react-router", () => ({
	createFileRoute:
		() =>
		(options: {
			server: {
				handlers: {
					GET: (args: { request: Request }) => Promise<Response>;
				};
			};
		}) => {
			captured.get = options.server.handlers.GET;
			return options;
		},
}));

vi.mock("@/lib/session", () => sessionMock);

vi.mock("@/db", () => {
	function selectChain(rows: unknown[]) {
		const chain: Record<string, unknown> = {
			from: () => chain,
			innerJoin: () => chain,
			where: () => chain,
			orderBy: () =>
				state.failWith ? Promise.reject(state.failWith) : Promise.resolve(rows),
		};
		return chain;
	}
	return {
		db: {
			select: () => {
				const rows = state.selectCall === 0 ? state.codebases : state.snapshots;
				state.selectCall += 1;
				return selectChain(rows);
			},
		},
	};
});

import "@/routes/api/codebases/index";

function list(path = "/api/codebases"): Promise<Response> {
	if (!captured.get) throw new Error("codebase list route was not registered");
	return captured.get({ request: new Request(`https://example.test${path}`) });
}

function socketResetError(): Error {
	const error = new Error("Failed query: select 1 params: session-token-value");
	error.name = "DrizzleQueryError";
	const cause = new Error("read ECONNRESET");
	cause.stack =
		"read ECONNRESET\n    at TCP.onStreamRead (node:internal/stream_base_commons:216:20)";
	(error as Error & { cause?: unknown }).cause = cause;
	return error;
}

let warnSpy: ReturnType<typeof vi.spyOn>;
let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
	state.selectCall = 0;
	state.failWith = null;
	sessionMock.requireUser.mockReset();
	sessionMock.requireUser.mockImplementation(async () => ({ id: "user-1" }));
	warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
	errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("GET /api/codebases", () => {
	it("lists owned codebases with their latest snapshot", async () => {
		const res = await list();

		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({
			codebases: [
				{
					id: "cb-1",
					name: "Repo",
					createdAt: "2026-01-01T00:00:00.000Z",
					latestSnapshot: {
						id: "snap-1",
						createdAt: "2026-01-02T00:00:00.000Z",
						commitSha: "abc123",
						fileCount: 7,
					},
				},
			],
		});
	});

	it("answers a retryable 503 when the database connection is reset", async () => {
		state.failWith = socketResetError();

		const res = await list();

		expect(res.status).toBe(503);
		expect(res.headers.get("Retry-After")).toBe("2");
		expect(await res.json()).toEqual({
			error: "Layanan data sedang tidak tersedia. Coba lagi.",
			code: "SERVICE_UNAVAILABLE",
			retryable: true,
		});
		// One classified line per outage, no stack and no drizzle parameters.
		expect(warnSpy).toHaveBeenCalledTimes(1);
		expect(errorSpy).not.toHaveBeenCalled();
		const logged = warnSpy.mock.calls.flat().join(" ");
		expect(logged).not.toContain("session-token-value");
	});

	it("answers a classified 500 for a non-transient fault", async () => {
		state.failWith = Object.assign(new Error("invalid input syntax"), {
			name: "DrizzleQueryError",
			code: "22P02",
		});

		const res = await list();

		expect(res.status).toBe(500);
		expect(await res.json()).toEqual({
			error: "Gagal memproses permintaan. Coba lagi.",
			code: "CODEBASE_REQUEST_FAILED",
		});
	});

	it("does not report a session-store outage as 401", async () => {
		sessionMock.requireUser.mockImplementation(async () => {
			throw socketResetError();
		});

		const res = await list();

		expect(res.status).toBe(503);
		const body = (await res.json()) as { code: string };
		expect(body.code).toBe("SERVICE_UNAVAILABLE");
	});

	it("does not report better-auth's bodiless APIError as 401", async () => {
		sessionMock.requireUser.mockImplementation(async () => {
			throw Object.assign(new Error("Failed to get session"), {
				name: "APIError",
				status: "INTERNAL_SERVER_ERROR",
			});
		});

		const res = await list();

		expect(res.status).toBe(503);
	});

	it("keeps 401 for an actually missing session", async () => {
		sessionMock.requireUser.mockImplementation(async () => {
			throw new Error("Unauthorized");
		});

		const res = await list();

		expect(res.status).toBe(401);
		expect(await res.json()).toEqual({ error: "Unauthorized" });
	});
});
