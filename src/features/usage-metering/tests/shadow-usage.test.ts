import { describe, expect, it, vi } from "vitest";
import { SHADOW_USAGE_RETENTION_DAYS } from "@/lib/constants";
import {
	observeProviderUsage,
	observeTiming,
	takeObservation,
} from "../services/shadow-usage-observation";
import {
	buildShadowUsageEvent,
	buildShadowUsageInsert,
} from "../services/shadow-usage-record";
import {
	recordShadowUsage,
	type ShadowUsagePersistence,
} from "../services/shadow-usage-recorder";
import {
	type BenchmarkRecord,
	buildBenchmarkReport,
	percentile,
} from "../services/shadow-usage-report";
import {
	type ShadowCostBreakdown,
	type ShadowUsageInput,
	shadowUsageEventSchema,
} from "../types/shadow-usage";

const unknownCost: ShadowCostBreakdown = {
	status: "unknown" as const,
	currency: null,
	measuredProviderMinor: null,
	estimatedProviderMinor: null,
	estimatedInfrastructureMinor: null,
	unmeasuredComponents: ["provider_pricing", "infrastructure"],
	paidScenario: null,
};

const baseInput: ShadowUsageInput = {
	userId: "user-1",
	productFamily: "studio",
	operationKind: "studio.generate",
	logicalJobId: "job-1",
	attemptIndex: 0,
	retryCount: 0,
	startedAt: new Date("2026-11-23T00:00:00.000Z"),
	finishedAt: new Date("2026-11-23T00:00:05.000Z"),
	outcome: "success",
	requestedUnits: 3,
	completedUnits: 3,
	metrics: {
		requestedFrames: 3,
		generatedFrames: 3,
		measurementScope: "operation",
	},
	providerUsage: null,
	cost: unknownCost,
	priceSource: null,
	pricingVersion: null,
};

describe("shadow usage record contract", () => {
	it("rejects secret-bearing fields before anything is persisted", () => {
		const event = buildShadowUsageEvent(baseInput);
		expect(
			shadowUsageEventSchema.safeParse({
				...event,
				apiKey: "sk-secret",
				authorization: "Bearer secret",
			}).success,
		).toBe(false);
		expect(
			shadowUsageEventSchema.safeParse({
				...event,
				metrics: { ...event.metrics, prompt: "private prompt" },
			}).success,
		).toBe(false);
	});

	it("represents missing provider metrics and unknown cost as null, not zero", () => {
		const event = buildShadowUsageEvent(baseInput);
		expect(event.providerUsage).toBeNull();
		expect(event.cost.measuredProviderMinor).toBeNull();
		expect(event.cost.estimatedProviderMinor).toBeNull();
		expect(event.cost.status).toBe("unknown");
		const row = buildShadowUsageInsert(event, SHADOW_USAGE_RETENTION_DAYS);
		expect(row.cost.measuredProviderMinor).toBeNull();
		expect(row.durationMs).toBe(5000);
	});

	it("keeps attempts distinguishable from logical operations", () => {
		const first = buildShadowUsageInsert(
			buildShadowUsageEvent(baseInput),
			SHADOW_USAGE_RETENTION_DAYS,
		);
		const retry = buildShadowUsageInsert(
			buildShadowUsageEvent({ ...baseInput, attemptIndex: 1, retryCount: 1 }),
			SHADOW_USAGE_RETENTION_DAYS,
		);
		expect(first.dedupeKey).toBe("studio:job-1:0:studio.generate");
		expect(retry.dedupeKey).toBe("studio:job-1:1:studio.generate");
		expect(first.attemptId).toBe("job-1:attempt-0");
		expect(retry.attemptId).toBe("job-1:attempt-1");
		expect(first.logicalJobId).toBe(retry.logicalJobId);
		expect(retry.retryCount).toBe(1);
	});

	it("sets a retention deadline relative to the observation, not wall clock", () => {
		const row = buildShadowUsageInsert(
			buildShadowUsageEvent(baseInput),
			SHADOW_USAGE_RETENTION_DAYS,
		);
		expect(row.expiresAt.getTime() - row.startedAt.getTime()).toBe(
			SHADOW_USAGE_RETENTION_DAYS * 24 * 60 * 60 * 1000,
		);
	});
});

describe("shadow usage recorder", () => {
	it("writes one allowlisted, owner-scoped row without touching credit state", async () => {
		const insert = vi.fn().mockResolvedValue(true);
		const persistence: ShadowUsagePersistence = { insert };
		await expect(recordShadowUsage(baseInput, persistence)).resolves.toBe(true);
		expect(insert).toHaveBeenCalledOnce();
		const row = insert.mock.calls[0]?.[0];
		expect(row?.userId).toBe("user-1");
		expect(row).not.toHaveProperty("apiKey");
		expect(row).not.toHaveProperty("prompt");
		expect(row).not.toHaveProperty("credits");
	});

	it("treats a duplicate delivery as a no-op", async () => {
		const insert = vi.fn().mockResolvedValue(false);
		await expect(recordShadowUsage(baseInput, { insert })).resolves.toBe(false);
		expect(insert).toHaveBeenCalledOnce();
	});

	it("drops hostile fields instead of persisting them", async () => {
		const insert = vi.fn().mockResolvedValue(true);
		const hostile = { ...baseInput, apiKey: "sk-secret" };
		await recordShadowUsage(hostile, { insert });
		const row = insert.mock.calls[0]?.[0];
		expect(row).not.toHaveProperty("apiKey");
		expect(JSON.stringify(row)).not.toContain("sk-secret");
	});

	it("does not break the core operation when telemetry fails", async () => {
		const insert = vi.fn().mockRejectedValue(new Error("db unavailable"));
		const error = vi.spyOn(console, "error").mockImplementation(() => {});
		await expect(recordShadowUsage(baseInput, { insert })).resolves.toBe(false);
		expect(error).toHaveBeenCalled();
		error.mockRestore();
	});
});

describe("in-process usage observation", () => {
	it("aggregates provider usage and timings for one operation and drains once", () => {
		const key = `job-observe-${crypto.randomUUID()}`;
		observeProviderUsage(key, {
			provider: "9router",
			model: "prdfy-combo",
			inputTokens: 10,
			outputTokens: 5,
			providerRetries: 1,
			finishReason: "stop",
		});
		observeProviderUsage(key, {
			provider: "9router",
			model: "prdfy-combo",
			inputTokens: 20,
			outputTokens: 7,
			providerFallbacks: 1,
		});
		observeTiming(key, "navigation", 120);
		observeTiming(key, "navigation", 80);

		const observed = takeObservation(key);
		expect(observed?.providerUsage?.inputTokens).toBe(30);
		expect(observed?.providerUsage?.outputTokens).toBe(12);
		expect(observed?.providerUsage?.providerRetries).toBe(1);
		expect(observed?.providerUsage?.providerFallbacks).toBe(1);
		expect(observed?.timings.navigation).toBe(200);
		expect(takeObservation(key)).toBeNull();
	});
});

describe("benchmark report", () => {
	it("does not fabricate p95 from an inadequate sample", () => {
		expect(percentile([1, 2, 3], 0.95)).toBeNull();
		const records: BenchmarkRecord[] = [100, 200, 300, 400, 2200].map(
			(durationMs, index) => ({
				operationKind: "studio.generate",
				outcome: index === 4 ? "failed" : "success",
				durationMs,
				retryCount: index === 4 ? 1 : 0,
				completedUnits: index === 4 ? 0 : 1,
				requestedUnits: 1,
				cost: unknownCost,
				providerUsage: null,
				metrics: { measurementScope: "operation" },
			}),
		);
		const [group] = buildBenchmarkReport(records);
		expect(group?.sampleCount).toBe(5);
		expect(group?.medianDurationMs).toBe(300);
		expect(group?.p95DurationMs).toBeNull();
		expect(group?.successRate).toBe(0.8);
		expect(group?.failureRate).toBe(0.2);
		expect(group?.costPerCompletedUnitMinor).toBeNull();
		expect(group?.unknownCostComponents).toContain("provider_pricing");
		expect(group?.retryCount).toBe(1);
	});

	it("computes p95, cost per unit and failed-attempt cost from measured data", () => {
		const measured = {
			...unknownCost,
			status: "measured" as const,
			currency: "IDR",
			measuredProviderMinor: 100,
			unmeasuredComponents: [],
		};
		const records: BenchmarkRecord[] = Array.from({ length: 20 }, (_, i) => ({
			operationKind: "scrape.crawl",
			outcome: i === 19 ? "failed" : "success",
			durationMs: i + 1,
			retryCount: i === 19 ? 2 : 0,
			completedUnits: i === 19 ? 0 : 2,
			requestedUnits: 2,
			cost: measured,
			providerUsage: null,
			metrics: { processedPages: 2, measurementScope: "operation" },
		}));
		const [group] = buildBenchmarkReport(records);
		expect(group?.sampleCount).toBe(20);
		expect(group?.p95DurationMs).not.toBeNull();
		expect(group?.costPerCompletedUnitMinor).toBe(2000 / 38);
		expect(group?.failedAttemptCostMinor).toBe(100);
		expect(group?.retryCostMinor).toBe(100);
		expect(group?.unknownCostComponents).toEqual([]);
	});
});
