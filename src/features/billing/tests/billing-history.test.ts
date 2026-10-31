import { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { expect, it, vi } from "vitest";
import { payments } from "@/db/schema";

const state = vi.hoisted(() => ({
	filters: [] as { table: unknown; filter: unknown }[],
	limits: [] as { table: unknown; limit: number }[],
	unauthorized: false,
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
		validator: () => ({
			handler: (handler: () => Promise<unknown>) => handler,
		}),
		handler: (handler: () => Promise<unknown>) => handler,
	}),
}));
vi.mock("@/lib/session", () => ({
	requireUserServer: async () => {
		if (state.unauthorized) throw new Error("Unauthorized");
		return { id: "tenant-a" };
	},
}));
vi.mock("@/db", () => ({
	db: {
		select: () => ({
			from: (table: unknown) => {
				const chain = Object.assign(
					Promise.resolve(table === payments ? state.rows : []),
					{
						where: (filter: unknown) => {
							state.filters.push({ table, filter });
							return chain;
						},
						orderBy: () => chain,
						leftJoin: () => chain,
						limit: async (limit: number) => {
							state.limits.push({ table, limit });
							return [];
						},
					},
				);
				return chain;
			},
		}),
	},
}));

import { loadBilling } from "../services/billing-settings.functions";

it("loads all non-pending payment history for the authenticated tenant", async () => {
	state.rows = [
		{
			id: "failed",
			userId: "tenant-a",
			amount: 10,
			status: "failed",
			plan: "pro",
			midtransResponse: null,
			createdAt: new Date(),
			updatedAt: new Date(),
		},
		{
			id: "refunded",
			userId: "tenant-a",
			amount: 10,
			status: "success",
			plan: "pro",
			midtransResponse: { reversal: "refund" },
			createdAt: new Date(),
			updatedAt: new Date(),
		},
	];
	const result = await loadBilling();
	expect(result.payments.map((payment) => payment.status)).toEqual([
		"failed",
		"refund",
	]);
	const filter = state.filters.find(
		(entry) => entry.table === payments,
	)?.filter;
	if (!(filter instanceof SQL))
		throw new Error("Missing payment ownership filter");
	expect(new PgDialect().sqlToQuery(filter).params).toEqual([
		"tenant-a",
		"pending",
	]);
	expect(
		state.limits.find((entry) => entry.table === payments),
	).toBeUndefined();
});

it("rejects unauthenticated history requests", async () => {
	state.unauthorized = true;
	try {
		await expect(loadBilling()).rejects.toThrow("Unauthorized");
	} finally {
		state.unauthorized = false;
	}
});
