import { beforeEach, describe, expect, it, vi } from "vitest";

// The handshake handler composes its write predicate from drizzle-orm
// operators and runs it inside a transaction. Reads are queued fixed rows and
// the update predicate is recorded (never executed), so the ownership,
// provenance, and idempotency contracts are asserted against real handler code
// without a live database.
const recorder = vi.hoisted(() => ({
	updates: [] as Array<{
		table: unknown;
		set: Record<string, unknown> | null;
		where: unknown;
	}>,
	dbQueue: [] as unknown[][],
	txQueue: [] as unknown[][],
}));

const SESSION_ROW = {
	id: "sess-1",
	projectId: null,
	codebaseId: "cb-1",
	userId: "user-1",
	status: "waiting_for_cli",
	expiresAt: new Date(Date.now() + 30 * 60 * 1000),
	consumedAt: null,
	cliMinVersion: "2.0.0",
	metadata: null,
};

vi.mock("drizzle-orm", () => ({
	and: (...args: unknown[]) => ({ op: "and", args }),
	desc: (col: unknown) => ({ op: "desc", col }),
	eq: (col: unknown, value: unknown) => ({ op: "eq", col, value }),
	ne: (col: unknown, value: unknown) => ({ op: "ne", col, value }),
	sql: Object.assign(() => ({ op: "sql" }), { raw: () => ({ op: "sql" }) }),
}));

type HandshakeHandler = (args: {
	request: Request;
	params: { id: string };
}) => Promise<Response>;

const captured = vi.hoisted(() => ({
	post: null as
		| ((args: {
				request: Request;
				params: { id: string };
		  }) => Promise<Response>)
		| null,
}));

vi.mock("@tanstack/react-router", () => ({
	createFileRoute:
		() =>
		(options: { server: { handlers: { POST: typeof captured.post } } }) => {
			captured.post = options.server.handlers.POST;
			return options;
		},
}));

vi.mock("@/lib/rate-limit", () => ({
	checkRateLimit: vi.fn(async () => ({ allowed: true })),
}));

vi.mock("@/db/schema", () => ({
	codebases: {
		id: "codebases.id",
		userId: "codebases.user_id",
		name: "codebases.name",
		nameSource: "codebases.name_source",
	},
	codebaseSnapshots: {
		id: "codebase_snapshots.id",
		syncSessionId: "codebase_snapshots.sync_session_id",
		createdAt: "codebase_snapshots.created_at",
	},
	codebaseSyncSessions: {
		id: "codebase_sync_sessions.id",
		status: "codebase_sync_sessions.status",
		metadata: "codebase_sync_sessions.metadata",
		credentialHash: "codebase_sync_sessions.credential_hash",
		codebaseId: "codebase_sync_sessions.codebase_id",
	},
	subscriptions: { plan: "subscriptions.plan" },
}));

vi.mock("@/db", () => {
	function codebaseScopeOf(cond: unknown): string | null {
		if (typeof cond !== "object" || cond === null) return null;
		const args = (cond as { args?: unknown[] }).args ?? [];
		for (const arg of args) {
			const clause = arg as { op?: string; col?: unknown; value?: unknown };
			if (
				clause.op === "eq" &&
				clause.col === "codebase_sync_sessions.codebase_id" &&
				typeof clause.value === "string"
			) {
				return clause.value;
			}
		}
		return null;
	}
	function fakeSelect(queue: unknown[][]) {
		const chain: Record<string, unknown> = {};
		let scope: string | null = null;
		chain.from = () => chain;
		chain.where = (cond: unknown) => {
			scope = codebaseScopeOf(cond);
			return chain;
		};
		chain.orderBy = () => chain;
		chain.limit = () => {
			const rows = queue.shift() ?? [];
			// The real query filters the credential lookup by the addressed
			// codebase; the fake honors that so a session issued for one
			// codebase cannot authenticate another.
			if (scope === null) return Promise.resolve(rows);
			return Promise.resolve(
				rows.filter(
					(row) =>
						typeof row === "object" &&
						row !== null &&
						(row as { codebaseId?: unknown }).codebaseId === scope,
				),
			);
		};
		return chain;
	}
	function fakeUpdate(table: unknown) {
		const record = {
			table,
			set: null as Record<string, unknown> | null,
			where: null as unknown,
		};
		recorder.updates.push(record);
		const chain: Record<string, unknown> = {
			set: (values: Record<string, unknown>) => {
				record.set = values;
				return chain;
			},
			where: (cond: unknown) => {
				record.where = cond;
				return Promise.resolve([]);
			},
		};
		return chain;
	}
	function fakeInsert() {
		const chain: Record<string, unknown> = {
			values: () => chain,
			returning: () => Promise.resolve([{ id: "snap-1" }]),
		};
		return chain;
	}
	const tx = {
		execute: () => Promise.resolve(),
		select: () => fakeSelect(recorder.txQueue),
		update: fakeUpdate,
		insert: fakeInsert,
	};
	return {
		db: {
			select: () => fakeSelect(recorder.dbQueue),
			transaction: (fn: (t: unknown) => Promise<unknown>) => fn(tx),
		},
	};
});

import { codebases } from "@/db/schema";
import "../routes/api/v1/codebases/$id/codebase/sync";

function handshake(): HandshakeHandler {
	if (!captured.post) throw new Error("handshake route was not registered");
	return captured.post;
}

const OWNED_CODEBASE = { id: "cb-1", userId: "user-1" };

function sessionRow(overrides: Record<string, unknown> = {}) {
	return { ...SESSION_ROW, ...overrides };
}

/** Queue the reads the handler performs, in order, for a successful handshake. */
function queueOwnedHandshake(
	session: Record<string, unknown> = sessionRow(),
): void {
	recorder.dbQueue.push([session], [OWNED_CODEBASE], []);
	recorder.txQueue.push([{ status: "waiting_for_cli", metadata: null }], []);
}

function handshakeRequest(body: unknown, token = "raw-sync-token"): Request {
	const headers: Record<string, string> = {
		"Content-Type": "application/json",
	};
	if (token) headers.Authorization = `Bearer ${token}`;
	return new Request(
		"https://example.test/api/v1/codebases/cb-1/codebase/sync",
		{
			method: "POST",
			headers,
			body: JSON.stringify(body),
		},
	);
}

function invoke(body: unknown, codebaseId = "cb-1"): Promise<Response> {
	return handshake()({
		request: handshakeRequest(body),
		params: { id: codebaseId },
	});
}

function codebaseUpdates() {
	return recorder.updates.filter((entry) => entry.table === codebases);
}

beforeEach(() => {
	recorder.updates.length = 0;
	recorder.dbQueue.length = 0;
	recorder.txQueue.length = 0;
});

describe("handshake repository auto-naming", () => {
	it("replaces the placeholder name when the CLI reports a repository name", async () => {
		queueOwnedHandshake();

		const res = await invoke({
			cliVersion: "3.0.0",
			repositoryName: "react-movie-app",
		});

		expect(res.status).toBe(200);
		const updates = codebaseUpdates();
		expect(updates).toHaveLength(1);
		expect(updates[0]?.set).toMatchObject({ name: "react-movie-app" });
	});

	it("scopes the rename to the session owner and an auto-sourced name", async () => {
		queueOwnedHandshake();

		await invoke({ cliVersion: "3.0.0", repositoryName: "react-movie-app" });

		expect(codebaseUpdates()[0]?.where).toEqual({
			op: "and",
			args: [
				{ op: "eq", col: "codebases.id", value: "cb-1" },
				{ op: "eq", col: "codebases.user_id", value: "user-1" },
				{ op: "eq", col: "codebases.name_source", value: "auto" },
				{ op: "ne", col: "codebases.name", value: "react-movie-app" },
			],
		});
	});

	it("leaves the name untouched when the reported name already matches", async () => {
		queueOwnedHandshake();

		await invoke({ cliVersion: "3.0.0", repositoryName: "react-movie-app" });

		const where = codebaseUpdates()[0]?.where as { args: unknown[] };
		// The `name != repositoryName` guard is what makes a repeat sync a no-op
		// for naming instead of a second write.
		expect(where.args).toContainEqual({
			op: "ne",
			col: "codebases.name",
			value: "react-movie-app",
		});
	});

	it("ignores a missing repository name so an older CLI still syncs", async () => {
		queueOwnedHandshake();

		const res = await invoke({ cliVersion: "2.0.0" });

		expect(res.status).toBe(200);
		expect(codebaseUpdates()).toHaveLength(0);
	});

	it("ignores a path-like repository name instead of persisting a local path", async () => {
		queueOwnedHandshake();

		const res = await invoke({
			cliVersion: "3.0.0",
			repositoryName: "C:\\Coding\\project",
		});

		expect(res.status).toBe(200);
		expect(codebaseUpdates()).toHaveLength(0);
	});

	it("ignores a traversal-shaped repository name and keeps syncing", async () => {
		queueOwnedHandshake();

		const res = await invoke({
			cliVersion: "3.0.0",
			repositoryName: "../project",
		});

		expect(res.status).toBe(200);
		expect(codebaseUpdates()).toHaveLength(0);
	});

	it("ignores a repository name that is not a single path segment", async () => {
		queueOwnedHandshake();

		const res = await invoke({
			cliVersion: "3.0.0",
			repositoryName: "/home/user/project",
		});

		expect(res.status).toBe(200);
		expect(codebaseUpdates()).toHaveLength(0);
	});

	it("does not rename another tenant's codebase when the credential owner differs", async () => {
		queueOwnedHandshake(sessionRow({ userId: "user-2" }));

		const res = await invoke({
			cliVersion: "3.0.0",
			repositoryName: "react-movie-app",
		});

		expect(res.status).toBe(401);
		expect(codebaseUpdates()).toHaveLength(0);
	});

	it("does not rename anything without a sync credential", async () => {
		recorder.dbQueue.push([], [], []);

		const res = await handshake()({
			request: handshakeRequest({ cliVersion: "3.0.0" }, ""),
			params: { id: "cb-1" },
		});

		expect(res.status).toBe(401);
		expect(codebaseUpdates()).toHaveLength(0);
	});

	it("does not rename a codebase the session is not bound to", async () => {
		recorder.dbQueue.push(
			[sessionRow()],
			[{ id: "cb-1", userId: "user-1" }],
			[],
		);
		recorder.txQueue.push([{ status: "waiting_for_cli", metadata: null }], []);

		const res = await invoke(
			{ cliVersion: "3.0.0", repositoryName: "react-movie-app" },
			"cb-2",
		);

		// The credential is looked up scoped to the addressed codebase, so a
		// session issued for cb-1 cannot authenticate a rename of cb-2.
		expect(res.status).toBe(401);
		expect(codebaseUpdates()).toHaveLength(0);
	});
});
