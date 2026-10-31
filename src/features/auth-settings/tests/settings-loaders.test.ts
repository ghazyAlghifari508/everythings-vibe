import { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
	filters: [] as unknown[],
	projection: undefined as unknown,
	rows: [] as Record<string, unknown>[],
	unauthorized: false,
}));

vi.mock("@tanstack/react-start", () => ({
	createServerFn: () => ({
		handler: <T>(handler: () => Promise<T>) => handler,
	}),
}));
vi.mock("@/lib/session", () => ({
	requireUserServer: async () => {
		if (state.unauthorized) throw new Error("Unauthorized");
		return { id: "tenant-a", email: "sample@example.test" };
	},
}));
vi.mock("@/db", () => ({
	db: {
		select: (projection: unknown) => {
			state.projection = projection;
			return {
				from: () => ({
					where: (filter: unknown) => {
						state.filters.push(filter);
						return {
							limit: async () => state.rows,
							orderBy: async () => state.rows,
						};
					},
				}),
			};
		},
	},
}));

import {
	loadApiKeys,
	loadNotifications,
	loadProfile,
	loadSettings,
} from "../services/settings-loaders.functions";

beforeEach(() => {
	state.filters = [];
	state.projection = undefined;
	state.rows = [];
	state.unauthorized = false;
});

describe("settings loaders", () => {
	it.each([
		loadSettings,
		loadProfile,
		loadNotifications,
		loadApiKeys,
	])("restricts each query to the authenticated tenant", async (load) => {
		await load();
		const filter = state.filters[0];
		if (!(filter instanceof SQL)) throw new Error("Missing ownership filter");
		expect(new PgDialect().sqlToQuery(filter).params).toEqual(["tenant-a"]);
	});

	it.each([
		loadSettings,
		loadProfile,
		loadNotifications,
		loadApiKeys,
	])("rejects an unauthenticated load before selecting rows", async (load) => {
		state.unauthorized = true;
		await expect(load()).rejects.toThrow("Unauthorized");
		expect(state.filters).toEqual([]);
	});

	it("preserves null notification defaults and missing profile shapes", async () => {
		expect(await loadNotifications()).toEqual({ preferences: null });
		expect(await loadProfile()).toEqual({
			profile: undefined,
			email: "sample@example.test",
		});
		expect(await loadSettings()).toEqual({ profile: undefined });
	});

	it("serializes only display fields, dates and existing nullable defaults for API keys", async () => {
		state.rows = [
			{
				id: "key-a",
				name: "Agent",
				keyPrefix: null,
				scopes: null,
				lastUsedAt: new Date("2026-01-01T00:00:00.000Z"),
				createdAt: new Date("2026-01-02T00:00:00.000Z"),
				expiresAt: null,
			},
		];
		expect(await loadApiKeys()).toEqual({
			keys: [
				{
					id: "key-a",
					name: "Agent",
					key_prefix: "",
					scopes: [],
					last_used_at: "2026-01-01T00:00:00.000Z",
					created_at: "2026-01-02T00:00:00.000Z",
					expires_at: null,
					source: "manual",
					state: "no-expiry",
				},
			],
		});
		expect(Object.keys(state.projection ?? {})).toEqual([
			"id",
			"name",
			"keyPrefix",
			"scopes",
			"lastUsedAt",
			"createdAt",
			"expiresAt",
		]);
	});

	// The expiry label must be decided by the server clock that also gates
	// bearer authentication, and it must separate an automatic handoff key from
	// a hand-written one so cleanup can never claim a manual credential.
	it("labels source and expiry state per credential from the server clock", async () => {
		state.rows = [
			{
				id: "key-live",
				name: "auto-cli-1",
				keyPrefix: "vibe_live",
				scopes: ["read:project"],
				lastUsedAt: null,
				createdAt: new Date("2020-01-01T00:00:00.000Z"),
				expiresAt: new Date("2999-01-01T00:00:00.000Z"),
			},
			{
				id: "key-dead",
				name: "auto-cli-2",
				keyPrefix: "vibe_dead",
				scopes: ["read:project"],
				lastUsedAt: null,
				createdAt: new Date("2020-01-01T00:00:00.000Z"),
				expiresAt: new Date("2000-01-01T00:00:00.000Z"),
			},
		];
		const { keys } = await loadApiKeys();

		expect(
			keys.map((key) => [key.id, key.source, key.state, key.expires_at]),
		).toEqual([
			["key-live", "automatic", "active", "2999-01-01T00:00:00.000Z"],
			["key-dead", "automatic", "expired", "2000-01-01T00:00:00.000Z"],
		]);
	});
});
