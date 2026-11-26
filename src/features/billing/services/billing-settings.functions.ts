import { createServerFn } from "@tanstack/react-start";
import { and, desc, eq, gt, gte, inArray, lte, ne, sql } from "drizzle-orm";
import { BILLING_PERIOD_DAYS } from "@/features/billing/types/billing-constants";
import type { CreditOperationItem } from "../components/credit-usage";
import { resolveSubscriptionState } from "./billing";
import { resolveProductChargingState } from "./charging-state.functions";
import type { CreditOperationProduct } from "./credit-operation-registry";
import { queryCreditUsageHistory } from "./credit-usage.functions";

export interface BillingSubscription {
	id: string;
	userId: string;
	plan: string;
	status: string;
	midtransOrderId: string | null;
	currentPeriodStart: string | null;
	currentPeriodEnd: string | null;
	cancelledAt: string | null;
	reminderCount: number;
	credits: number;
	creditsUsed: number;
	creditsReserved: number;
	createdAt: string | null;
	updatedAt: string | null;
}

export interface BillingPaymentItem {
	id: string;
	userId: string;
	amount: number;
	status: string;
	plan: string | null;
	snapToken: string | null;
	createdAt: string | null;
	updatedAt: string | null;
}

export type ProductTrialState = "available" | "reserved" | "consumed";

export interface BillingProductUsage {
	product: CreditOperationProduct;
	credits: number;
}
export interface BillingCreditUsage {
	availableCredits: number;
	reservedCredits: number;
	totalCreditsUsed: number;
	operations: CreditOperationItem[];
	productBreakdown: BillingProductUsage[];
	periodStart: string;
	pagination?: {
		page: number;
		pageSize: number;
		total: number;
		totalPages: number;
	};
}

export const loadBilling = createServerFn({ method: "GET" }).handler(
	async () => {
		const { requireUserServer } = await import("@/lib/session");
		const user = await requireUserServer();
		const { db } = await import("@/db");
		const { creditOperations, payments, productTrials, subscriptions } =
			await import("@/db/schema");

		const [subRows, paymentRows, initialUsage] = await Promise.all([
			db
				.select()
				.from(subscriptions)
				.where(eq(subscriptions.userId, user.id))
				.orderBy(desc(subscriptions.createdAt))
				.limit(1),
			// ponytail: exclude pending - internal Midtrans state, user doesn't need to see
			// abandoned checkouts (accidental pricing page clicks, browser back, etc.)
			db
				.select()
				.from(payments)
				.where(
					and(eq(payments.userId, user.id), ne(payments.status, "pending")),
				)
				.orderBy(desc(payments.createdAt)),
			queryCreditUsageHistory(user.id, { page: 1, pageSize: 10 }),
		]);
		const now = new Date();
		const periodStart =
			subRows[0]?.currentPeriodStart ??
			new Date(now.getTime() - BILLING_PERIOD_DAYS * 24 * 60 * 60 * 1000);
		const [trialRows, productUsageRows] = await Promise.all([
			db
				.select({ product: productTrials.product, state: productTrials.state })
				.from(productTrials)
				.where(
					and(
						eq(productTrials.userId, user.id),
						inArray(productTrials.product, ["studio", "scrape"]),
					),
				),
			// Only settled paid charges count. Trials, exempt work, initial
			// analysis allowance, shadow metering and open holds are excluded.
			db
				.select({
					product: creditOperations.product,
					credits: sql<number>`coalesce(sum(${creditOperations.finalCharge}), 0)`,
				})
				.from(creditOperations)
				.where(
					and(
						eq(creditOperations.userId, user.id),
						eq(creditOperations.state, "settled"),
						eq(creditOperations.fundingSource, "subscription_balance"),
						gt(creditOperations.finalCharge, 0),
						gte(creditOperations.settledAt, periodStart),
						lte(creditOperations.settledAt, now),
					),
				)
				.groupBy(creditOperations.product),
		]);

		const trials: Record<"studio" | "scrape", ProductTrialState> = {
			studio: "available",
			scrape: "available",
		};
		for (const row of trialRows) {
			trials[row.product] = row.state === "released" ? "available" : row.state;
		}

		const productBreakdown: BillingProductUsage[] = productUsageRows.map(
			(row) => ({
				product: row.product ?? "legacy_unknown",
				credits: Number(row.credits ?? 0),
			}),
		);

		// ponytail: server fn boundary rejects Date + unknown - coerce to plain JSON.
		const subscription: BillingSubscription | undefined = subRows[0]
			? {
					id: subRows[0].id,
					userId: subRows[0].userId,
					plan: subRows[0].plan,
					status: subRows[0].status,
					midtransOrderId: subRows[0].midtransOrderId ?? null,
					currentPeriodStart:
						subRows[0].currentPeriodStart?.toISOString() ?? null,
					currentPeriodEnd: subRows[0].currentPeriodEnd?.toISOString() ?? null,
					cancelledAt: subRows[0].cancelledAt?.toISOString() ?? null,
					reminderCount: subRows[0].reminderCount,
					credits: subRows[0].credits,
					creditsUsed: subRows[0].creditsUsed,
					creditsReserved: subRows[0].creditsReserved,
					createdAt: subRows[0].createdAt?.toISOString() ?? null,
					updatedAt: subRows[0].updatedAt?.toISOString() ?? null,
				}
			: undefined;

		const paymentsList: BillingPaymentItem[] = paymentRows.map((p) => ({
			id: p.id,
			userId: p.userId,
			amount: p.amount ?? 0,
			status:
				p.midtransResponse !== null &&
				typeof p.midtransResponse === "object" &&
				"reversal" in p.midtransResponse &&
				typeof p.midtransResponse.reversal === "string"
					? p.midtransResponse.reversal
					: (p.status ?? "pending"),
			plan: p.plan ?? "pro",
			snapToken: null,
			createdAt: p.createdAt?.toISOString() ?? null,
			updatedAt: p.updatedAt?.toISOString() ?? null,
		}));

		const operationsList: CreditOperationItem[] = initialUsage.items;

		const creditsUsed = subscription?.creditsUsed ?? 0;
		const creditsReserved = subscription?.creditsReserved ?? 0;
		// Canonical state: a paused period forfeits leftovers, so plain subtraction
		// would over-report spendable capacity on the first render.
		const availableCredits = resolveSubscriptionState(
			subRows[0],
			now,
		).remaining;

		const creditUsage: BillingCreditUsage = {
			availableCredits,
			reservedCredits: creditsReserved,
			totalCreditsUsed: creditsUsed,
			operations: operationsList,
			productBreakdown,
			periodStart: periodStart.toISOString(),
			pagination: {
				page: initialUsage.page,
				pageSize: initialUsage.pageSize,
				total: initialUsage.total,
				totalPages: initialUsage.totalPages,
			},
		};

		return {
			subscription,
			payments: paymentsList,
			creditUsage,
			trials,
			productChargingEnabled: resolveProductChargingState(process.env),
		};
	},
);
