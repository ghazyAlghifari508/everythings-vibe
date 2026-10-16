import { and, eq, sql } from "drizzle-orm";
import { getDatabase } from "@/features/billing/services/credit-db";
import { releaseCreditOperation } from "@/features/billing/services/credit-release";
import type { CreditOperationResult } from "@/features/billing/types/credit-contracts";
import { CreditSubscriptionOriginError } from "@/features/billing/types/credit-contracts";

export async function quarantineCreditOperation(input: {
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
		if (operation.subscriptionId) {
			const [subscription] = await tx
				.select({ id: schema.subscriptions.id })
				.from(schema.subscriptions)
				.where(
					and(
						eq(schema.subscriptions.id, operation.subscriptionId),
						eq(schema.subscriptions.userId, input.userId),
					),
				)
				.for("update")
				.limit(1);
			if (subscription) {
				await tx
					.update(schema.subscriptions)
					.set({
						creditsReserved: sql`${schema.subscriptions.creditsReserved} - ${operation.reservedCredits}`,
						updatedAt: new Date(),
					})
					.where(eq(schema.subscriptions.id, subscription.id));
			}
		}
		if (operation.reservedCredits > 0)
			await tx.insert(schema.creditLedgerEntries).values({
				id: crypto.randomUUID(),
				userId: input.userId,
				operationId: operation.id,
				amount: operation.reservedCredits,
				entryType: "correction",
				sourceCategory: "manual_correction",
				pricingVersion: operation.pricingVersion,
				metadata: {
					reason: input.reason,
					reconciliationCode: "subscription_origin_unresolvable",
					accounting: "manual_correction_required",
				},
			});
		const [updated] = await tx
			.update(schema.creditOperations)
			.set({
				state: "quarantined",
				reservedCredits: 0,
				reconciliation: {
					status: "resolved",
					code: "subscription_origin_unresolvable",
					accounting: "manual_correction_required",
					resolvedAt: new Date().toISOString(),
				},
				failure: {
					message: input.reason,
					occurredAt: new Date().toISOString(),
				},
				updatedAt: new Date(),
			})
			.where(
				and(
					eq(schema.creditOperations.id, operation.id),
					eq(schema.creditOperations.userId, input.userId),
				),
			)
			.returning({
				id: schema.creditOperations.id,
				state: schema.creditOperations.state,
				finalCharge: schema.creditOperations.finalCharge,
			});
		if (!updated) throw new Error("Credit operation quarantine conflict");
		return updated;
	});
}

export async function reconcileExpiredCreditOperations(input: {
	userId: string;
	now?: Date;
}): Promise<{ releasedOperationIds: string[] }> {
	const { db, schema } = await getDatabase();
	const nowValue = input.now ?? new Date();
	const claimed = await db.transaction(async (tx) => {
		const settling = await tx
			.select({ id: schema.creditOperations.id })
			.from(schema.creditOperations)
			.where(
				and(
					eq(schema.creditOperations.userId, input.userId),
					sql`${schema.creditOperations.expiresAt} <= ${nowValue}`,
					eq(schema.creditOperations.state, "settling"),
				),
			)
			.for("update");
		const newlyClaimed = await tx
			.update(schema.creditOperations)
			.set({ state: "settling", updatedAt: nowValue })
			.where(
				and(
					eq(schema.creditOperations.userId, input.userId),
					sql`${schema.creditOperations.expiresAt} <= ${nowValue}`,
					sql`${schema.creditOperations.state} IN ('reserved', 'running')`,
				),
			)
			.returning({ id: schema.creditOperations.id });
		return [...settling, ...newlyClaimed];
	});
	const releasedOperationIds: string[] = [];
	for (const operation of claimed) {
		try {
			const result = await releaseCreditOperation({
				userId: input.userId,
				operationId: operation.id,
				reason: "operation expired",
			});
			if (result.state === "released") releasedOperationIds.push(operation.id);
		} catch (error) {
			if (error instanceof CreditSubscriptionOriginError) {
				await quarantineCreditOperation({
					userId: input.userId,
					operationId: operation.id,
					reason: "subscription origin is permanently unresolvable",
				});
			}
			// Other failures remain in settling for a later retry.
		}
	}
	return { releasedOperationIds };
}
