import { and, desc, eq, sql } from "drizzle-orm";
import {
	getDatabase,
	orValidPeriod,
} from "@/features/billing/services/credit-db";
import {
	requireBoundSubscriptionId,
	resolveSettlementParameters,
} from "@/features/billing/services/credit-guards";
import type {
	CreditOperationResult,
	SettleCreditOperationInput,
} from "@/features/billing/types/credit-contracts";
import { CreditSubscriptionOriginError } from "@/features/billing/types/credit-contracts";

export async function settleCreditOperation(
	input: SettleCreditOperationInput,
	transaction?: Parameters<
		Parameters<Awaited<ReturnType<typeof getDatabase>>["db"]["transaction"]>[0]
	>[0],
): Promise<CreditOperationResult> {
	const { db, schema } = await getDatabase();
	const settle = async (
		tx: NonNullable<typeof transaction>,
	): Promise<CreditOperationResult> => {
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
		if (
			operation.kind === "codebase_analysis" &&
			operation.expiresAt &&
			operation.expiresAt.getTime() <= Date.now()
		)
			throw new Error("Analysis reservation expired");
		if (!["reserved", "running", "settling"].includes(operation.state))
			throw new Error("Credit operation is already terminal");

		const { artifactReference, finalCharge, measuredUnits } =
			resolveSettlementParameters(operation, input);

		if (operation.isExempt) {
			const updated = await tx
				.update(schema.creditOperations)
				.set({
					state: "settled",
					reservedCredits: 0,
					finalCharge: 0,
					artifactReference: artifactReference,
					usage: { measuredUnits: measuredUnits },
					capApplied: false,
					settledAt: new Date(),
					updatedAt: new Date(),
				})
				.where(
					and(
						eq(schema.creditOperations.id, operation.id),
						sql`${schema.creditOperations.state} IN ('reserved', 'running', 'settling')`,
					),
				)
				.returning({
					id: schema.creditOperations.id,
					state: schema.creditOperations.state,
					finalCharge: schema.creditOperations.finalCharge,
					analysisReference: schema.creditOperations.analysisReference,
				});
			if (updated.length !== 1)
				throw new Error("Credit operation settlement conflict");
			return updated[0];
		}

		if (!Number.isInteger(finalCharge) || finalCharge < 0)
			throw new Error("Final credit charge is invalid");
		if (!Number.isFinite(measuredUnits) || measuredUnits < 0)
			throw new Error("Measured credit usage is invalid");
		if (finalCharge > operation.maximumCredits)
			throw new Error("Final credit charge exceeds operation maximum");
		const subscriptionId = requireBoundSubscriptionId(operation.subscriptionId);
		const [subscription] = await tx
			.select({ id: schema.subscriptions.id })
			.from(schema.subscriptions)
			.where(
				and(
					eq(schema.subscriptions.userId, input.userId),
					eq(schema.subscriptions.id, subscriptionId),
					orValidPeriod(schema.subscriptions.currentPeriodEnd),
				),
			)
			.orderBy(desc(schema.subscriptions.createdAt))
			.limit(1)
			.for("update");
		if (!subscription) throw new CreditSubscriptionOriginError("missing");
		const release = operation.reservedCredits - finalCharge;
		if (release < 0)
			throw new Error("Final credit charge exceeds reserved credit");
		const subscriptionUpdates = await tx
			.update(schema.subscriptions)
			.set({
				creditsReserved: sql`${schema.subscriptions.creditsReserved} - ${operation.reservedCredits}`,
				creditsUsed: sql`${schema.subscriptions.creditsUsed} + ${finalCharge}`,
				updatedAt: new Date(),
			})
			.where(eq(schema.subscriptions.id, subscription.id))
			.returning({ id: schema.subscriptions.id });
		if (subscriptionUpdates.length !== 1)
			throw new Error("Credit subscription settlement conflict");
		if (release > 0)
			await tx.insert(schema.creditLedgerEntries).values({
				id: crypto.randomUUID(),
				userId: input.userId,
				operationId: operation.id,
				amount: release,
				entryType: "release",
				sourceCategory: "adaptive_credit",
				pricingVersion: operation.pricingVersion,
				metadata: { reason: "unused credit reservation released" },
			});
		if (finalCharge > 0)
			await tx.insert(schema.creditLedgerEntries).values({
				id: crypto.randomUUID(),
				userId: input.userId,
				operationId: operation.id,
				amount: -finalCharge,
				entryType: "debit",
				sourceCategory: "adaptive_credit",
				pricingVersion: operation.pricingVersion,
				metadata: {
					reason: "credit operation settled",
					measuredUnits: measuredUnits,
				},
			});
		const updated = await tx
			.update(schema.creditOperations)
			.set({
				state: "settled",
				reservedCredits: 0,
				finalCharge: finalCharge,
				artifactReference: artifactReference,
				usage: { measuredUnits: measuredUnits },
				capApplied:
					finalCharge === operation.maximumCredits &&
					measuredUnits > finalCharge,
				settledAt: new Date(),
				updatedAt: new Date(),
			})
			.where(
				and(
					eq(schema.creditOperations.id, operation.id),
					eq(schema.creditOperations.userId, input.userId),
					sql`${schema.creditOperations.state} IN ('reserved', 'running', 'settling')`,
				),
			)
			.returning({
				id: schema.creditOperations.id,
				state: schema.creditOperations.state,
				finalCharge: schema.creditOperations.finalCharge,
			});
		if (updated.length !== 1)
			throw new Error("Credit operation settlement conflict");
		if (operation.kind === "codebase_analysis") {
			await tx
				.update(schema.users)
				.set({ initialAnalysisUsedAt: new Date() })
				.where(eq(schema.users.id, input.userId));
		}
		return updated[0];
	};
	return transaction ? settle(transaction) : db.transaction(settle);
}
