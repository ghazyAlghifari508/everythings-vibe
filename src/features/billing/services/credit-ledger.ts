import { and, eq } from "drizzle-orm";
import { getDatabase } from "@/features/billing/services/credit-db";
import type { CreditOperationResult } from "@/features/billing/types/credit-contracts";

export async function getCreditOperation(input: {
	userId: string;
	operationId: string;
}): Promise<CreditOperationResult> {
	const { db, schema } = await getDatabase();
	const [operation] = await db
		.select({
			id: schema.creditOperations.id,
			state: schema.creditOperations.state,
			finalCharge: schema.creditOperations.finalCharge,
		})
		.from(schema.creditOperations)
		.where(
			and(
				eq(schema.creditOperations.id, input.operationId),
				eq(schema.creditOperations.userId, input.userId),
			),
		)
		.limit(1);
	if (!operation) throw new Error("Credit operation ownership mismatch");
	return operation;
}
