import { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it, vi } from "vitest";
import { payments } from "@/db/schema";

const state = vi.hoisted(() => ({
	unauthorized: false,
	queries: [] as Array<{
		table: unknown;
		filter?: unknown;
		limit?: number;
		offset?: number;
		orderBy?: unknown;
	}>,
	countValue: 25,
	rows: [] as Array<{
		id: string;
		userId: string;
		amount: number;
		status: string;
		plan: string;
		midtransResponse: unknown;
		createdAt: Date;
		updatedAt: Date;
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
		return { id: "user-123" };
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
							: table === payments
								? state.rows
								: [],
					),
					{
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

import { loadPaymentHistory } from "../services/payment-history.functions";

describe("loadPaymentHistory server pagination", () => {
	it("rejects unauthenticated requests", async () => {
		state.unauthorized = true;
		try {
			await expect(loadPaymentHistory({ data: {} })).rejects.toThrow(
				"Unauthorized",
			);
		} finally {
			state.unauthorized = false;
		}
	});

	it("enforces tenant ownership and deterministic ordering with default bounds", async () => {
		state.queries = [];
		state.countValue = 15;
		state.rows = [
			{
				id: "pay-1",
				userId: "user-123",
				amount: 149000,
				status: "success",
				plan: "pro",
				midtransResponse: null,
				createdAt: new Date("2026-10-01T12:00:00Z"),
				updatedAt: new Date("2026-10-01T12:00:00Z"),
			},
		];

		const result = await loadPaymentHistory({ data: { page: 1 } });

		expect(result.page).toBe(1);
		expect(result.pageSize).toBe(10);
		expect(result.total).toBe(15);
		expect(result.totalPages).toBe(2);
		expect(result.items.length).toBe(1);
		expect(result.items[0].id).toBe("pay-1");
		expect(result.items[0].amount).toBe(149000);

		// Verify queries made
		expect(state.queries.length).toBe(2); // count query and data query
		const dataQuery = state.queries[1];
		expect(dataQuery.limit).toBe(10);
		expect(dataQuery.offset).toBe(0);

		// Check SQL filter contains user id
		if (dataQuery.filter instanceof SQL) {
			const sqlQuery = new PgDialect().sqlToQuery(dataQuery.filter);
			expect(sqlQuery.params).toContain("user-123");
			expect(sqlQuery.params).toContain("pending"); // excluded by default
		}
	});

	it("clamps and bounds page and pageSize according to bounds contract", async () => {
		state.queries = [];
		state.countValue = 50;

		// negative/zero page and excessive pageSize (> 20)
		const result = await loadPaymentHistory({
			data: { page: -5, pageSize: 999 },
		});

		expect(result.page).toBe(1);
		expect(result.pageSize).toBe(20); // bounded to max 20 per spec §4
		expect(result.totalPages).toBe(3); // 50 / 20 = 2.5 -> 3

		const dataQuery = state.queries[1];
		expect(dataQuery.limit).toBe(20);
		expect(dataQuery.offset).toBe(0);
	});

	it("computes correct offset for subsequent pages", async () => {
		state.queries = [];
		state.countValue = 35;

		const result = await loadPaymentHistory({
			data: { page: 3, pageSize: 10 },
		});

		expect(result.page).toBe(3);
		expect(result.pageSize).toBe(10);
		expect(result.totalPages).toBe(4);

		const dataQuery = state.queries[1];
		expect(dataQuery.limit).toBe(10);
		expect(dataQuery.offset).toBe(20); // (3 - 1) * 10
	});

	it("applies status filter when requested", async () => {
		state.queries = [];
		await loadPaymentHistory({
			data: { page: 1, pageSize: 10, status: "failed" },
		});

		const dataQuery = state.queries[1];
		if (dataQuery.filter instanceof SQL) {
			const sqlQuery = new PgDialect().sqlToQuery(dataQuery.filter);
			expect(sqlQuery.params).toContain("user-123");
			expect(sqlQuery.params).toContain("failed");
		}
	});
});
