import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	outcomeForStatus,
	scrapeOperationKindForMode,
} from "@/features/scrape/services/scrape-usage-metering";
import type { StudioUsageJobFields } from "@/features/studio/services/studio-usage-metering";
import {
	finalizeStudioUsage,
	studioOperationKindForJob,
} from "@/features/studio/services/studio-usage-metering";
import type {
	ShadowObservation,
	ShadowUsageInput,
} from "@/features/usage-metering/types/shadow-usage";

const mocks = vi.hoisted(() => ({
	record: vi.fn(async (_input: ShadowUsageInput): Promise<boolean> => true),
	take: vi.fn((): ShadowObservation | null => null),
}));

vi.mock("@/features/usage-metering/services/shadow-usage-recorder", () => ({
	recordShadowUsage: mocks.record,
}));
vi.mock("@/features/usage-metering/services/shadow-usage-observation", () => ({
	takeObservation: mocks.take,
}));
vi.mock("@/db", () => ({ db: {} }));

const job: StudioUsageJobFields = {
	id: "studio-job-1",
	userId: "user-1",
	jobType: "revise",
	attempts: 3,
	startedAt: new Date("2026-11-23T00:00:00.000Z"),
	createdAt: new Date("2026-11-22T23:59:00.000Z"),
};

describe("operation path mapping", () => {
	it("maps every Studio job type to a distinct operation kind", () => {
		expect(studioOperationKindForJob("initial")).toBe("studio.generate");
		expect(studioOperationKindForJob("add")).toBe("studio.add_frame");
		expect(studioOperationKindForJob("revise")).toBe("studio.revise");
		expect(studioOperationKindForJob("retry")).toBe("studio.regenerate");
		expect(studioOperationKindForJob("unknown")).toBe("studio.generate");
	});

	it("maps every Scrape mode to a distinct operation kind", () => {
		expect(scrapeOperationKindForMode("crawl")).toBe("scrape.crawl");
		expect(scrapeOperationKindForMode("html")).toBe("scrape.html");
		expect(scrapeOperationKindForMode("images")).toBe("scrape.images");
		expect(scrapeOperationKindForMode("design")).toBe("scrape.design_md");
	});

	it("derives partial, success and failed outcomes from persisted facts", () => {
		expect(
			outcomeForStatus(
				{
					status: "completed",
					mode: "crawl",
					metadata: { completedPages: 2 },
				},
				10,
			),
		).toBe("partial");
		expect(
			outcomeForStatus(
				{
					status: "completed",
					mode: "crawl",
					metadata: { completedPages: 10 },
				},
				10,
			),
		).toBe("success");
		expect(
			outcomeForStatus(
				{ status: "failed", mode: "design", metadata: {} },
				null,
			),
		).toBe("failed");
	});
});

describe("studio finalizer", () => {
	beforeEach(() => {
		mocks.record.mockClear();
		mocks.take.mockClear();
		mocks.take.mockReturnValue(null);
	});

	it("records one partial attempt with provider retries in the retry count", async () => {
		mocks.take.mockReturnValue({
			providerUsage: {
				provider: "9router",
				model: "prdfy-combo",
				inputTokens: 100,
				outputTokens: 50,
				cachedTokens: 0,
				textTokens: 50,
				reasoningTokens: 0,
				providerRetries: 2,
				providerFallbacks: 1,
				finishReason: "stop",
			},
			timings: {},
		});
		await finalizeStudioUsage({
			job,
			outcome: "partial",
			requestedFrames: 5,
			completedFrames: 4,
			artifactBytes: 2048,
		});
		expect(mocks.record).toHaveBeenCalledOnce();
		const input = mocks.record.mock.calls[0]?.[0];
		expect(input).toMatchObject({
			userId: "user-1",
			productFamily: "studio",
			operationKind: "studio.revise",
			logicalJobId: "studio-job-1",
			attemptIndex: 3,
			retryCount: 4,
			outcome: "partial",
			requestedUnits: 5,
			completedUnits: 4,
		});
		expect(input?.metrics).toMatchObject({
			revisedFrames: 4,
			generatedFrames: 4,
			artifactBytes: 2048,
			measurementScope: "operation",
		});
		expect(input?.providerUsage?.providerRetries).toBe(2);
	});

	it("keeps missing provider metrics unknown instead of zero", async () => {
		await finalizeStudioUsage({
			job,
			outcome: "failed",
			requestedFrames: 3,
			completedFrames: 0,
		});
		const input = mocks.record.mock.calls[0]?.[0];
		expect(input?.providerUsage).toBeNull();
		expect(input?.cost).toMatchObject({
			status: "unknown",
			measuredProviderMinor: null,
			estimatedProviderMinor: null,
			estimatedInfrastructureMinor: null,
		});
		expect(input?.cost.unmeasuredComponents).toContain("provider_pricing");
		expect(Object.keys(input ?? {})).not.toContain("creditOperationId");
		expect(Object.keys(input ?? {})).not.toContain("trialConsumed");
	});
});
