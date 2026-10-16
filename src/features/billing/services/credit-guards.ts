import type {
	CreditLedgerEntry,
	CreditOperation,
	CreditOperationLifecycle,
	CreditOperationResult,
	CreditProject,
	CreditQuoteInput,
	CreditServiceStore,
	CreditSubscription,
	SettleCreditOperationInput,
} from "@/features/billing/types/credit-contracts";
import { CreditSubscriptionOriginError } from "@/features/billing/types/credit-contracts";
import {
	ADAPTIVE_CREDIT_PRICING,
	type CreditOperationKind,
	type CreditOperationState,
	type CreditQuote,
	calculateFinalCreditCost,
	estimateCreditQuote,
	surcharge,
} from "@/lib/adaptive-credit";

export function now(): Date {
	return new Date();
}

export function operationResult(
	operation: CreditOperation,
): CreditOperationResult {
	return {
		id: operation.id,
		state: operation.state,
		finalCharge: operation.finalCharge,
	};
}

export function appendLedger(
	store: CreditServiceStore,
	input: Omit<CreditLedgerEntry, "id" | "createdAt">,
): void {
	store.ledger.push({ ...input, id: crypto.randomUUID(), createdAt: now() });
}

export function requireProject(
	store: CreditServiceStore,
	userId: string,
	projectId: string,
): CreditProject {
	const project = store.projects.get(projectId);
	if (!project || project.userId !== userId)
		throw new Error("Credit operation ownership mismatch");
	return project;
}

export function requireSubscription(
	store: CreditServiceStore,
	userId: string,
): CreditSubscription {
	const subscription = [...store.subscriptions.values()].find(
		(row) => row.userId === userId,
	);
	if (!subscription) throw new CreditSubscriptionOriginError("missing");
	if (
		subscription.currentPeriodEnd &&
		subscription.currentPeriodEnd.getTime() < Date.now()
	) {
		throw new CreditSubscriptionOriginError("invalid_period");
	}
	return subscription;
}

export function requireOperation(
	store: CreditServiceStore,
	userId: string,
	operationId: string,
): CreditOperation {
	const operation = store.operations.get(operationId);
	if (!operation || operation.userId !== userId) {
		throw new Error("Credit operation ownership mismatch");
	}
	return operation;
}

export function assertActiveReservation(state: CreditOperationState): void {
	if (state !== "reserved" && state !== "running" && state !== "settling") {
		throw new Error("Credit operation is not active");
	}
}

export function isPermanentlyUnresolvableSubscription(
	operation: CreditOperation,
	store: CreditServiceStore,
): boolean {
	if (!operation.subscriptionId) return true;
	const subscription = store.subscriptions.get(operation.subscriptionId);
	return (
		!subscription ||
		subscription.userId !== operation.userId ||
		(subscription.currentPeriodEnd !== null &&
			subscription.currentPeriodEnd.getTime() < Date.now())
	);
}

export function requireBoundSubscriptionId(
	subscriptionId: string | null,
): string {
	if (!subscriptionId) throw new CreditSubscriptionOriginError("unresolved");
	return subscriptionId;
}

export function resolveSettlementParameters(
	operation: { kind: CreditOperationKind; maximumCredits: number },
	input: SettleCreditOperationInput,
): { artifactReference: string; finalCharge: number; measuredUnits: number } {
	const artifactReference = input.artifactReference ?? input.artifactId;
	if (!artifactReference) {
		throw new Error("Artifact reference is required for settlement");
	}

	let measuredUnits = input.measuredUnits;
	let finalCharge = input.finalCharge;

	if (measuredUnits === undefined || finalCharge === undefined) {
		if (input.actualMetrics) {
			const pricing = ADAPTIVE_CREDIT_PRICING.operations[operation.kind];
			const computedUnits =
				pricing.baseCredits + surcharge(input.actualMetrics);
			measuredUnits = measuredUnits ?? computedUnits;
			finalCharge =
				finalCharge ??
				calculateFinalCreditCost({
					operation: operation.kind,
					usage: { measuredUnits },
					maximumCredits: operation.maximumCredits,
				});
		} else {
			throw new Error(
				"Either actualMetrics or both finalCharge and measuredUnits must be provided",
			);
		}
	}

	return { artifactReference, finalCharge, measuredUnits };
}

export function validateQuote(
	quote: CreditQuote,
	operation: CreditOperationKind,
	metrics: CreditQuote["metrics"],
): void {
	if (
		!Number.isInteger(quote.estimatedCredits) ||
		!Number.isInteger(quote.maximumCredits) ||
		!Number.isFinite(quote.estimatedCredits) ||
		!Number.isFinite(quote.maximumCredits) ||
		quote.estimatedCredits < 0 ||
		quote.maximumCredits < 0 ||
		quote.estimatedCredits > quote.maximumCredits
	) {
		throw new Error("Credit quote is invalid");
	}
	const serverQuote = estimateCreditQuote({
		operation,
		metrics,
	});
	if (
		quote.operation !== operation ||
		quote.pricingVersion !== serverQuote.pricingVersion ||
		quote.estimatedCredits !== serverQuote.estimatedCredits ||
		quote.maximumCredits !== serverQuote.maximumCredits ||
		JSON.stringify(quote.metrics) !== JSON.stringify(serverQuote.metrics) ||
		JSON.stringify(metrics) !== JSON.stringify(serverQuote.metrics)
	) {
		throw new Error("Credit quote does not match server pricing");
	}
}

export function createCreditQuote(input: CreditQuoteInput): CreditQuote {
	return estimateCreditQuote({
		operation: input.operation,
		metrics: input.metrics,
	});
}

/**
 * Whether a reservation can still generate: quoted/reserved/running/
 * settling operations are live attempts, everything else (settled,
 * released, failed, quarantined, refunded) is terminal.
 */
export function reservationLifecycle(
	state: CreditOperationState,
): CreditOperationLifecycle {
	return state === "quoted" ||
		state === "reserved" ||
		state === "running" ||
		state === "settling"
		? "active"
		: "terminal";
}

/**
 * Whether this request may release the reservation. Only unstarted
 * operations (never transitioned to running) are safe: releasing a
 * running operation owned by a concurrent request would cancel a live
 * generation out from under it.
 */
export function isReleasableReservation(state: CreditOperationState): boolean {
	return state === "quoted" || state === "reserved";
}

export function freshRetryKey(idempotencyKey: string): string {
	return `${idempotencyKey}:retry:${crypto.randomUUID()}`;
}
