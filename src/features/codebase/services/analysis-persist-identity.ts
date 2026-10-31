import { eq } from "drizzle-orm";
import { db } from "@/db";
import { creditOperations } from "@/db/schema";

export interface PersistCreditIdentity {
	creditOperationId?: string;
	operationState?: string;
	operationExpiresAt?: string;
}

// Best-effort post-mortem credit identity for the failure log. Read-only,
// never throws: the failed status write in the caller stays authoritative.
// Correlates via the analysis reference the reservation was minted with
// (analysisReference = analysisId), never by guessing across users.
export async function readPersistCreditIdentity(
	analysisId: string,
): Promise<PersistCreditIdentity> {
	try {
		const [operation] = await db
			.select({
				operationId: creditOperations.id,
				state: creditOperations.state,
				expiresAt: creditOperations.expiresAt,
			})
			.from(creditOperations)
			.where(eq(creditOperations.analysisReference, analysisId))
			.limit(1);
		return {
			creditOperationId: operation?.operationId,
			operationState: operation?.state ?? undefined,
			operationExpiresAt: operation?.expiresAt?.toISOString() ?? undefined,
		};
	} catch {
		return {};
	}
}
