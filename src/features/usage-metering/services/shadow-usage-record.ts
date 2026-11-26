import type { InsertShadowUsageRow } from "@/db/schema";
import { SHADOW_USAGE_RETENTION_DAYS } from "@/lib/constants";
import {
	type ShadowUsageEvent,
	type ShadowUsageInput,
	shadowUsageEventSchema,
} from "../types/shadow-usage";

/**
 * Build a validated event from caller facts. Strict parsing is the redaction
 * boundary: any extra key (prompt, header, key, HTML) fails closed instead of
 * being persisted by accident.
 */
export function buildShadowUsageEvent(
	input: ShadowUsageInput,
): ShadowUsageEvent {
	const durationMs =
		input.finishedAt === null
			? null
			: Math.max(0, input.finishedAt.getTime() - input.startedAt.getTime());
	return shadowUsageEventSchema.parse({
		userId: input.userId,
		productFamily: input.productFamily,
		operationKind: input.operationKind,
		logicalJobId: input.logicalJobId,
		attemptId: `${input.logicalJobId}:attempt-${input.attemptIndex}`,
		attemptIndex: input.attemptIndex,
		retryCount: input.retryCount,
		startedAt: input.startedAt,
		finishedAt: input.finishedAt,
		durationMs,
		outcome: input.outcome,
		requestedUnits: input.requestedUnits,
		completedUnits: input.completedUnits,
		resourceLimits: input.resourceLimits ?? {},
		metrics: input.metrics,
		providerUsage: input.providerUsage,
		cost: input.cost,
		priceSource: input.priceSource ?? null,
		pricingVersion: input.pricingVersion ?? null,
	});
}

/**
 * Explicit column mapping. Never spread the validated object: an allowlisted
 * projection keeps future schema additions out of telemetry by default.
 */
export function buildShadowUsageInsert(
	event: ShadowUsageEvent,
	retentionDays: number = SHADOW_USAGE_RETENTION_DAYS,
): InsertShadowUsageRow {
	return {
		userId: event.userId,
		productFamily: event.productFamily,
		operationKind: event.operationKind,
		logicalJobId: event.logicalJobId,
		attemptId: event.attemptId,
		attemptIndex: event.attemptIndex,
		retryCount: event.retryCount,
		startedAt: event.startedAt,
		finishedAt: event.finishedAt,
		durationMs: event.durationMs,
		outcome: event.outcome,
		requestedUnits: event.requestedUnits,
		completedUnits: event.completedUnits,
		resourceLimits: event.resourceLimits,
		metrics: event.metrics,
		providerUsage: event.providerUsage,
		cost: event.cost,
		priceSource: event.priceSource,
		pricingVersion: event.pricingVersion,
		dedupeKey: `${event.productFamily}:${event.logicalJobId}:${event.attemptIndex}:${event.operationKind}`,
		expiresAt: new Date(
			event.startedAt.getTime() + retentionDays * 24 * 60 * 60 * 1000,
		),
	};
}
