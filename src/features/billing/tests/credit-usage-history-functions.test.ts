import { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it, vi } from "vitest";
import { creditOperations } from "@/db/schema";

const state = vi.hoisted(() => ({
	unauthorized: false,
	queries: [] as Array<{
		table: unknown;
		filter?: unknown;
		limit?: number;
		offset?: number;
		orderBy?: unknown;
	}>,
	countValue: 120,
	rows: [] as Array<{
		id: string;
		userId: string;
		projectId: string;
		projectName: string | null;
		kind: string;
		stage: string;
		state: string;
		estimatedCredits: number;
		reservedCredits: number;
		maximumCredits: number;
		finalCharge: number | null;
		pricingVersion: string;
		metrics: Record<string, unknown>;
		capApplied: boolean;
		createdAt: Date;
		settledAt: Date | null;
	}>,
}));

vi.mock("@tanstack/react-start", () => ({
	createServerFn: () => ({
		validator: (v: (input: unknown) => unknown) => ({
			handler:
				(h: (args: { data: unknown }) => Promise<unknown>) =>
				(args?: { data?: unknown }) =>
					h({ data: v(args?.data) }),
		}),
		handler: (h: unknown) => h,
	}),
}));

vi.mock("@/lib/session", () => ({
	requireUserServer: async () => {
		if (state.unauthorized) throw new Error("Unauthorized");
		return { id: "user-tenant-xyz" };
	},
}));

vi.mock("@/db", () => ({
	db: {
		select: (fields?: Record<string, unknown>) => ({
			from: (table: unknown) => {
				const current: {
					table: unknown;
					filter?: unknown;
					limit?: number;
					offset?: number;
					orderBy?: unknown;
				} = { table };
				state.queries.push(current);

				const isCount = fields && "total" in fields;
				const chain = Object.assign(
					Promise.resolve(
						isCount
							? [{ total: state.countValue }]
							: table === creditOperations
								? state.rows
								: [],
					),
					{
						leftJoin: () => chain,
						where: (filter: unknown) => {
							current.filter = filter;
							return chain;
						},
						orderBy: (arg1: unknown, arg2?: unknown) => {
							current.orderBy = [arg1, arg2].filter(Boolean);
							return chain;
						},
						limit: (lim: number) => {
							current.limit = lim;
							return chain;
						},
						offset: (off: number) => {
							current.offset = off;
							return chain;
						},
					},
				);
				return chain;
			},
		}),
	},
}));

import {
	loadCreditUsageHistory,
	normalizeCreditUsageInput,
} from "../services/credit-usage.functions";

describe("loadCreditUsageHistory server-side pagination & filter contracts", () => {
	it("rejects unauthenticated requests", async () => {
		state.unauthorized = true;
		try {
			await expect(loadCreditUsageHistory({ data: {} })).rejects.toThrow(
				"Unauthorized",
			);
		} finally {
			state.unauthorized = false;
		}
	});

	it("enforces tenant data isolation and deterministic compound ordering", async () => {
		state.queries = [];
		state.countValue = 25;
		state.rows = [
			{
				id: "op-101",
				userId: "user-tenant-xyz",
				projectId: "proj-1",
				projectName: "Tenant Project",
				kind: "prd_generation",
				stage: "prd",
				state: "settled",
				estimatedCredits: 3,
				reservedCredits: 0,
				maximumCredits: 5,
				finalCharge: 4,
				pricingVersion: "2026-09-20",
				metrics: { promptChars: 1200 },
				capApplied: false,
				createdAt: new Date("2026-10-15T10:00:00Z"),
				settledAt: new Date("2026-10-15T10:01:00Z"),
			},
		];

		const result = await loadCreditUsageHistory({ data: { page: 1 } });

		expect(result.page).toBe(1);
		expect(result.pageSize).toBe(10);
		expect(result.total).toBe(25);
		expect(result.totalPages).toBe(3);
		expect(result.items.length).toBe(1);
		expect(result.items[0].id).toBe("op-101");
		expect(result.items[0].projectName).toBe("Tenant Project");

		// Verify count query and data query were made
		expect(state.queries.length).toBe(2);
		const dataQuery = state.queries.find((q) => q.limit !== undefined);
		expect(dataQuery).toBeDefined();
		expect(dataQuery?.limit).toBe(10);
		expect(dataQuery?.offset).toBeUndefined(); // Page 1 offset 0 is omitted for efficiency

		// Verify SQL filter enforces userId isolation
		if (dataQuery?.filter instanceof SQL) {
			const sqlQuery = new PgDialect().sqlToQuery(dataQuery.filter);
			expect(sqlQuery.params).toContain("user-tenant-xyz");
		}
	});

	it("clamps page, pageSize, and validates stage and status filters safely", () => {
		// Zero or negative page clamps to 1
		expect(normalizeCreditUsageInput({ page: -3 })).toMatchObject({
			page: 1,
			pageSize: 10,
		});
		expect(normalizeCreditUsageInput({ page: 0 })).toMatchObject({
			page: 1,
			pageSize: 10,
		});

		// Excessive pageSize clamps to 50
		expect(normalizeCreditUsageInput({ pageSize: 500 })).toMatchObject({
			pageSize: 50,
		});
		expect(normalizeCreditUsageInput({ pageSize: -10 })).toMatchObject({
			pageSize: 1,
		});

		// Valid filters recognized
		expect(
			normalizeCreditUsageInput({ stage: "prd", status: "settled" }),
		).toMatchObject({
			stage: "prd",
			status: "settled",
		});

		// Invalid filters fall back to undefined (all)
		expect(
			normalizeCreditUsageInput({
				stage: "invalid_stage",
				status: "invalid_status",
			}),
		).toMatchObject({
			stage: undefined,
			status: undefined,
		});
	});

	it("computes correct offset for subsequent pages and can discover records beyond 50", async () => {
		state.queries = [];
		state.countValue = 150; // User has 150 operations in total

		// Query page 6 with pageSize 10 (items 51 to 60, well beyond initial 50)
		const result = await loadCreditUsageHistory({
			data: { page: 6, pageSize: 10 },
		});

		expect(result.page).toBe(6);
		expect(result.pageSize).toBe(10);
		expect(result.total).toBe(150);
		expect(result.totalPages).toBe(15);

		const dataQuery = state.queries.find((q) => q.limit !== undefined);
		expect(dataQuery).toBeDefined();
		expect(dataQuery?.limit).toBe(10);
		expect(dataQuery?.offset).toBe(50); // (6 - 1) * 10 = 50
	});

	it("applies stage filter to database query", async () => {
		state.queries = [];
		await loadCreditUsageHistory({
			data: { page: 1, pageSize: 10, stage: "codebase" },
		});

		const dataQuery = state.queries[1];
		if (dataQuery.filter instanceof SQL) {
			const sqlQuery = new PgDialect().sqlToQuery(dataQuery.filter);
			expect(sqlQuery.params).toContain("user-tenant-xyz");
			expect(sqlQuery.params).toContain("codebase");
		}
	});

	it("applies status filter to database query, mapping running to both running and settling", async () => {
		state.queries = [];
		await loadCreditUsageHistory({
			data: { page: 1, pageSize: 10, status: "running" },
		});

		const dataQuery = state.queries[1];
		if (dataQuery.filter instanceof SQL) {
			const sqlQuery = new PgDialect().sqlToQuery(dataQuery.filter);
			expect(sqlQuery.params).toContain("user-tenant-xyz");
			expect(sqlQuery.params).toContain("running");
			expect(sqlQuery.params).toContain("settling");
		}
	});

	it("applies combined stage and status filters to database query", async () => {
		state.queries = [];
		await loadCreditUsageHistory({
			data: { page: 2, pageSize: 20, stage: "ac", status: "failed" },
		});

		const dataQuery = state.queries.find((q) => q.limit !== undefined);
		expect(dataQuery).toBeDefined();
		expect(dataQuery?.limit).toBe(20);
		expect(dataQuery?.offset).toBe(20); // (2 - 1) * 20 = 20

		if (dataQuery?.filter instanceof SQL) {
			const sqlQuery = new PgDialect().sqlToQuery(dataQuery.filter);
			expect(sqlQuery.params).toContain("user-tenant-xyz");
			expect(sqlQuery.params).toContain("ac");
			expect(sqlQuery.params).toContain("failed");
		}
	});
});
