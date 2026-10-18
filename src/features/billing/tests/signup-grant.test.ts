import { PgDialect } from "drizzle-orm/pg-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { creditLedgerEntries, subscriptions } from "@/db/schema";
import {
	ADAPTIVE_CREDIT_PRICING,
	BILLING_PERIOD_DAYS,
} from "@/features/billing/types/billing-constants";
import { PLAN_CREDITS } from "@/types/database";

const state = vi.hoisted(() => {
	const value: {
		existing: boolean;
		filter: unknown;
		writes: { table: unknown; values: unknown }[];
		ledgerError: Error | null;
		transaction: ReturnType<typeof vi.fn>;
	} = {
		existing: false,
		filter: undefined,
		writes: [],
		ledgerError: null,
		transaction: vi.fn(),
	};
	return value;
});

vi.mock("@/db", () => ({
	db: {
		transaction: state.transaction,
	},
}));

import { grantSignupSubscription } from "../services/signup-grant";

beforeEach(() => {
	vi.useFakeTimers();
	vi.setSystemTime(new Date("2026-10-17T12:00:00Z"));
	state.existing = false;
	state.filter = undefined;
	state.writes = [];
	state.ledgerError = null;
	state.transaction.mockReset();
	const transaction = {
		select: () => ({
			from: () => ({
				where: (filter: unknown) => {
					state.filter = filter;
					return {
						limit: async () => (state.existing ? [{ id: "existing" }] : []),
					};
				},
			}),
		}),
		insert: (table: unknown) => ({
			values: async (values: unknown) => {
				state.writes.push({ table, values });
				if (table === creditLedgerEntries && state.ledgerError)
					throw state.ledgerError;
			},
		}),
	};
	state.transaction.mockImplementation(
		async (run: (tx: typeof transaction) => Promise<void>) => run(transaction),
	);
});

afterEach(() => vi.useRealTimers());

describe("signup subscription grant", () => {
	it("creates the initial subscription and ledger grant in one owner-scoped transaction", async () => {
		await grantSignupSubscription("owner-a");
		expect(state.transaction).toHaveBeenCalledTimes(1);
		const { SQL } = await import("drizzle-orm");
		if (!(state.filter instanceof SQL))
			throw new Error("Missing ownership predicate");
		const filter = new PgDialect().sqlToQuery(state.filter);
		expect(filter.sql).toContain('"subscriptions"."user_id"');
		expect(filter.params).toEqual(["owner-a"]);
		const now = new Date();
		expect(state.writes).toEqual([
			{
				table: subscriptions,
				values: {
					id: expect.any(String),
					userId: "owner-a",
					plan: "free",
					status: "active",
					credits: PLAN_CREDITS.free,
					creditsUsed: 0,
					creditsReserved: 0,
					currentPeriodStart: now,
					currentPeriodEnd: new Date(
						now.getTime() + BILLING_PERIOD_DAYS * 86_400_000,
					),
					reminderCount: 0,
				},
			},
			{
				table: creditLedgerEntries,
				values: {
					id: expect.any(String),
					userId: "owner-a",
					operationId: null,
					amount: PLAN_CREDITS.free,
					entryType: "grant",
					sourceCategory: "system_grant",
					pricingVersion: ADAPTIVE_CREDIT_PRICING.version,
					metadata: { reason: "initial_signup_grant" },
				},
			},
		]);
	});

	it("does not mint another subscription or grant when one already exists", async () => {
		state.existing = true;
		await grantSignupSubscription("owner-a");
		expect(state.transaction).toHaveBeenCalledTimes(1);
		expect(state.writes).toEqual([]);
	});

	it("propagates a ledger failure out of the transaction", async () => {
		state.ledgerError = new Error("Ledger unavailable");
		await expect(grantSignupSubscription("owner-a")).rejects.toBe(
			state.ledgerError,
		);
		expect(state.transaction).toHaveBeenCalledTimes(1);
	});
});
