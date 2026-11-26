import { SHADOW_USAGE_P95_MIN_SAMPLES } from "@/lib/constants";
import type {
	ShadowCostBreakdown,
	ShadowOutcome,
	ShadowProviderUsage,
	ShadowResourceMetricsInput,
} from "../types/shadow-usage";

export interface BenchmarkRecord {
	operationKind: string;
	outcome: ShadowOutcome;
	durationMs: number | null;
	retryCount: number;
	completedUnits: number;
	requestedUnits: number | null;
	cost: ShadowCostBreakdown;
	providerUsage: ShadowProviderUsage | null;
	metrics: ShadowResourceMetricsInput;
}

export interface BenchmarkGroup {
	operationKind: string;
	sampleCount: number;
	medianDurationMs: number | null;
	retryCount: number;
	p95DurationMs: number | null;
	p95UnavailableReason: string | null;
	minDurationMs: number | null;
	maxDurationMs: number | null;
	successRate: number;
	partialRate: number;
	failureRate: number;
	cancelledRate: number;
	unknownRate: number;
	averageCompletedUnits: number;
	averageRequestedUnits: number | null;
	averageProcessedPages: number | null;
	averageBrowserRuntimeMs: number | null;
	averageInputTokens: number | null;
	averageOutputTokens: number | null;
	averageCachedTokens: number | null;
	measuredProviderCostMinor: number | null;
	estimatedProviderCostMinor: number | null;
	estimatedInfrastructureCostMinor: number | null;
	costPerCompletedUnitMinor: number | null;
	failedAttemptCostMinor: number | null;
	retryCostMinor: number | null;
	unknownCostComponents: string[];
}

function average(values: readonly number[]): number | null {
	return values.length === 0
		? null
		: values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function median(values: readonly number[]): number | null {
	if (values.length === 0) return null;
	const sorted = [...values].sort((a, b) => a - b);
	const middle = Math.floor(sorted.length / 2);
	return sorted.length % 2 === 0
		? (sorted[middle - 1] + sorted[middle]) / 2
		: sorted[middle];
}

/**
 * Linear-interpolated percentile. Returns null below the sample threshold:
 * a p95 from five samples is a fabrication, not a measurement.
 */
export function percentile(
	values: readonly number[],
	fraction: number,
): number | null {
	if (values.length < SHADOW_USAGE_P95_MIN_SAMPLES) return null;
	if (fraction <= 0 || fraction >= 1 || values.length === 0) return null;
	const sorted = [...values].sort((a, b) => a - b);
	const rank = (sorted.length - 1) * fraction;
	const low = Math.floor(rank);
	const high = Math.ceil(rank);
	return sorted[low] + (sorted[high] - sorted[low]) * (rank - low);
}

function measuredAmount(value: number | null): number {
	return value ?? 0;
}

function buildGroup(
	operationKind: string,
	records: readonly BenchmarkRecord[],
): BenchmarkGroup {
	const count = records.length;
	const durations = records
		.map((record) => record.durationMs)
		.filter((value): value is number => value !== null);
	const rate = (outcome: ShadowOutcome) =>
		count === 0
			? 0
			: records.filter((record) => record.outcome === outcome).length / count;
	const knownCosts = records.filter(
		(record) =>
			record.cost.measuredProviderMinor !== null ||
			record.cost.estimatedProviderMinor !== null ||
			record.cost.estimatedInfrastructureMinor !== null,
	);
	const totalKnownCost = knownCosts.reduce(
		(sum, record) =>
			sum +
			measuredAmount(record.cost.measuredProviderMinor) +
			measuredAmount(record.cost.estimatedProviderMinor) +
			measuredAmount(record.cost.estimatedInfrastructureMinor),
		0,
	);
	const completedUnits = records.reduce(
		(sum, record) => sum + record.completedUnits,
		0,
	);
	const costOf = (predicate: (record: BenchmarkRecord) => boolean) =>
		knownCosts.filter(predicate).length === 0
			? null
			: knownCosts
					.filter(predicate)
					.reduce(
						(sum, record) =>
							sum +
							measuredAmount(record.cost.measuredProviderMinor) +
							measuredAmount(record.cost.estimatedProviderMinor) +
							measuredAmount(record.cost.estimatedInfrastructureMinor),
						0,
					);
	const unknownCostComponents = [
		...new Set(records.flatMap((record) => record.cost.unmeasuredComponents)),
	].sort();

	return {
		operationKind,
		sampleCount: count,
		retryCount: records.reduce((sum, record) => sum + record.retryCount, 0),
		medianDurationMs: median(durations),
		p95DurationMs: percentile(durations, 0.95),
		p95UnavailableReason:
			durations.length < SHADOW_USAGE_P95_MIN_SAMPLES
				? `p95 requires at least ${SHADOW_USAGE_P95_MIN_SAMPLES} duration samples`
				: null,
		minDurationMs: durations.length === 0 ? null : Math.min(...durations),
		maxDurationMs: durations.length === 0 ? null : Math.max(...durations),
		successRate: rate("success"),
		partialRate: rate("partial"),
		failureRate: rate("failed"),
		cancelledRate: rate("cancelled"),
		unknownRate: rate("unknown"),
		averageCompletedUnits: average(records.map((r) => r.completedUnits)) ?? 0,
		averageRequestedUnits: average(
			records
				.map((r) => r.requestedUnits)
				.filter((value): value is number => value !== null),
		),
		averageProcessedPages: average(
			records
				.map((r) => r.metrics.processedPages)
				.filter((value): value is number => value != null),
		),
		averageBrowserRuntimeMs: average(
			records
				.map((r) => r.metrics.browserRuntimeMs)
				.filter((value): value is number => value != null),
		),
		averageInputTokens: average(
			records
				.map((r) => r.providerUsage?.inputTokens)
				.filter((value): value is number => value != null),
		),
		averageOutputTokens: average(
			records
				.map((r) => r.providerUsage?.outputTokens)
				.filter((value): value is number => value != null),
		),
		averageCachedTokens: average(
			records
				.map((r) => r.providerUsage?.cachedTokens)
				.filter((value): value is number => value != null),
		),
		measuredProviderCostMinor:
			knownCosts.length === 0
				? null
				: knownCosts.reduce(
						(sum, record) =>
							sum + measuredAmount(record.cost.measuredProviderMinor),
						0,
					),
		estimatedProviderCostMinor:
			knownCosts.length === 0
				? null
				: knownCosts.reduce(
						(sum, record) =>
							sum + measuredAmount(record.cost.estimatedProviderMinor),
						0,
					),
		estimatedInfrastructureCostMinor:
			knownCosts.length === 0
				? null
				: knownCosts.reduce(
						(sum, record) =>
							sum + measuredAmount(record.cost.estimatedInfrastructureMinor),
						0,
					),
		costPerCompletedUnitMinor:
			knownCosts.length === 0 || completedUnits === 0
				? null
				: totalKnownCost / completedUnits,
		failedAttemptCostMinor: costOf(
			(record) => record.outcome === "failed" || record.outcome === "cancelled",
		),
		retryCostMinor: costOf((record) => record.retryCount > 0),
		unknownCostComponents,
	};
}

/** Groups records by operation kind; retries stay separate rows. */
export function buildBenchmarkReport(
	records: readonly BenchmarkRecord[],
): BenchmarkGroup[] {
	const byKind = new Map<string, BenchmarkRecord[]>();
	for (const record of records) {
		const group = byKind.get(record.operationKind) ?? [];
		group.push(record);
		byKind.set(record.operationKind, group);
	}
	return [...byKind.entries()]
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([operationKind, group]) => buildGroup(operationKind, group));
}
