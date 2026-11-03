import { createServerFn } from "@tanstack/react-start";
import { and, desc, eq, ne } from "drizzle-orm";
import type { CreditOperationItem } from "../components/credit-usage";
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

export interface BillingCreditUsage {
	availableCredits: number;
	reservedCredits: number;
	totalCreditsUsed: number;
	operations: CreditOperationItem[];
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
		const { payments, subscriptions } = await import("@/db/schema");

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

		const credits = subscription?.credits ?? 0;
		const creditsUsed = subscription?.creditsUsed ?? 0;
		const creditsReserved = subscription?.creditsReserved ?? 0;
		const availableCredits = Math.max(
			0,
			credits - creditsUsed - creditsReserved,
		);

		const creditUsage: BillingCreditUsage = {
			availableCredits,
			reservedCredits: creditsReserved,
			totalCreditsUsed: creditsUsed,
			operations: operationsList,
			pagination: {
				page: initialUsage.page,
				pageSize: initialUsage.pageSize,
				total: initialUsage.total,
				totalPages: initialUsage.totalPages,
			},
		};

		return { subscription, payments: paymentsList, creditUsage };
	},
);
