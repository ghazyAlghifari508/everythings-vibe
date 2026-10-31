import { createServerFn } from "@tanstack/react-start";
import { and, desc, eq, ne } from "drizzle-orm";
import { requireUserServer } from "@/lib/session";
import type { CreditOperationItem } from "../components/credit-usage";

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
}

export const loadBilling = createServerFn({ method: "GET" }).handler(
	async () => {
		const user = await requireUserServer();
		const { db } = await import("@/db");
		const { creditOperations, payments, projects, subscriptions } =
			await import("@/db/schema");

		const [subRows, paymentRows, operationRows] = await Promise.all([
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
			db
				.select({
					id: creditOperations.id,
					projectId: creditOperations.projectId,
					projectName: projects.name,
					kind: creditOperations.kind,
					stage: creditOperations.stage,
					state: creditOperations.state,
					estimatedCredits: creditOperations.estimatedCredits,
					reservedCredits: creditOperations.reservedCredits,
					maximumCredits: creditOperations.maximumCredits,
					finalCharge: creditOperations.finalCharge,
					pricingVersion: creditOperations.pricingVersion,
					metrics: creditOperations.metrics,
					capApplied: creditOperations.capApplied,
					createdAt: creditOperations.createdAt,
					settledAt: creditOperations.settledAt,
				})
				.from(creditOperations)
				.leftJoin(
					projects,
					and(
						eq(projects.id, creditOperations.projectId),
						eq(projects.userId, user.id),
					),
				)
				.where(eq(creditOperations.userId, user.id))
				.orderBy(desc(creditOperations.createdAt))
				.limit(50),
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

		const operationsList: CreditOperationItem[] = operationRows.map((op) => ({
			id: op.id,
			projectId: op.projectId,
			projectName: op.projectName ?? null,
			kind: op.kind,
			stage: op.stage,
			state: op.state,
			estimatedCredits: op.estimatedCredits,
			reservedCredits: op.reservedCredits,
			maximumCredits: op.maximumCredits,
			finalCharge: op.finalCharge,
			pricingVersion: op.pricingVersion,
			metrics: op.metrics,
			capApplied: op.capApplied,
			createdAt: op.createdAt?.toISOString() ?? null,
			settledAt: op.settledAt?.toISOString() ?? null,
		}));

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
		};

		return { subscription, payments: paymentsList, creditUsage };
	},
);
