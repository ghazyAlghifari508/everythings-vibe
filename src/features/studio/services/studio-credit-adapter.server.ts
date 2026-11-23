import { and, eq } from "drizzle-orm";
import {
	creditOperations,
	productTrials,
	studioJobs,
	subscriptions,
	users,
} from "@/db/schema";
import type { CreditQuote } from "@/features/billing/services/adaptive-credit";
import {
	resolveProductEntitlement,
	resolveSubscriptionState,
} from "@/features/billing/services/billing";
import {
	type CreditTransaction,
	getDatabase,
} from "@/features/billing/services/credit-db";
import { releaseCreditOperation } from "@/features/billing/services/credit-release";
import { reserveCreditOperation } from "@/features/billing/services/credit-reservation";
import { settleCreditOperation } from "@/features/billing/services/credit-settlement";
import type { TariffOutcome } from "@/features/billing/services/pricing-policy-types";
import { STUDIO_TARIFF_REGISTRY } from "@/features/billing/services/studio-tariffs";
import {
	createStudioQuote,
	isStudioChargingEnabled,
	type StudioOperationKind,
	type StudioQuote,
	type StudioQuoteScope,
	type StudioQuoteView,
	studioChargeForOutcome,
	studioEstimateLabel,
	studioMetricsForScope,
} from "./studio-credit-policy";

export type { StudioQuoteView } from "./studio-credit-policy";

/** The only server-side quote source; null means charging is not active. */
export function serverStudioQuote(scope: StudioQuoteScope): StudioQuote | null {
	if (!isStudioChargingEnabled()) return null;
	return createStudioQuote(STUDIO_TARIFF_REGISTRY, scope);
}

function creditQuoteFor(quote: StudioQuote, metrics: CreditQuote["metrics"]) {
	return {
		operation: quote.operation,
		pricingVersion: quote.version,
		estimatedCredits: quote.estimatedCredits,
		maximumCredits: quote.maximumCredits,
		metrics,
	} satisfies CreditQuote;
}

function toStudioOperationKind(kind: string): StudioOperationKind {
	switch (kind) {
		case "studio.generate":
		case "studio.add_frame":
		case "studio.revise":
		case "studio.regenerate":
			return kind;
		default:
			throw new Error("Credit operation is not a Studio operation");
	}
}

/** Server-authoritative: a client never supplies the price or tariff version. */
export async function loadStudioQuoteView(
	userId: string,
	scope: StudioQuoteScope,
): Promise<StudioQuoteView> {
	const legacy: StudioQuoteView = {
		quote: null,
		label: null,
		state: "legacy",
		availableCredits: 0,
		requiredCredits: null,
	};
	if (!isStudioChargingEnabled()) return legacy;
	const quote = createStudioQuote(STUDIO_TARIFF_REGISTRY, scope);
	if (!quote) return legacy;
	const { db } = await getDatabase();
	const [account] = await db
		.select({ exempt: users.billingExempt })
		.from(users)
		.where(eq(users.id, userId))
		.limit(1);
	const [subscription] = await db
		.select()
		.from(subscriptions)
		.where(eq(subscriptions.userId, userId))
		.orderBy(subscriptions.createdAt)
		.limit(1);
	const [trial] = await db
		.select({ state: productTrials.state })
		.from(productTrials)
		.where(
			and(
				eq(productTrials.userId, userId),
				eq(productTrials.product, "studio"),
			),
		)
		.limit(1);
	const effective = resolveSubscriptionState(subscription, new Date());
	const decision = resolveProductEntitlement({
		subscription: effective,
		exempt: account?.exempt ?? false,
		work: scope.operation === "studio.generate" ? "trial" : "paid",
		trial: trial?.state === "released" ? null : (trial?.state ?? null),
		maximumCredits: quote.maximumCredits,
	});
	const base = {
		quote,
		availableCredits: effective.remaining,
		requiredCredits: quote.maximumCredits,
	};
	switch (decision) {
		case "trial_available":
			return { ...base, state: "trial_available", label: "Trial tersedia" };
		case "paid_legacy":
		case "paid_credit_available":
			return { ...base, state: "paid", label: studioEstimateLabel(quote) };
		case "insufficient_paid_credit":
			return { ...base, state: "insufficient", label: "Kredit tidak cukup" };
		case "plan_gated":
			return { ...base, state: "plan_gated", label: null };
		case "billing_exempt":
			return { ...base, state: "billing_exempt", label: null };
		default:
			return { ...base, state: "legacy", label: null };
	}
}

export async function reserveStudioOperationCharge(
	tx: CreditTransaction,
	input: {
		userId: string;
		projectId: string;
		jobId: string;
		scope: StudioQuoteScope;
		idempotencyKey: string;
	},
): Promise<{ operationId: string; quote: StudioQuote } | null> {
	if (!isStudioChargingEnabled()) return null;
	const quote = createStudioQuote(STUDIO_TARIFF_REGISTRY, input.scope);
	if (!quote) return null;
	const metrics = studioMetricsForScope(input.scope);
	const creditQuote = creditQuoteFor(quote, metrics);
	const reserved = await reserveCreditOperation(
		{
			userId: input.userId,
			stage: "studio",
			operation: creditQuote.operation,
			metrics,
			quote: creditQuote,
			authoritativeQuote: creditQuote,
			idempotencyKey: input.idempotencyKey,
			resourceType: "studio_project",
			studioProjectId: input.projectId,
			studioJobId: input.jobId,
			expiresAt: new Date(quote.expiresAt),
		},
		tx,
	);
	await tx
		.update(studioJobs)
		.set({ creditOperationId: reserved.id })
		.where(
			and(eq(studioJobs.id, input.jobId), eq(studioJobs.userId, input.userId)),
		);
	return { operationId: reserved.id, quote };
}

/**
 * Terminal handling for one job attempt. The job keeps its credit operation id
 * across worker retries, so recovery never reserves a second charge.
 */
export async function settleStudioOperationCharge(
	tx: CreditTransaction,
	input: {
		userId: string;
		jobId: string;
		operationId: string | null;
		outcome: TariffOutcome;
		completedFrames: number;
		artifactReference: string;
	},
): Promise<void> {
	if (!input.operationId || !isStudioChargingEnabled()) return;
	const [operation] = await tx
		.select({
			kind: creditOperations.kind,
			pricingVersion: creditOperations.pricingVersion,
			maximumCredits: creditOperations.maximumCredits,
		})
		.from(creditOperations)
		.where(
			and(
				eq(creditOperations.id, input.operationId),
				eq(creditOperations.userId, input.userId),
				eq(creditOperations.studioJobId, input.jobId),
			),
		)
		.limit(1);
	if (!operation) throw new Error("Credit operation ownership mismatch");
	const charge = studioChargeForOutcome(
		STUDIO_TARIFF_REGISTRY,
		{
			operation: toStudioOperationKind(operation.kind),
			version: operation.pricingVersion,
			maximumCredits: operation.maximumCredits,
		},
		{ outcome: input.outcome, completedFrames: input.completedFrames },
	);
	if (charge === 0 && input.outcome !== "partial") {
		await releaseCreditOperation(
			{
				userId: input.userId,
				operationId: input.operationId,
				reason: `studio ${input.outcome}`,
			},
			tx,
		);
		return;
	}
	await settleCreditOperation(
		{
			userId: input.userId,
			operationId: input.operationId,
			artifactReference: input.artifactReference,
			finalCharge: charge,
			measuredUnits: input.completedFrames,
		},
		tx,
	);
}
