import {
	canPurchaseTopUp,
	computePurchaseGrant,
	resolveSubscriptionState,
} from "@/features/billing/services/billing";
import {
	ADAPTIVE_CREDIT_PRICING,
	TOPUP_SKU,
} from "@/features/billing/types/billing-constants";
import type { Plan } from "@/types/database";
import { isTopUpOrder, planFromAmount } from "./payment-pricing";

export interface PaymentRow {
	orderId: string;
	userId: string;
	amount: number | null;
	plan: string | null;
	status: string | null;
	midtransResponse?: unknown;
	createdAt?: Date;
	updatedAt?: Date;
}

export interface PaymentSubscriptionRow {
	id: string;
	userId: string;
	plan: string | null;
	status: string | null;
	credits: number | null;
	creditsUsed: number | null;
	creditsReserved: number | null;
	currentPeriodStart: Date | null;
	currentPeriodEnd: Date | null;
	cancelledAt?: Date | null;
	reminderCount: number;
	midtransOrderId?: string | null;
	createdAt?: Date;
	updatedAt?: Date;
}

export interface PaymentLedgerEntry {
	id: string;
	userId: string;
	operationId: string | null;
	amount: number;
	entryType: "grant";
	sourceCategory: "system_grant";
	pricingVersion: string;
	metadata: { reason: string };
	createdAt: Date;
}

export interface PaymentServiceStore {
	payments: Map<string, PaymentRow>;
	subscriptions: PaymentSubscriptionRow[];
	ledger: PaymentLedgerEntry[];
}

export function createPaymentService(store: PaymentServiceStore) {
	return {
		applyPaymentSuccess(orderId: string): { plan: Plan } | null {
			const payment = store.payments.get(orderId);
			if (!payment) return null;
			if (payment.status === "success") return { plan: payment.plan as Plan };

			const plan = planFromAmount(payment.amount ?? 0);
			const now = new Date();

			const userSubs = store.subscriptions
				.filter((s) => s.userId === payment.userId)
				.sort(
					(a, b) =>
						(b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0),
				);
			const existingSub = userSubs[0];

			const grant = computePurchaseGrant({
				plan,
				now,
				activePeriodEnd: existingSub?.currentPeriodEnd ?? null,
			});

			if (existingSub) {
				existingSub.plan = plan;
				existingSub.status = "active";
				existingSub.midtransOrderId = orderId;
				existingSub.credits = grant.credits;
				existingSub.creditsUsed = 0;
				existingSub.creditsReserved = 0;
				existingSub.currentPeriodStart = grant.periodStart;
				existingSub.currentPeriodEnd = grant.periodEnd;
				existingSub.cancelledAt = null;
				existingSub.reminderCount = 0;
				existingSub.updatedAt = now;
			} else {
				store.subscriptions.push({
					id: crypto.randomUUID(),
					userId: payment.userId,
					plan,
					status: "active",
					midtransOrderId: orderId,
					credits: grant.credits,
					creditsUsed: 0,
					creditsReserved: 0,
					currentPeriodStart: grant.periodStart,
					currentPeriodEnd: grant.periodEnd,
					reminderCount: 0,
					createdAt: now,
					updatedAt: now,
				});
			}

			store.ledger.push({
				id: crypto.randomUUID(),
				userId: payment.userId,
				operationId: null,
				amount: grant.credits,
				entryType: "grant",
				sourceCategory: "system_grant",
				pricingVersion: ADAPTIVE_CREDIT_PRICING.version,
				metadata: { reason: `payment_order:${orderId}` },
				createdAt: now,
			});

			payment.status = "success";
			payment.updatedAt = now;
			return { plan };
		},

		applyTopUpSuccess(orderId: string): { plan: Plan } | null {
			const payment = store.payments.get(orderId);
			if (!payment) return null;

			const userSubs = store.subscriptions
				.filter((s) => s.userId === payment.userId)
				.sort(
					(a, b) =>
						(b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0),
				);
			const sub = userSubs[0];

			if (payment.status === "success") {
				return { plan: (sub?.plan ?? "pro") as Plan };
			}
			if (
				payment.midtransResponse &&
				typeof payment.midtransResponse === "object" &&
				"reversal" in payment.midtransResponse
			)
				return null;

			if (
				payment.plan !== TOPUP_SKU.id ||
				payment.amount !== TOPUP_SKU.priceIdr
			)
				return null;

			const now = new Date();
			const eff = resolveSubscriptionState(sub, now);
			if (!canPurchaseTopUp(eff) || !sub) {
				payment.status = "failed";
				payment.midtransResponse = {
					...(typeof payment.midtransResponse === "object" &&
					payment.midtransResponse !== null
						? payment.midtransResponse
						: {}),
					topupRejected: "not_active_paid",
				};
				payment.updatedAt = now;
				return null;
			}

			sub.credits = (sub.credits ?? 0) + TOPUP_SKU.credits;
			sub.updatedAt = now;

			store.ledger.push({
				id: crypto.randomUUID(),
				userId: payment.userId,
				operationId: null,
				amount: TOPUP_SKU.credits,
				entryType: "grant",
				sourceCategory: "system_grant",
				pricingVersion: ADAPTIVE_CREDIT_PRICING.version,
				metadata: { reason: `topup_order:${orderId}` },
				createdAt: now,
			});

			payment.status = "success";
			payment.updatedAt = now;
			return { plan: (sub.plan ?? "pro") as Plan };
		},

		applyOrderSuccess(orderId: string): { plan: Plan } | null {
			const payment = store.payments.get(orderId);
			if (!payment) return this.applyPaymentSuccess(orderId);
			return isTopUpOrder(payment.plan)
				? this.applyTopUpSuccess(orderId)
				: this.applyPaymentSuccess(orderId);
		},
	};
}
