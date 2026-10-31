import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiKeys, feedback } from "@/db/schema";

type Handler = (args: {
	request: Request;
	params: { id: string };
}) => Promise<Response>;

/** One statement the code under test asked the driver to run, recorded with
 * the exact SQL text so assertions can check WHICH rows a write may reach. */
interface Statement {
	op: "insert" | "update" | "delete" | "execute";
	withinTransaction: boolean;
	sql: string;
	params: unknown[];
	values?: Record<string, unknown>;
}

const state = vi.hoisted(() => ({
	handlers: new Map<string, Record<string, Handler>>(),
	user: { id: "tenant-a" } as { id: string } | null,
	rows: [] as Record<string, unknown>[],
	writes: [] as { table: unknown; values: Record<string, unknown> }[],
	filters: [] as unknown[],
	projections: [] as unknown[],
	statements: [] as Statement[],
	inTransaction: false,
}));

vi.mock("@tanstack/react-router", () => ({
	createFileRoute:
		(path: string) =>
		(options: { server: { handlers: Record<string, Handler> } }) => {
			state.handlers.set(path, options.server.handlers);
			return options;
		},
}));
vi.mock("@tanstack/react-start/server", () => ({
	getRequestHeaders: () => new Headers(),
}));
vi.mock("@/lib/session", () => ({
	requireUser: async () => {
		if (!state.user) throw new Error("Unauthorized");
		return state.user;
	},
	getSessionFromHeaders: async () => (state.user ? { user: state.user } : null),
}));
function repository(withinTransaction: boolean) {
	const record = async (
		op: Statement["op"],
		filter: unknown,
		values?: Record<string, unknown>,
	) => {
		state.filters.push(filter);
		const { SQL } = await import("drizzle-orm");
		const renderedSql =
			filter instanceof SQL ? new PgDialect().sqlToQuery(filter) : null;
		state.statements.push({
			op,
			sql: renderedSql?.sql ?? String(filter),
			params: renderedSql?.params ?? [],
			...(values === undefined ? {} : { values }),
			withinTransaction,
		} satisfies Statement);
		return state.rows;
	};
	// A drizzle write builder is either awaited directly (`update().set().where()`)
	// or chained into `.returning()`; both shapes must report one statement.
	const writeResult = (
		op: Statement["op"],
		filter: unknown,
		values?: Record<string, unknown>,
	) => {
		const settled = record(op, filter, values);
		return Object.assign(settled, {
			returning: () => settled,
		});
	};

	return {
		select: (projection: unknown) => {
			state.projections.push(projection);
			return {
				from: () => ({
					where: (filter: unknown) => {
						state.filters.push(filter);
						return {
							orderBy: async () => state.rows,
							limit: async () => state.rows,
						};
					},
				}),
			};
		},
		insert: (table: unknown) => ({
			values: (values: Record<string, unknown>) => {
				state.writes.push({ table, values });
				state.statements.push({
					op: "insert",
					sql: "insert",
					params: [],
					values,
					withinTransaction,
				} satisfies Statement);
				return { returning: async () => state.rows };
			},
		}),
		update: () => ({
			set: (values: Record<string, unknown>) => ({
				where: (filter: unknown) => writeResult("update", filter, values),
			}),
		}),
		delete: () => ({
			where: (filter: unknown) => writeResult("delete", filter),
		}),
		execute: async (query: unknown) => {
			const { SQL } = await import("drizzle-orm");
			const renderedSql =
				query instanceof SQL ? new PgDialect().sqlToQuery(query) : null;
			state.statements.push({
				op: "execute",
				sql: renderedSql?.sql ?? String(query),
				params: renderedSql?.params ?? [],
				withinTransaction,
			} satisfies Statement);
			return state.rows;
		},
	};
}

vi.mock("@/db", () => ({
	db: {
		...repository(false),
		transaction: async (
			work: (tx: ReturnType<typeof repository>) => Promise<unknown>,
		) => {
			state.inTransaction = true;
			try {
				return await work(repository(true));
			} finally {
				state.inTransaction = false;
			}
		},
	},
}));

import "@/routes/api/settings/api-keys/index";
import "@/routes/api/settings/api-keys/auto";
import "@/routes/api/settings/api-keys/cleanup";
import "@/routes/api/settings/api-keys/$id";
import "@/routes/api/feedback";

function call(path: string, method: string, body?: unknown) {
	const handler = state.handlers.get(path)?.[method];
	if (!handler) throw new Error(`Missing handler: ${method} ${path}`);
	return handler({
		request: new Request(`https://example.test${path}`, {
			method,
			...(body === undefined ? {} : { body: JSON.stringify(body) }),
		}),
		params: { id: "key-b" },
	});
}

beforeEach(() => {
	state.user = { id: "tenant-a" };
	state.rows = [{ id: "key-a" }];
	state.writes = [];
	state.filters = [];
	state.projections = [];
	state.statements = [];
});

describe("API-key management boundaries", () => {
	it("lists only non-secret columns for the authenticated owner", async () => {
		const res = await call("/api/settings/api-keys/", "GET");
		expect(res.status).toBe(200);
		expect(Object.keys(state.projections[0] ?? {})).toEqual([
			"id",
			"name",
			"keyPrefix",
			"scopes",
			"lastUsedAt",
			"createdAt",
			"expiresAt",
		]);
		const { SQL } = await import("drizzle-orm");
		const filter = state.filters[0];
		if (!(filter instanceof SQL))
			throw new Error("Missing SQL ownership filter");
		const query = new PgDialect().sqlToQuery(filter);
		expect(query.params).toEqual(["tenant-a"]);
		expect(query.sql).toContain('"api_keys"."user_id"');
	});

	it("returns the secret once while persisting only its hash and owner", async () => {
		const res = await call("/api/settings/api-keys/", "POST", {
			name: "Agent",
			scopes: ["read:project"],
		});
		const payload: unknown = await res.json();
		expect(payload).toEqual({ id: "key-a", rawKey: expect.any(String) });
		expect(res.headers.get("Cache-Control")).toBe("no-store");
		expect(res.headers.get("Pragma")).toBe("no-cache");
		expect(state.writes[0]?.table).toBe(apiKeys);
		expect(state.writes[0]?.values).toMatchObject({
			userId: "tenant-a",
			name: "Agent",
			scopes: ["read:project"],
			key: expect.stringMatching(/^[a-f0-9]{64}$/),
		});
		expect(state.writes[0]?.values).not.toHaveProperty("rawKey");
	});

	it.each([
		{ name: "", scopes: ["read:project"] },
		{ name: "Agent", scopes: [] },
		{ name: "Agent", scopes: ["admin"] },
		// The automatic namespace is server-owned; a hand-written name wearing it
		// would hide a manual credential from the lifecycle controls.
		{ name: "auto-cli-disguise", scopes: ["read:project"] },
	])("rejects invalid creation input without writing", async (body) => {
		expect((await call("/api/settings/api-keys/", "POST", body)).status).toBe(
			400,
		);
		expect(state.writes).toEqual([]);
	});

	it("keeps auto-key response and all three scopes for CLI prompt consumers", async () => {
		const res = await call("/api/settings/api-keys/auto", "POST");
		expect(await res.json()).toEqual({
			rawKey: expect.any(String),
			expiresAt: expect.any(String),
		});
		expect(res.headers.get("Cache-Control")).toBe("no-store");
		expect(state.writes[0]?.values).toMatchObject({
			userId: "tenant-a",
			name: expect.stringMatching(/^auto-cli-/),
			scopes: ["read:project", "write:task:status", "write:subtask:status"],
		});
		// Every handoff credential is bounded; a null deadline here would make a
		// lost prompt a permanent bearer token.
		expect(state.writes[0]?.values.expiresAt).toBeInstanceOf(Date);
		expect(String(state.writes[0]?.values.key)).toMatch(/^[a-f0-9]{64}$/);
		expect(state.writes[0]?.values).not.toHaveProperty("rawKey");
	});

	it("scopes revocation by both key id and owner and returns 404 when absent", async () => {
		state.rows = [];
		const res = await call("/api/settings/api-keys/$id", "DELETE");
		expect(res.status).toBe(404);
		const { SQL } = await import("drizzle-orm");
		const filter = state.filters[0];
		if (!(filter instanceof SQL))
			throw new Error("Missing SQL ownership filter");
		const query = new PgDialect().sqlToQuery(filter);
		expect(query.params).toEqual(["key-b", "tenant-a"]);
		expect(query.sql).toContain('"api_keys"."user_id"');
	});

	it("returns success for an owned key revocation", async () => {
		const res = await call("/api/settings/api-keys/$id", "DELETE");
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ success: true });
	});

	it.each([
		"/api/settings/api-keys/",
		"/api/settings/api-keys/auto",
	])("does not expose a secret when insertion returns no row at %s", async (path) => {
		state.rows = [];
		const res = await call(path, "POST", {
			name: "Agent",
			scopes: ["read:project"],
		});
		expect(res.status).toBe(500);
		expect(await res.json()).not.toHaveProperty("rawKey");
	});

	it.each([
		"/api/settings/api-keys/",
		"/api/settings/api-keys/auto",
		"/api/settings/api-keys/cleanup",
	])("rejects unauthenticated creation at %s before writing", async (path) => {
		state.user = null;
		await expect(call(path, "POST", {})).rejects.toThrow("Unauthorized");
		expect(state.writes).toEqual([]);
	});
});

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

function statements(op: Statement["op"]): Statement[] {
	return state.statements.filter((entry) => entry.op === op);
}

describe("automatic credential lifecycle", () => {
	// Every issuance must serialize behind the lock, otherwise parallel handoffs
	// each see an empty namespace and mint independent long-lived credentials.
	it("locks per user before writing, on every issuance", async () => {
		for (const _attempt of [0, 1]) {
			state.statements = [];
			const res = await call("/api/settings/api-keys/auto", "POST");
			expect(res.status).toBe(200);

			// The lock is the first statement of the transaction, ahead of any read
			// or write, so a parallel handoff cannot interleave with this one.
			expect(state.statements.map((entry) => entry.op)).toEqual([
				"execute",
				"delete",
				"insert",
			]);
			expect(state.statements.every((entry) => entry.withinTransaction)).toBe(
				true,
			);
			expect(statements("execute")[0]?.sql).toContain("pg_advisory_xact_lock");
			expect(statements("execute")[0]?.params).toEqual(["tenant-a"]);
		}
	});

	it("issues distinct bounded secrets across multiple handoff requests", async () => {
		const responses: Response[] = [];
		for (let attempt = 0; attempt < 8; attempt++) {
			responses.push(await call("/api/settings/api-keys/auto", "POST"));
		}
		const payloads = await Promise.all(
			responses.map((response) => response.json()),
		);
		expect(responses.every((response) => response.status === 200)).toBe(true);
		expect(new Set(payloads.map((payload) => payload.rawKey)).size).toBe(8);
		expect(statements("execute")).toHaveLength(8);
		expect(statements("update")).toEqual([]);
		for (const write of state.writes) {
			expect(write.values.expiresAt).toBeInstanceOf(Date);
			expect(
				payloads.some((payload) => payload.rawKey === write.values.key),
			).toBe(false);
		}
	});

	it("preserves existing deadlines across repeated handoffs", async () => {
		await call("/api/settings/api-keys/auto", "POST");
		await call("/api/settings/api-keys/auto", "POST");
		expect(statements("update")).toEqual([]);
		expect(statements("insert")).toHaveLength(2);
	});

	it("expires expired rows and gives the new key the full TTL", async () => {
		const before = Date.now();
		const res = await call("/api/settings/api-keys/auto", "POST");

		const reap = statements("delete")[0];
		expect(reap?.sql).toContain('"api_keys"."expires_at" is not null');
		expect(reap?.sql).toContain('"api_keys"."expires_at" <');
		expect(reap?.params).toContain("auto-cli-%");

		const expiresAt = new Date(
			((await res.json()) as { expiresAt: string }).expiresAt,
		).getTime();
		const ttl = expiresAt - before;
		expect(ttl).toBeGreaterThan(72 * HOUR_MS);
		expect(ttl).toBeGreaterThan(29 * DAY_MS);
		expect(ttl).toBeLessThanOrEqual(30 * DAY_MS + 1000);
	});

	// Cleanup bounds a legacy key that predates the expiry policy instead of
	// deleting it: one may belong to an agent running right now.
	it("bounds unbounded handoff keys and drops only expired ones", async () => {
		const res = await call("/api/settings/api-keys/cleanup", "POST");

		expect(await res.json()).toEqual({
			revoked: 1,
			deleted: 1,
			expiresAt: expect.any(String),
		});
		const boundLegacy = statements("update")[0];
		expect(boundLegacy?.sql).toContain("like");
		expect(boundLegacy?.sql).toContain('"api_keys"."expires_at" is null');
		expect(boundLegacy?.params).toContain("auto-cli-%");
		expect(boundLegacy?.params).toContain("tenant-a");

		const dropExpired = statements("delete")[0];
		expect(dropExpired?.sql).toContain('"api_keys"."expires_at" is not null');
		expect(dropExpired?.sql).toContain('"api_keys"."expires_at" <');
		expect(dropExpired?.params).toContain("tenant-a");
		// A manual key without a deadline is never matched: only its owner decides
		// when it is obsolete.
		expect(dropExpired?.sql).not.toContain("like");
	});
});

describe("feedback boundary", () => {
	it.each([
		null,
		{ id: "tenant-a" },
	])("preserves nullable ownership: %j", async (user) => {
		state.user = user;
		const res = await call("/api/feedback", "POST", {
			message: "<sample feedback>",
		});
		expect(res.status).toBe(200);
		expect(state.writes[0]?.table).toBe(feedback);
		expect(state.writes[0]?.values).toMatchObject({
			userId: user?.id ?? null,
			message: "<sample feedback>",
			type: "general",
		});
	});

	it("rejects invalid feedback without writing", async () => {
		expect((await call("/api/feedback", "POST", { message: " " })).status).toBe(
			400,
		);
		expect(state.writes).toEqual([]);
	});
});
