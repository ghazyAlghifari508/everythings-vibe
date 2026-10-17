import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiKeys, feedback } from "@/db/schema";

type Handler = (args: {
	request: Request;
	params: { id: string };
}) => Promise<Response>;

const state = vi.hoisted(() => ({
	handlers: new Map<string, Record<string, Handler>>(),
	user: { id: "tenant-a" } as { id: string } | null,
	rows: [] as Record<string, unknown>[],
	writes: [] as { table: unknown; values: Record<string, unknown> }[],
	filters: [] as unknown[],
	projections: [] as unknown[],
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
vi.mock("@/db", () => ({
	db: {
		select: (projection: unknown) => {
			state.projections.push(projection);
			return {
				from: () => ({
					where: (filter: unknown) => {
						state.filters.push(filter);
						return { orderBy: async () => state.rows };
					},
				}),
			};
		},
		insert: (table: unknown) => ({
			values: (values: Record<string, unknown>) => {
				state.writes.push({ table, values });
				return { returning: async () => state.rows };
			},
		}),
		delete: () => ({
			where: (filter: unknown) => {
				state.filters.push(filter);
				return { returning: async () => state.rows };
			},
		}),
	},
}));

import "@/routes/api/settings/api-keys/index";
import "@/routes/api/settings/api-keys/auto";
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
	])("rejects invalid creation input without writing", async (body) => {
		expect((await call("/api/settings/api-keys/", "POST", body)).status).toBe(
			400,
		);
		expect(state.writes).toEqual([]);
	});

	it("keeps auto-key response and all three scopes for CLI prompt consumers", async () => {
		const res = await call("/api/settings/api-keys/auto", "POST");
		expect(await res.json()).toEqual({ rawKey: expect.any(String) });
		expect(state.writes[0]?.values).toMatchObject({
			userId: "tenant-a",
			scopes: ["read:project", "write:task:status", "write:subtask:status"],
		});
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
	])("rejects unauthenticated creation at %s before writing", async (path) => {
		state.user = null;
		await expect(call(path, "POST", {})).rejects.toThrow("Unauthorized");
		expect(state.writes).toEqual([]);
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
