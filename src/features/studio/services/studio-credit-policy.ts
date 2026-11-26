import type { CreditComplexityMetrics } from "@/features/billing/services/adaptive-credit";
import type { CreditOperationKind } from "@/features/billing/services/credit-operation-registry";
import {
	calculateTariffSettlement,
	quoteTariff,
	TariffNotConfiguredError,
} from "@/features/billing/services/pricing-policy";
import type {
	TariffOutcome,
	TariffQuote,
	TariffRegistry,
} from "@/features/billing/services/pricing-policy-types";

export type StudioOperationKind = Extract<
	CreditOperationKind,
	`studio.${string}`
>;

export const STUDIO_CREDIT_QUOTE_TTL_MS = 5 * 60 * 1000;
export const STUDIO_CREDIT_ROLLOUT_ENV = "STUDIO_CREDIT_CHARGING_ENABLED";

export interface StudioQuoteScope {
	operation: StudioOperationKind;
	/** Frames the server will actually attempt. */
	frames: number;
	promptChars: number;
	designMdChars?: number;
}

export interface StudioQuote {
	operation: StudioOperationKind;
	version: string;
	estimatedCredits: number;
	maximumCredits: number;
	scope: StudioQuoteScope;
	quotedAt: string;
	expiresAt: string;
}
export interface StudioQuoteView {
	quote: StudioQuote | null;
	label: string | null;
	state:
		| "legacy"
		| "trial_available"
		| "paid"
		| "insufficient"
		| "plan_gated"
		| "billing_exempt";
	availableCredits: number;
	requiredCredits: number | null;
}

/**
 * The registry maps the worker's `retry` job type to `studio.regenerate`.
 * Automatic recovery does not create a new credit operation because it keeps
 * the same job id; an explicit regenerate reserves a fresh operation.
 */
export function studioOperationForJob(
	jobType: "initial" | "add" | "revise" | "retry",
): StudioOperationKind {
	switch (jobType) {
		case "initial":
			return "studio.generate";
		case "add":
			return "studio.add_frame";
		case "revise":
			return "studio.revise";
		case "retry":
			return "studio.regenerate";
	}
}

export function studioMetricsForScope(
	scope: StudioQuoteScope,
): CreditComplexityMetrics {
	return {
		studio: {
			frames: scope.frames,
			promptChars: scope.promptChars,
			designMdChars: scope.designMdChars ?? 0,
		},
	};
}

/** Returns null instead of inventing a price while tariffs are unconfigured. */
export function createStudioQuote(
	registry: TariffRegistry,
	scope: StudioQuoteScope,
	now = new Date(),
): StudioQuote | null {
	let quote: TariffQuote | undefined;
	try {
		quote = quoteTariff(registry, {
			operation: scope.operation,
			requestedUnits: { frame: scope.frames },
		});
	} catch (error) {
		if (error instanceof TariffNotConfiguredError) return null;
		throw error;
	}
	return {
		operation: scope.operation,
		version: quote.version,
		estimatedCredits: quote.estimatedCredits,
		maximumCredits: quote.maximumCredits,
		scope,
		quotedAt: now.toISOString(),
		expiresAt: new Date(
			now.getTime() + STUDIO_CREDIT_QUOTE_TTL_MS,
		).toISOString(),
	};
}

export function isStudioQuoteFresh(
	quote: StudioQuote,
	now = new Date(),
): boolean {
	return Date.parse(quote.expiresAt) > now.getTime();
}

/** Settles against the pinned version, capped by the quote's authorized max. */
export function studioChargeForOutcome(
	registry: TariffRegistry,
	quote: Pick<StudioQuote, "operation" | "version" | "maximumCredits">,
	input: { outcome: TariffOutcome; completedFrames: number },
): number {
	return calculateTariffSettlement(registry, {
		operation: quote.operation,
		version: quote.version,
		outcome: input.outcome,
		authorizedMaximum: quote.maximumCredits,
		measuredUnits: { frame: input.completedFrames },
	}).chargedCredits;
}

export function studioEstimateLabel(quote: StudioQuote): string {
	return quote.estimatedCredits === quote.maximumCredits
		? `Est. ${quote.estimatedCredits} kredit`
		: `${quote.estimatedCredits}–${quote.maximumCredits} kredit`;
}

export function isStudioChargingEnabled(
	env: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
	return env[STUDIO_CREDIT_ROLLOUT_ENV] === "true";
}
