import { and, eq } from "drizzle-orm";
import { productTrials } from "@/db/schema";
import type { CreditTransaction } from "./credit-db";

export async function settleProductTrial(
	tx: CreditTransaction,
	product: typeof productTrials.$inferSelect.product,
	userId: string,
	jobId: string,
	completedUnits: number,
) {
	await tx
		.update(productTrials)
		.set({
			state: completedUnits > 0 ? "consumed" : "released",
			completedUnits,
			closedAt: new Date(),
		})
		.where(
			and(
				eq(productTrials.userId, userId),
				eq(productTrials.product, product),
				eq(productTrials.jobId, jobId),
				eq(productTrials.state, "reserved"),
			),
		);
}
