import { and, desc, eq, sql } from "drizzle-orm";
import {
	getDatabase,
	orValidPeriod,
} from "@/features/billing/services/credit-db";
import { requireBoundSubscriptionId } from "@/features/billing/services/credit-guards";
import type { CreditOperationResult } from "@/features/billing/types/credit-contracts";
import { CreditSubscriptionOriginError } from "@/features/billing/types/credit-contracts";

export async function releaseCreditOperation(input: {
	userId: string;
	operationId: string;
	reason: string;
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
		if (!["reserved", "running", "settling"].includes(operation.state))
			throw new Error("Credit operation is not active");
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
		const subscriptionUpdates = await tx
			.update(schema.subscriptions)
			.set({
				creditsReserved: sql`${schema.subscriptions.creditsReserved} - ${operation.reservedCredits}`,
				updatedAt: new Date(),
			})
			.where(eq(schema.subscriptions.id, subscription.id))
			.returning({ id: schema.subscriptions.id });
		if (subscriptionUpdates.length !== 1)
			throw new Error("Credit subscription release conflict");
		if (operation.reservedCredits > 0)
			await tx.insert(schema.creditLedgerEntries).values({
				id: crypto.randomUUID(),
				userId: input.userId,
				operationId: operation.id,
				amount: operation.reservedCredits,
				entryType: "release",
				sourceCategory: "adaptive_credit",
				pricingVersion: operation.pricingVersion,
				metadata: { reason: input.reason },
			});
		const updated = await tx
			.update(schema.creditOperations)
			.set({
				state: "released",
				reservedCredits: 0,
				releasedAt: new Date(),
				failure: {
					message: input.reason,
					occurredAt: new Date().toISOString(),
				},
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
			});
		if (updated.length !== 1)
			throw new Error("Credit operation release conflict");
		return updated[0];
	});
}

export async function refundCreditOperation(input: {
	userId: string;
	operationId: string;
	reason: string;
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
		if (operation.state !== "settled" || operation.finalCharge === null)
			throw new Error("Only settled credit operations can be refunded");
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
		const subscriptionUpdates = await tx
			.update(schema.subscriptions)
			.set({
				creditsUsed: sql`${schema.subscriptions.creditsUsed} - ${operation.finalCharge}`,
				updatedAt: new Date(),
			})
			.where(eq(schema.subscriptions.id, subscription.id))
			.returning({ id: schema.subscriptions.id });
		if (subscriptionUpdates.length !== 1)
			throw new Error("Credit subscription refund conflict");
		await tx.insert(schema.creditLedgerEntries).values({
			id: crypto.randomUUID(),
			userId: input.userId,
			operationId: operation.id,
			amount: operation.finalCharge,
			entryType: "refund",
			sourceCategory: "adaptive_credit",
			pricingVersion: operation.pricingVersion,
			metadata: { reason: input.reason },
		});
		const updated = await tx
			.update(schema.creditOperations)
			.set({ state: "refunded", updatedAt: new Date() })
			.where(
				and(
					eq(schema.creditOperations.id, operation.id),
					eq(schema.creditOperations.state, "settled"),
				),
			)
			.returning({
				id: schema.creditOperations.id,
				state: schema.creditOperations.state,
				finalCharge: schema.creditOperations.finalCharge,
			});
		if (updated.length !== 1)
			throw new Error("Credit operation refund conflict");
		return updated[0];
	});
}
