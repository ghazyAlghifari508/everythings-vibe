import { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { expect, it, vi } from "vitest";
import {
	creditOperations,
	payments,
	productTrials,
	subscriptions,
} from "@/db/schema";

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
	subRows: [] as Array<{
		id: string;
		userId: string;
		plan: string;
		status: string;
		midtransOrderId: string | null;
		currentPeriodStart: Date | null;
		currentPeriodEnd: Date | null;
		cancelledAt: Date | null;
		reminderCount: number;
		credits: number;
		creditsUsed: number;
		creditsReserved: number;
		createdAt: Date;
		updatedAt: Date;
	}>,
	trialRows: [] as Array<{ product: string; state: string }>,
	productUsageRows: [] as Array<{
		product: string | null;
		credits: number | string;
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
		select: (fields?: Record<string, unknown>) => ({
			from: (table: unknown) => {
				const resolvedRows =
					fields && "credits" in fields
						? state.productUsageRows
						: fields && "state" in fields && "product" in fields
							? state.trialRows
							: table === payments
								? state.rows
								: [];
				const chain = Object.assign(Promise.resolve(resolvedRows), {
					where: (filter: unknown) => {
						state.filters.push({ table, filter });
						return chain;
					},
					leftJoin: () => chain,
					orderBy: () => chain,
					groupBy: () => chain,
					limit: async (limit: number) => {
						state.limits.push({ table, limit });
						return table === subscriptions ? state.subRows.slice(0, limit) : [];
					},
				});
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
it("derives available capacity from the canonical subscription state", async () => {
	state.subRows = [
		{
			id: "sub-1",
			userId: "tenant-a",
			plan: "pro",
			status: "active",
			midtransOrderId: null,
			currentPeriodStart: new Date("2019-12-01T00:00:00Z"),
			currentPeriodEnd: new Date("2020-01-01T00:00:00Z"),
			cancelledAt: null,
			reminderCount: 0,
			credits: 105,
			creditsUsed: 80,
			creditsReserved: 20,
			createdAt: new Date("2019-12-01T00:00:00Z"),
			updatedAt: new Date("2019-12-01T00:00:00Z"),
		},
	];
	try {
		const result = await loadBilling();
		expect(result.creditUsage.availableCredits).toBe(0);
	} finally {
		state.subRows = [];
	}
});

it("scopes trial and settled paid product usage to the authenticated tenant", async () => {
	state.rows = [];
	state.subRows = [];
	state.filters.length = 0;
	try {
		const result = await loadBilling();
		expect(result.trials).toEqual({ studio: "available", scrape: "available" });
		expect(result.creditUsage.productBreakdown).toEqual([]);

		const trialFilter = state.filters.find(
			(entry) => entry.table === productTrials,
		)?.filter;
		if (!(trialFilter instanceof SQL))
			throw new Error("Missing trial ownership filter");
		expect(new PgDialect().sqlToQuery(trialFilter).params).toEqual([
			"tenant-a",
			"studio",
			"scrape",
		]);

		const usageFilters = state.filters.flatMap((entry) =>
			entry.table === creditOperations && entry.filter instanceof SQL
				? [new PgDialect().sqlToQuery(entry.filter).params]
				: [],
		);
		expect(
			usageFilters.some(
				(params) =>
					params.includes("tenant-a") &&
					params.includes("settled") &&
					params.includes("subscription_balance") &&
					params.includes(0),
			),
		).toBe(true);
	} finally {
		state.filters.length = 0;
	}
});

it("maps trial states and counts only settled paid product charges", async () => {
	state.rows = [];
	state.subRows = [];
	state.trialRows = [
		{ product: "studio", state: "consumed" },
		{ product: "scrape", state: "released" },
	];
	state.productUsageRows = [
		{ product: "vibeplan_greenfield", credits: "16" },
		{ product: "studio", credits: 18 },
		{ product: null, credits: 4 },
	];
	try {
		const result = await loadBilling();
		expect(result.trials).toEqual({
			studio: "consumed",
			scrape: "available",
		});
		expect(result.creditUsage.productBreakdown).toEqual([
			{ product: "vibeplan_greenfield", credits: 16 },
			{ product: "studio", credits: 18 },
			{ product: "legacy_unknown", credits: 4 },
		]);
	} finally {
		state.trialRows = [];
		state.productUsageRows = [];
	}
});
