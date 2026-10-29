import { and, desc, eq, sql } from "drizzle-orm";
import {
	getDatabase,
	orValidPeriod,
} from "@/features/billing/services/credit-db";
import {
	freshRetryKey,
	reservationLifecycle,
	validateQuote,
} from "@/features/billing/services/credit-guards";
import type {
	CreditOperationResult,
	ReserveCreditOperationInput,
} from "@/features/billing/types/credit-contracts";
import { CreditSubscriptionOriginError } from "@/features/billing/types/credit-contracts";
import { resolveSubscriptionState } from "./billing";
import {
	lockInitialAnalysisAccount,
	readInitialAnalysisAllowance,
} from "./initial-analysis-allowance";

export async function reserveCreditOperation(
	input: ReserveCreditOperationInput,
): Promise<CreditOperationResult> {
	const { db, schema } = await getDatabase();
	return db.transaction(async (tx) => {
		const [project] = await tx
			.select({ id: schema.projects.id })
			.from(schema.projects)
			.where(
				and(
					eq(schema.projects.id, input.projectId),
					eq(schema.projects.userId, input.userId),
				),
			)
			.limit(1);
		if (!project) throw new Error("Credit operation ownership mismatch");

		if (input.initialAnalysisAllowance)
			await lockInitialAnalysisAccount(tx, input.userId);
		const [existing] = await tx
			.select({
				id: schema.creditOperations.id,
				state: schema.creditOperations.state,
				finalCharge: schema.creditOperations.finalCharge,
				analysisReference: schema.creditOperations.analysisReference,
			})
			.from(schema.creditOperations)
			.where(
				and(
					eq(schema.creditOperations.userId, input.userId),
					eq(schema.creditOperations.idempotencyKey, input.idempotencyKey),
				),
			)
			.limit(1);
		if (existing)
			return {
				id: existing.id,
				state: existing.state,
				finalCharge: existing.finalCharge,
				analysisReference: existing.analysisReference,
			};
		validateQuote(input.quote, input.operation, input.metrics);
		if (input.initialAnalysisAllowance) {
			if (input.operation !== "codebase_analysis")
				throw new Error("Invalid allowance operation");
			const allowance = await readInitialAnalysisAllowance(tx, input.userId);
			if (allowance.used || allowance.inProgress)
				throw new Error("Initial analysis allowance unavailable");
		}
		const maximumCredits = input.initialAnalysisAllowance
			? 0
			: input.quote.maximumCredits;
		const [subscription] = await tx
			.select()
			.from(schema.subscriptions)
			.where(eq(schema.subscriptions.userId, input.userId))
			.orderBy(desc(schema.subscriptions.createdAt))
			.limit(1);
		if (!subscription) throw new CreditSubscriptionOriginError("missing");
		if (resolveSubscriptionState(subscription, new Date()).state === "paused")
			throw new CreditSubscriptionOriginError("invalid_period");
		const [operation] = await tx
			.insert(schema.creditOperations)
			.values({
				id: crypto.randomUUID(),
				userId: input.userId,
				projectId: input.projectId,
				subscriptionId: subscription.id,
				kind: input.operation,
				stage: input.stage,
				idempotencyKey: input.idempotencyKey,
				state: "quoted",
				initialAnalysisAllowance: input.initialAnalysisAllowance ?? false,
				analysisReference: input.analysisReference,
				estimatedCredits: input.initialAnalysisAllowance
					? 0
					: input.quote.estimatedCredits,
				reservedCredits: 0,
				maximumCredits,
				pricingVersion: input.quote.pricingVersion,
				metrics: input.quote.metrics,
				expiresAt: input.expiresAt,
			})
			.onConflictDoNothing({
				target: [
					schema.creditOperations.userId,
					schema.creditOperations.idempotencyKey,
				],
			})
			.returning();
		if (!operation) {
			const [retry] = await tx
				.select()
				.from(schema.creditOperations)
				.where(
					and(
						eq(schema.creditOperations.userId, input.userId),
						eq(schema.creditOperations.idempotencyKey, input.idempotencyKey),
					),
				)
				.limit(1);
			if (!retry) throw new Error("Credit operation idempotency conflict");
			return {
				id: retry.id,
				state: retry.state,
				finalCharge: retry.finalCharge,
				analysisReference: retry.analysisReference,
			};
		}

		const updated = await tx
			.update(schema.subscriptions)
			.set({
				creditsReserved: sql`${schema.subscriptions.creditsReserved} + ${maximumCredits}`,
				updatedAt: new Date(),
			})
			.where(
				and(
					eq(schema.subscriptions.id, subscription.id),
					eq(schema.subscriptions.userId, input.userId),
					sql`${schema.subscriptions.credits} - ${schema.subscriptions.creditsUsed} - ${schema.subscriptions.creditsReserved} >= ${maximumCredits}`,
					orValidPeriod(schema.subscriptions.currentPeriodEnd),
				),
			)
			.returning({ id: schema.subscriptions.id });
		if (!updated.length) throw new Error("Insufficient available credit");
		const operationUpdates = await tx
			.update(schema.creditOperations)
			.set({
				state: "reserved",
				reservedCredits: maximumCredits,
				reservedAt: new Date(),
				updatedAt: new Date(),
			})
			.where(
				and(
					eq(schema.creditOperations.id, operation.id),
					eq(schema.creditOperations.state, "quoted"),
				),
			)
			.returning({ id: schema.creditOperations.id });
		if (operationUpdates.length !== 1)
			throw new Error("Credit operation reservation transition conflict");
		if (maximumCredits > 0)
			await tx.insert(schema.creditLedgerEntries).values({
				id: crypto.randomUUID(),
				userId: input.userId,
				operationId: operation.id,
				amount: -maximumCredits,
				entryType: "reservation",
				sourceCategory: "adaptive_credit",
				pricingVersion: input.quote.pricingVersion,
				metadata: { reason: "credit reservation" },
			});
		return {
			id: operation.id,
			state: "reserved",
			finalCharge: null,
			analysisReference: operation.analysisReference,
		};
	});
}

export async function markCreditOperationRunning(input: {
	userId: string;
	operationId: string;
}): Promise<CreditOperationResult> {
	const { db, schema } = await getDatabase();
	return db.transaction(async (tx) => {
		const [operation] = await tx
			.select()
			.from(schema.creditOperations)
			.where(
				and(
					eq(schema.creditOperations.id, input.operationId),
					eq(schema.creditOperations.userId, input.userId),
				),
			)
			.for("update")
			.limit(1);
		if (!operation) throw new Error("Credit operation ownership mismatch");
		if (operation.state !== "reserved")
			throw new Error("Credit operation is not reserved");
		const updated = await tx
			.update(schema.creditOperations)
			.set({ state: "running", startedAt: new Date(), updatedAt: new Date() })
			.where(
				and(
					eq(schema.creditOperations.id, operation.id),
					eq(schema.creditOperations.state, "reserved"),
				),
			)
			.returning({
				id: schema.creditOperations.id,
				state: schema.creditOperations.state,
				finalCharge: schema.creditOperations.finalCharge,
			});
		if (updated.length !== 1)
			throw new Error("Credit operation transition conflict");
		return updated[0];
	});
}

/**
 * Reserve a credit operation that is guaranteed active. A terminal
 * operation returned for a reused idempotency key (settled, released,
 * failed, ...) cannot generate again, so mint a fresh attempt key
 * instead of letting the caller regenerate for free (settled) or
 * against a dead reservation. Genuine in-flight retries keep joining
 * the existing active operation.
 */
export async function reserveActiveCreditOperation(
	input: ReserveCreditOperationInput,
): Promise<CreditOperationResult> {
	const existing = await reserveCreditOperation(input);
	if (reservationLifecycle(existing.state) === "active") return existing;
	return reserveCreditOperation({
		...input,
		idempotencyKey: freshRetryKey(input.idempotencyKey),
	});
}
