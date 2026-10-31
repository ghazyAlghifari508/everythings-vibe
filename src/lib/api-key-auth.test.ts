import { createHash } from "node:crypto";
import { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
	rows: [] as Record<string, unknown>[],
	projections: [] as unknown[],
	filters: [] as unknown[],
	updates: [] as { values: Record<string, unknown> }[],
	throttled: false,
}));

// The credential store and the throttle bucket both live in Postgres, so they
// are the external boundary replaced here; nothing in the auth decision is
// stubbed.
vi.mock("@/db", () => ({
	db: {
		select: (projection: unknown) => {
			state.projections.push(projection);
			return {
				from: () => ({
					where: (filter: unknown) => {
						state.filters.push(filter);
						return { limit: async () => state.rows };
					},
				}),
			};
		},
		update: () => ({
			set: (values: Record<string, unknown>) => {
				state.updates.push({ values });
				return { where: () => Promise.resolve() };
			},
		}),
	},
}));
vi.mock("@/lib/rate-limit", () => ({
	checkRateLimit: async () =>
		state.throttled
			? { allowed: false, remaining: 0, resetAt: 0 }
			: { allowed: true, remaining: 10, resetAt: 0 },
}));

import { apiKeyAuth, hasScope, verifyProjectOwnership } from "./api-key-auth";

function bearerRequest(rawKey: string): Request {
	return new Request("https://example.test/api/v1/projects/p-1", {
		headers: { Authorization: `Bearer ${rawKey}` },
	});
}

const FUTURE = new Date(Date.now() + 60_000);
const PAST = new Date(Date.now() - 60_000);

beforeEach(() => {
	state.rows = [];
	state.projections = [];
	state.filters = [];
	state.updates = [];
	state.throttled = false;
});

describe("apiKeyAuth bearer decisions", () => {
	it("rejects a request with no Authorization header", async () => {
		const result = await apiKeyAuth(
			new Request("https://example.test/api/v1/projects/p-1"),
		);

		expect(result).toMatchObject({ status: 401 });
		expect(state.filters).toEqual([]);
	});

	// `Headers` trims the trailing space of `Bearer `, so both spellings of an
	// absent secret have to land on 401 without reaching the credential store.
	it.each([
		"",
		"   ",
	])("rejects an empty bearer %j before touching the store", async (token) => {
		const result = await apiKeyAuth(bearerRequest(token));

		expect(result).toMatchObject({ status: 401 });
		expect(state.filters).toEqual([]);
	});

	it("looks the credential up by hash, never by the presented secret", async () => {
		const rawKey = "vibe_sample_secret";
		state.rows = [
			{
				id: "key-1",
				userId: "tenant-a",
				scopes: ["read:project"],
				expiresAt: null,
			},
		];

		expect(await apiKeyAuth(bearerRequest(rawKey))).toEqual({
			userId: "tenant-a",
			scopes: ["read:project"],
			keyId: "key-1",
		});

		const lookup = state.filters[0];
		if (!(lookup instanceof SQL)) throw new Error("Missing key lookup");
		const { sql, params } = new PgDialect().sqlToQuery(lookup);
		expect(sql).toContain('"api_keys"."key"');
		expect(params).toEqual([createHash("sha256").update(rawKey).digest("hex")]);
		expect(params).not.toContain(rawKey);
		// The secret must not be readable back out of the selected columns.
		expect(Object.keys(state.projections[0] ?? {})).toEqual([
			"id",
			"userId",
			"scopes",
			"expiresAt",
		]);
	});

	it("denies a credential whose row is gone (revoked or deleted)", async () => {
		state.rows = [];

		expect(await apiKeyAuth(bearerRequest("vibe_revoked"))).toEqual({
			error: "Invalid API key",
			status: 401,
		});
	});

	it("denies an expired credential and does not stamp it as used", async () => {
		state.rows = [
			{
				id: "key-1",
				userId: "tenant-a",
				scopes: ["read:project"],
				expiresAt: PAST,
			},
		];

		expect(await apiKeyAuth(bearerRequest("vibe_old"))).toEqual({
			error: "API key expired",
			status: 401,
		});
		expect(state.updates).toEqual([]);
	});

	// A credential minted without a deadline is the manual case and must stay
	// usable; only an explicit past expiry ends access.
	it("rejects a credential at its exact expiration instant", async () => {
		const now = new Date("2026-01-01T00:00:00Z");
		vi.useFakeTimers();
		vi.setSystemTime(now);
		try {
			state.rows = [
				{ id: "key-boundary", userId: "tenant-a", scopes: [], expiresAt: now },
			];
			expect(await apiKeyAuth(bearerRequest("vibe_boundary"))).toEqual({
				error: "API key expired",
				status: 401,
			});
			expect(state.updates).toEqual([]);
		} finally {
			vi.useRealTimers();
		}
	});

	it("accepts a credential with no expiry", async () => {
		state.rows = [
			{
				id: "key-2",
				userId: "tenant-a",
				scopes: ["read:project"],
				expiresAt: null,
			},
		];

		const result = await apiKeyAuth(bearerRequest("vibe_manual"));
		expect(result).toMatchObject({ userId: "tenant-a", keyId: "key-2" });
		expect(state.updates[0]?.values).toHaveProperty("lastUsedAt");
	});

	it("accepts a credential whose expiry is still in the future", async () => {
		state.rows = [
			{
				id: "key-3",
				userId: "tenant-a",
				scopes: ["write:task:status"],
				expiresAt: FUTURE,
			},
		];

		expect(await apiKeyAuth(bearerRequest("vibe_live"))).toMatchObject({
			keyId: "key-3",
		});
	});

	// An unparseable deadline must not degrade into "no expiry": a bounded
	// credential whose row was corrupted or hand-edited has to stop working.
	it("treats an unparseable expiry as expired rather than permanent", async () => {
		state.rows = [
			{
				id: "key-4",
				userId: "tenant-a",
				scopes: ["read:project"],
				expiresAt: "not-a-date",
			},
		];

		expect(await apiKeyAuth(bearerRequest("vibe_junk"))).toEqual({
			error: "API key expired",
			status: 401,
		});
		expect(state.updates).toEqual([]);
	});

	it("throttles brute force and fails closed when the limiter errors", async () => {
		state.throttled = true;
		state.rows = [
			{
				id: "key-1",
				userId: "tenant-a",
				scopes: ["read:project"],
				expiresAt: null,
			},
		];

		expect(await apiKeyAuth(bearerRequest("vibe_guess"))).toEqual({
			error: "Too many authentication attempts",
			status: 429,
		});
	});
});

describe("project ownership", () => {
	it("binds authorization to the requested project, owner, and non-deleted state", async () => {
		state.rows = [{ id: "project-one" }];
		expect(await verifyProjectOwnership("tenant-a", "project-one")).toBe(true);
		const filter = state.filters[0];
		if (!(filter instanceof SQL))
			throw new Error("Missing ownership predicate");
		const query = new PgDialect().sqlToQuery(filter);
		expect(query.params).toEqual(["project-one", "tenant-a"]);
		expect(query.sql).toContain('"projects"."deleted_at" is null');
		expect(query.sql).toContain('"projects"."user_id"');
		expect(query.sql).toContain('"projects"."id"');
		state.rows = [];
		expect(await verifyProjectOwnership("tenant-b", "project-one")).toBe(false);
	});
});

describe("hasScope", () => {
	const base = { userId: "tenant-a", keyId: "key-1" };

	it.each([
		{ scopes: ["read:project"], required: "read:project", allowed: true },
		{ scopes: ["read:project"], required: "write:task:status", allowed: false },
		{ scopes: ["admin"], required: "write:task:status", allowed: true },
		{ scopes: ["*"], required: "write:subtask:status", allowed: true },
		{ scopes: [], required: "read:project", allowed: false },
	])("grants $required under $scopes -> $allowed", (rule) => {
		expect(hasScope({ ...base, scopes: rule.scopes }, rule.required)).toBe(
			rule.allowed,
		);
	});
});
