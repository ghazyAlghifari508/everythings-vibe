import { estimateCreditQuote } from "@/features/billing/services/adaptive-credit";
import {
	appendLedger,
	assertActiveReservation,
	isPermanentlyUnresolvableSubscription,
	now,
	operationResult,
	requireBoundSubscriptionId,
	requireOperation,
	requireProject,
	requireSubscription,
	resolveSettlementParameters,
	validateQuote,
} from "@/features/billing/services/credit-guards";
import type {
	CreditOperation,
	CreditOperationResult,
	CreditQuoteInput,
	CreditServiceStore,
	ReserveCreditOperationInput,
	SettleCreditOperationInput,
} from "@/features/billing/types/credit-contracts";
import { CreditSubscriptionOriginError } from "@/features/billing/types/credit-contracts";

export function createCreditService(store: CreditServiceStore) {
	return {
		createCreditQuote(input: CreditQuoteInput) {
			requireProject(store, input.userId, input.projectId);
			return estimateCreditQuote({
				operation: input.operation,
				metrics: input.metrics,
			});
		},

		reserveCreditOperation(
			input: ReserveCreditOperationInput,
		): CreditOperationResult {
			requireProject(store, input.userId, input.projectId);
			const existing = [...store.operations.values()].find(
				(operation) =>
					operation.userId === input.userId &&
					operation.idempotencyKey === input.idempotencyKey,
			);
			if (existing) return operationResult(existing);
			validateQuote(input.quote, input.operation, input.metrics);
			if (input.quote.estimatedCredits > input.quote.maximumCredits) {
				throw new Error("Credit quote exceeds its configured maximum");
			}
			const isExempt = Boolean(input.isExempt);
			let subscription: ReturnType<typeof requireSubscription> | undefined;
			if (!isExempt) {
				subscription = requireSubscription(store, input.userId);
				const available =
					subscription.credits -
					subscription.creditsUsed -
					subscription.creditsReserved;
				if (available < input.quote.maximumCredits)
					throw new Error("Insufficient available credit");
			}
			const timestamp = now();
			const reservedCredits = isExempt ? 0 : input.quote.maximumCredits;
			const maximumCredits = isExempt ? 0 : input.quote.maximumCredits;
			const operation: CreditOperation = {
				id: crypto.randomUUID(),
				userId: input.userId,
				projectId: input.projectId,
				subscriptionId: subscription?.id ?? null,
				kind: input.quote.operation,
				stage: input.stage,
				idempotencyKey: input.idempotencyKey,
				state: "reserved",
				estimatedCredits: isExempt ? 0 : input.quote.estimatedCredits,
				reservedCredits,
				maximumCredits,
				finalCharge: null,
				pricingVersion: input.quote.pricingVersion,
				metrics: input.quote.metrics,
				capApplied: false,
				artifactReference: null,
				failureReason: null,
				isExempt,
				exemptionReason: isExempt
					? (input.exemptionReason ?? "internal")
					: null,
				reconciliation: { status: "not_required" },
				expiresAt: input.expiresAt ?? null,
				createdAt: timestamp,
				updatedAt: timestamp,
			};
			store.operations.set(operation.id, operation);
			if (subscription && reservedCredits > 0) {
				subscription.creditsReserved += operation.reservedCredits;
				appendLedger(store, {
					userId: input.userId,
					operationId: operation.id,
					amount: -operation.reservedCredits,
					entryType: "reservation",
					reason: "credit reservation",
					pricingVersion: input.quote.pricingVersion,
				});
			}
			return operationResult(operation);
		},

		markCreditOperationRunning(input: {
			userId: string;
			operationId: string;
		}): CreditOperationResult {
			const operation = requireOperation(
				store,
				input.userId,
				input.operationId,
			);
			if (operation.state !== "reserved")
				throw new Error("Credit operation is not reserved");
			operation.state = "running";
			operation.updatedAt = now();
			return operationResult(operation);
		},

		settleCreditOperation(
			input: SettleCreditOperationInput,
		): CreditOperationResult {
			const operation = requireOperation(
				store,
				input.userId,
				input.operationId,
			);
			assertActiveReservation(operation.state);
			const { artifactReference, finalCharge, measuredUnits } =
				resolveSettlementParameters(operation, input);
			if (operation.isExempt) {
				operation.state = "settled";
				operation.finalCharge = 0;
				operation.reservedCredits = 0;
				operation.artifactReference = artifactReference;
				operation.usage = { measuredUnits };
				operation.capApplied = false;
				operation.updatedAt = now();
				return operationResult(operation);
			}
			if (
				!Number.isInteger(finalCharge) ||
				finalCharge < 0 ||
				finalCharge > operation.maximumCredits
			) {
				throw new Error("Final credit charge is outside the operation maximum");
			}
			if (!Number.isFinite(measuredUnits) || measuredUnits < 0) {
				throw new Error("Measured credit usage is invalid");
			}
			const subscriptionId = requireBoundSubscriptionId(
				operation.subscriptionId,
			);
			const subscription = store.subscriptions.get(subscriptionId);
			if (
				!subscription ||
				subscription.userId !== input.userId ||
				(subscription.currentPeriodEnd &&
					subscription.currentPeriodEnd.getTime() < Date.now())
			) {
				throw new CreditSubscriptionOriginError("missing");
			}
			const release = operation.reservedCredits - finalCharge;
			subscription.creditsReserved -= operation.reservedCredits;
			subscription.creditsUsed += finalCharge;
			if (release > 0)
				appendLedger(store, {
					userId: input.userId,
					operationId: operation.id,
					amount: release,
					entryType: "release",
					reason: "unused credit reservation released",
					pricingVersion: operation.pricingVersion,
				});
			if (finalCharge > 0)
				appendLedger(store, {
					userId: input.userId,
					operationId: operation.id,
					amount: -finalCharge,
					entryType: "debit",
					reason: "credit operation settled",
					pricingVersion: operation.pricingVersion,
				});
			operation.state = "settled";
			operation.finalCharge = finalCharge;
			operation.reservedCredits = 0;
			operation.artifactReference = artifactReference;
			operation.usage = { measuredUnits };
			operation.capApplied =
				finalCharge === operation.maximumCredits && measuredUnits > finalCharge;
			operation.updatedAt = now();
			return operationResult(operation);
		},

		releaseCreditOperation(input: {
			userId: string;
			operationId: string;
			reason: string;
		}): CreditOperationResult {
			const operation = requireOperation(
				store,
				input.userId,
				input.operationId,
			);
			assertActiveReservation(operation.state);
			if (operation.isExempt || operation.reservedCredits === 0) {
				operation.state = "released";
				operation.reservedCredits = 0;
				operation.failureReason = input.reason;
				operation.updatedAt = now();
				return operationResult(operation);
			}
			const subscriptionId = requireBoundSubscriptionId(
				operation.subscriptionId,
			);
			const subscription = store.subscriptions.get(subscriptionId);
			if (
				!subscription ||
				subscription.userId !== input.userId ||
				(subscription.currentPeriodEnd &&
					subscription.currentPeriodEnd.getTime() < Date.now())
			) {
				throw new CreditSubscriptionOriginError("missing");
			}
			const released = operation.reservedCredits;
			subscription.creditsReserved -= released;
			if (released > 0)
				appendLedger(store, {
					userId: input.userId,
					operationId: operation.id,
					amount: released,
					entryType: "release",
					reason: input.reason,
					pricingVersion: operation.pricingVersion,
				});
			operation.state = "released";
			operation.reservedCredits = 0;
			operation.failureReason = input.reason;
			operation.updatedAt = now();
			return operationResult(operation);
		},

		quarantineCreditOperation(input: {
			userId: string;
			operationId: string;
			reason: string;
		}): CreditOperationResult {
			const operation = requireOperation(
				store,
				input.userId,
				input.operationId,
			);
			assertActiveReservation(operation.state);
			const subscription = operation.subscriptionId
				? store.subscriptions.get(operation.subscriptionId)
				: undefined;
			if (subscription && subscription.userId === input.userId) {
				subscription.creditsReserved -= operation.reservedCredits;
			}
			if (operation.reservedCredits > 0)
				appendLedger(store, {
					userId: input.userId,
					operationId: operation.id,
					amount: operation.reservedCredits,
					entryType: "correction",
					reason: input.reason,
					metadata: {
						reconciliationCode: "subscription_origin_unresolvable",
						accounting: "manual_correction_required",
					},
					pricingVersion: operation.pricingVersion,
				});
			operation.state = "quarantined";
			operation.reservedCredits = 0;
			operation.failureReason = input.reason;
			operation.reconciliation = {
				status: "resolved",
				code: "subscription_origin_unresolvable",
				accounting: "manual_correction_required",
				resolvedAt: now().toISOString(),
			};
			operation.updatedAt = now();
			return operationResult(operation);
		},

		refundCreditOperation(input: {
			userId: string;
			operationId: string;
			reason: string;
		}): CreditOperationResult {
			const operation = requireOperation(
				store,
				input.userId,
				input.operationId,
			);
			if (operation.state !== "settled" || operation.finalCharge === null) {
				throw new Error("Only settled credit operations can be refunded");
			}
			const subscriptionId = requireBoundSubscriptionId(
				operation.subscriptionId,
			);
			const subscription = store.subscriptions.get(subscriptionId);
			if (
				!subscription ||
				subscription.userId !== input.userId ||
				(subscription.currentPeriodEnd &&
					subscription.currentPeriodEnd.getTime() < Date.now())
			) {
				throw new CreditSubscriptionOriginError("missing");
			}
			subscription.creditsUsed -= operation.finalCharge;
			appendLedger(store, {
				userId: input.userId,
				operationId: operation.id,
				amount: operation.finalCharge,
				entryType: "refund",
				reason: input.reason,
				pricingVersion: operation.pricingVersion,
			});
			operation.state = "refunded";
			operation.updatedAt = now();
			return operationResult(operation);
		},

		getCreditOperation(input: {
			userId: string;
			operationId: string;
		}): CreditOperationResult {
			return operationResult(
				requireOperation(store, input.userId, input.operationId),
			);
		},

		reconcileExpiredCreditOperations(input: { userId: string; now: Date }): {
			releasedOperationIds: string[];
		} {
			const releasedOperationIds: string[] = [];
			for (const operation of store.operations.values()) {
				if (
					operation.userId !== input.userId ||
					!operation.expiresAt ||
					operation.expiresAt > input.now
				)
					continue;
				if (!["reserved", "running", "settling"].includes(operation.state))
					continue;
				operation.state = "settling";
				try {
					this.releaseCreditOperation({
						userId: input.userId,
						operationId: operation.id,
						reason: "operation expired",
					});
					releasedOperationIds.push(operation.id);
				} catch {
					if (isPermanentlyUnresolvableSubscription(operation, store)) {
						this.quarantineCreditOperation({
							userId: input.userId,
							operationId: operation.id,
							reason: "subscription origin is permanently unresolvable",
						});
					}
				}
			}
			return { releasedOperationIds };
		},
	};
}

export type CreditService = ReturnType<typeof createCreditService>;

export function reserveCreditOperationWithStore(
	store: CreditServiceStore,
	input: ReserveCreditOperationInput,
): CreditOperationResult {
	return createCreditService(store).reserveCreditOperation(input);
}
