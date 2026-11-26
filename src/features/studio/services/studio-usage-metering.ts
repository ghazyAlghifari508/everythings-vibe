import type { StudioJobRow } from "@/db/schema";
import { takeObservation } from "@/features/usage-metering/services/shadow-usage-observation";
import { recordShadowUsage } from "@/features/usage-metering/services/shadow-usage-recorder";
import {
	type ShadowOutcome,
	type ShadowUsageInput,
	unknownCostBreakdown,
} from "@/features/usage-metering/types/shadow-usage";
export type StudioUsageJobFields = Pick<
	StudioJobRow,
	"id" | "userId" | "jobType" | "attempts" | "startedAt" | "createdAt"
>;

/** Mirrors the credit operation registry kinds without importing its runtime. */
export function studioOperationKindForJob(
	jobType: string,
): Extract<ShadowUsageInput["operationKind"], string> {
	switch (jobType) {
		case "add":
			return "studio.add_frame";
		case "revise":
			return "studio.revise";
		case "retry":
			return "studio.regenerate";
		default:
			return "studio.generate";
	}
}

export interface FinalizeStudioUsageInput {
	job: StudioUsageJobFields;
	outcome: ShadowOutcome;
	requestedFrames: number | null;
	completedFrames: number;
	artifactBytes?: number | null;
	finishedAt?: Date;
}

/**
 * Records one attempt at the worker boundary. Observation is best-effort: a
 * failure here never changes the job result and never touches credits.
 */
export async function finalizeStudioUsage(
	input: FinalizeStudioUsageInput,
): Promise<void> {
	const observation = takeObservation(input.job.id);
	const providerRetries = observation?.providerUsage?.providerRetries ?? 0;
	await recordShadowUsage({
		userId: input.job.userId,
		productFamily: "studio",
		operationKind: studioOperationKindForJob(input.job.jobType),
		logicalJobId: input.job.id,
		attemptIndex: Math.max(1, input.job.attempts),
		retryCount: Math.max(0, input.job.attempts - 1) + providerRetries,
		startedAt: input.job.startedAt ?? input.job.createdAt,
		finishedAt: input.finishedAt ?? new Date(),
		outcome: input.outcome,
		requestedUnits: input.requestedFrames,
		completedUnits: input.completedFrames,
		metrics: {
			requestedFrames: input.requestedFrames,
			generatedFrames:
				input.outcome === "success" || input.outcome === "partial"
					? input.completedFrames
					: null,
			revisedFrames:
				input.job.jobType === "revise" ? input.completedFrames : null,
			artifactBytes: input.artifactBytes ?? null,
			measurementScope: "operation",
		},
		providerUsage: observation?.providerUsage ?? null,
		// No verified tariff or provider price feed exists yet. Unknown stays
		// null so it can never be mistaken for a measured zero.
		cost: unknownCostBreakdown(),
		priceSource: null,
		pricingVersion: null,
	});
}
