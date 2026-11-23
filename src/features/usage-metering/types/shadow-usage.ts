import { z } from "zod";
import type {
	ScrapeOperationKind,
	StudioOperationKind,
} from "@/features/billing/services/credit-operation-registry";

export const SHADOW_PRODUCT_FAMILIES = ["studio", "scrape"] as const;
export type ShadowProductFamily = (typeof SHADOW_PRODUCT_FAMILIES)[number];
export type ShadowOperationKind = StudioOperationKind | ScrapeOperationKind;

/** A final result, not an in-flight state. Unknown is explicit, never zero. */
export const SHADOW_OUTCOMES = [
	"success",
	"partial",
	"failed",
	"cancelled",
	"unknown",
] as const;
export type ShadowOutcome = (typeof SHADOW_OUTCOMES)[number];

export const SHADOW_COST_STATUSES = [
	"unknown",
	"measured",
	"estimated_provider",
	"estimated_infrastructure",
	"mixed",
] as const;
export type ShadowCostStatus = (typeof SHADOW_COST_STATUSES)[number];

export const SHADOW_UNMEASURED_COMPONENTS = [
	"provider_pricing",
	"provider_usage",
	"infrastructure",
	"cpu",
	"ram",
	"storage",
	"bandwidth",
	"browser_runtime",
	"other",
] as const;

/**
 * A separately labelled scenario. Never an incurred expense. The effective
 * date and source must be verifiable before one may be attached.
 */
export const shadowPaidScenarioSchema = z.strictObject({
	label: z.string().min(1).max(120),
	costMinor: z.number().nonnegative(),
	currency: z.string().length(3),
	priceSource: z.string().min(1).max(160),
	effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

/**
 * Cost components live side by side. A null amount means unknown, which is
 * deliberately different from a measured zero (a free/promotional provider).
 */
export const shadowCostBreakdownSchema = z.strictObject({
	status: z.enum(SHADOW_COST_STATUSES),
	currency: z.string().length(3).nullable(),
	measuredProviderMinor: z.number().nonnegative().nullable(),
	estimatedProviderMinor: z.number().nonnegative().nullable(),
	estimatedInfrastructureMinor: z.number().nonnegative().nullable(),
	unmeasuredComponents: z
		.array(z.enum(SHADOW_UNMEASURED_COMPONENTS))
		.max(SHADOW_UNMEASURED_COMPONENTS.length),
	paidScenario: shadowPaidScenarioSchema.nullable(),
});

const tokenCount = z.number().int().nonnegative().nullable().default(null);

export const shadowProviderUsageSchema = z.strictObject({
	provider: z.string().min(1).max(64),
	model: z.string().min(1).max(128),
	inputTokens: tokenCount,
	outputTokens: tokenCount,
	cachedTokens: tokenCount,
	textTokens: tokenCount,
	reasoningTokens: tokenCount,
	providerRetries: tokenCount,
	providerFallbacks: tokenCount,
	finishReason: z.string().max(64).nullable().default(null),
});

/**
 * Only numeric/allowlisted facts. No prompt text, HTML, URLs with query
 * secrets, headers, API keys, or generated artifacts can enter this shape.
 */
export const shadowDesignExtractionSchema = z.strictObject({
	depth: z.string().max(24).nullable().default(null),
	settingsKeys: z.array(z.string().max(40)).max(20).default([]),
});

export const shadowResourceMetricsSchema = z.strictObject({
	requestedFrames: tokenCount,
	generatedFrames: tokenCount,
	revisedFrames: tokenCount,
	artifactBytes: tokenCount,
	requestedPages: tokenCount,
	processedPages: tokenCount,
	browserRuntimeMs: tokenCount,
	extractedImages: tokenCount,
	downloadedBytes: tokenCount,
	outputBytes: tokenCount,
	designExtraction: shadowDesignExtractionSchema.nullable().default(null),
	// Whole-process samples are labelled as shared, never attributed to one job.
	processRssBytes: tokenCount,
	processCpuMs: z.number().nonnegative().nullable().default(null),
	measurementScope: z
		.enum(["operation", "process_shared"])
		.default("operation"),
});

export const shadowUsageEventSchema = z.strictObject({
	userId: z.string().min(1).max(256),
	productFamily: z.enum(SHADOW_PRODUCT_FAMILIES),
	operationKind: z.string().min(1).max(80),
	logicalJobId: z.string().min(1).max(256),
	/** Stable attempt identity; distinct from the logical job id. */
	attemptId: z.string().min(1).max(320),
	attemptIndex: z.number().int().nonnegative(),
	retryCount: z.number().int().nonnegative(),
	startedAt: z.coerce.date(),
	finishedAt: z.coerce.date().nullable(),
	durationMs: z.number().int().nonnegative().nullable(),
	outcome: z.enum(SHADOW_OUTCOMES),
	requestedUnits: z.number().int().nonnegative().nullable(),
	completedUnits: z.number().int().nonnegative(),
	resourceLimits: z
		.record(z.string().max(60), z.number().nonnegative())
		.default({}),
	metrics: shadowResourceMetricsSchema,
	providerUsage: shadowProviderUsageSchema.nullable(),
	cost: shadowCostBreakdownSchema,
	priceSource: z.string().max(160).nullable(),
	pricingVersion: z.string().max(80).nullable(),
});

export type ShadowCostBreakdown = z.infer<typeof shadowCostBreakdownSchema>;
export type ShadowCostBreakdownInput = z.input<
	typeof shadowCostBreakdownSchema
>;
export type ShadowProviderUsage = z.infer<typeof shadowProviderUsageSchema>;
export type ShadowProviderUsageInput = z.input<
	typeof shadowProviderUsageSchema
>;
export type ShadowResourceMetrics = z.infer<typeof shadowResourceMetricsSchema>;
export type ShadowResourceMetricsInput = z.input<
	typeof shadowResourceMetricsSchema
>;
export type ShadowUsageEvent = z.infer<typeof shadowUsageEventSchema>;

export interface ShadowUsageInput {
	userId: string;
	productFamily: ShadowProductFamily;
	operationKind: ShadowOperationKind | string;
	logicalJobId: string;
	attemptIndex: number;
	retryCount: number;
	startedAt: Date;
	finishedAt: Date | null;
	outcome: ShadowOutcome;
	requestedUnits: number | null;
	completedUnits: number;
	resourceLimits?: Record<string, number>;
	metrics: ShadowResourceMetricsInput;
	providerUsage: ShadowProviderUsageInput | null;
	cost: ShadowCostBreakdownInput;
	priceSource?: string | null;
	pricingVersion?: string | null;
}

/** In-process observation passed up from an existing telemetry call site. */
export interface ProviderObservation {
	provider?: string;
	model?: string;
	inputTokens?: number;
	outputTokens?: number;
	cachedTokens?: number;
	textTokens?: number;
	reasoningTokens?: number;
	providerRetries?: number;
	providerFallbacks?: number;
	finishReason?: string;
}

export interface ShadowObservation {
	providerUsage: ShadowProviderUsage | null;
	timings: Record<string, number>;
}

export function unknownCostBreakdown(): ShadowCostBreakdownInput {
	return {
		status: "unknown",
		currency: null,
		measuredProviderMinor: null,
		estimatedProviderMinor: null,
		estimatedInfrastructureMinor: null,
		unmeasuredComponents: ["provider_pricing", "infrastructure"],
		paidScenario: null,
	};
}
