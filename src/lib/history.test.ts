import { beforeEach, describe, expect, it, vi } from "vitest";

// The handler builds its WHERE clause from drizzle-orm operators, so the
// operators are recorded (not executed) and the query returns fixed rows.
// This keeps the assertion on the ownership + workspace contract without
// needing a live database.
const recorder = vi.hoisted(() => {
	const ops: Array<{ op: string; col: unknown; value?: unknown }> = [];
	const rows = [
		{
			id: "project-greenfield",
			name: "<sample greenfield>",
			step: "prd",
			lastUrl: null,
			updatedAt: new Date("2026-09-01T00:00:00.000Z"),
			acStatus: null,
			taskStatus: null,
			description: "Ringkasan greenfield",
		},
		{
			id: "project-codebase",
			name: "<sample codebase>",
			step: "task",
			lastUrl: "/kanban/project-codebase",
			updatedAt: new Date("2026-08-01T00:00:00.000Z"),
			acStatus: "completed",
			taskStatus: "pending",
			description: null,
		},
	];
	return { ops, rows, where: null as unknown };
});

vi.mock("drizzle-orm", () => ({
	and: (...args: unknown[]) => ({ op: "and", args }),
	desc: (col: unknown) => ({ op: "desc", col }),
	eq: (col: unknown, value: unknown) => {
		recorder.ops.push({ op: "eq", col, value });
		return { op: "eq", col, value };
	},
	isNull: (col: unknown) => {
		recorder.ops.push({ op: "isNull", col });
		return { op: "isNull", col };
	},
}));

vi.mock("@tanstack/react-start", () => ({
	createServerFn: () => ({
		validator: (_fn: unknown) => ({ handler: (h: unknown) => h }),
		handler: (fn: unknown) => fn,
	}),
	createServerOnlyFn: (fn: unknown) => fn,
}));

vi.mock("@/lib/session", () => ({
	requireUserServer: vi.fn(async () => ({ id: "user-1" })),
}));

vi.mock("@/db", () => ({
	db: {
		select: () => ({
			from: () => ({
				where: (cond: unknown) => {
					recorder.where = cond;
					return { orderBy: () => Promise.resolve(recorder.rows) };
				},
			}),
		}),
	},
}));

vi.mock("@/db/schema", () => ({
	projects: {
		id: "projects.id",
		userId: "projects.user_id",
		projectMode: "projects.project_mode",
		deletedAt: "projects.deleted_at",
		updatedAt: "projects.updated_at",
	},
}));

import { historyFilterSchema, loadHistory } from "./history";

function hasEq(col: unknown, value: unknown): boolean {
	return recorder.ops.some(
		(o) => o.op === "eq" && o.col === col && o.value === value,
	);
}

describe("loadHistory workspace filter", () => {
	beforeEach(() => {
		recorder.ops.length = 0;
		recorder.where = null;
	});

	it("scopes the query to greenfield projects when workspace is greenfield", async () => {
		const res = await loadHistory({ data: { workspace: "greenfield" } });

		// projectMode = 'greenfield' is what excludes existing-codebase rows.
		expect(recorder.where).toEqual({
			op: "and",
			args: [
				{ op: "eq", col: "projects.user_id", value: "user-1" },
				{ op: "isNull", col: "projects.deleted_at" },
				{ op: "eq", col: "projects.project_mode", value: "greenfield" },
			],
		});
		expect(res.items).toEqual([
			{
				id: "project-greenfield",
				name: "<sample greenfield>",
				step: "prd",
				lastUrl: null,
				updatedAt: new Date("2026-09-01T00:00:00.000Z"),
				preview: "Ringkasan greenfield",
				acStatus: null,
				taskStatus: null,
			},
			{
				id: "project-codebase",
				name: "<sample codebase>",
				step: "task",
				lastUrl: "/kanban/project-codebase",
				updatedAt: new Date("2026-08-01T00:00:00.000Z"),
				preview: null,
				acStatus: "completed",
				taskStatus: "pending",
			},
		]);
	});

	it("leaves the query unscoped when workspace is omitted", async () => {
		// No data -> same shape the history drawer uses (global list).
		await loadHistory({});

		expect(
			recorder.ops.find((o) => o.col === "projects.project_mode"),
		).toBeUndefined();
		expect(recorder.where).toEqual({
			op: "and",
			args: [
				{ op: "eq", col: "projects.user_id", value: "user-1" },
				{ op: "isNull", col: "projects.deleted_at" },
			],
		});
	});

	it("keeps ownership and soft-delete filters in every scope", async () => {
		await loadHistory({ data: { workspace: "all" } });

		expect(hasEq("projects.user_id", "user-1")).toBe(true);
		expect(
			recorder.ops.some(
				(o) => o.op === "isNull" && o.col === "projects.deleted_at",
			),
		).toBe(true);
		expect(hasEq("projects.project_mode", "greenfield")).toBe(false);
	});
});

describe("historyFilterSchema", () => {
	it("accepts the greenfield workspace", () => {
		expect(historyFilterSchema.parse({ workspace: "greenfield" })).toEqual({
			workspace: "greenfield",
		});
	});

	it("accepts an empty search for the global history", () => {
		expect(historyFilterSchema.parse({})).toEqual({});
	});

	it("rejects an unknown workspace instead of silently listing everything", () => {
		expect(() => historyFilterSchema.parse({ workspace: "bogus" })).toThrow();
	});
});
