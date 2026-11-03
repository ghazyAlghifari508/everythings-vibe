import { z } from "zod";
import { ADAPTIVE_CREDIT_PRICING } from "@/features/billing/types/billing-constants";

export const ANALYSIS_ALLOWANCE_POLICY = {
	reservationLifetimeMs: 10 * 60 * 1000,
	providerTimeoutMs: 4 * 60 * 1000,
} as const;

export const analysisCreditConsentSchema = z.object({
	maximumCredits: z.number().int().nonnegative(),
	pricingVersion: z.literal(ADAPTIVE_CREDIT_PRICING.version),
});

export const analysisCreditStatusSchema = z.object({
	code: z.enum([
		"FREE_ALLOWANCE_AVAILABLE",
		"CREDIT_REQUIRED",
		"INSUFFICIENT_CREDITS",
		"SUBSCRIPTION_PAUSED",
		"ANALYSIS_IN_PROGRESS",
	]),
	availableCredits: z.number().int().nonnegative(),
	maximumCredits: z.number().int().nonnegative(),
	estimatedCredits: z.number().int().nonnegative().optional(),
	pricingVersion: z.literal(ADAPTIVE_CREDIT_PRICING.version),
	canStart: z.boolean(),
	billingExempt: z.boolean().optional(),
});
export type AnalysisCreditStatus = z.infer<typeof analysisCreditStatusSchema>;

export function resolveAnalysisCreditPolicy(input: {
	allowanceUsed: boolean;
	allowanceInProgress: boolean;
	subscriptionPaused: boolean;
	availableCredits: number;
	isInitial: boolean;
	consentMaximum?: number;
	billingExempt?: boolean;
}): AnalysisCreditStatus {
	if (input.billingExempt) {
		return {
			code: "FREE_ALLOWANCE_AVAILABLE",
			availableCredits: input.availableCredits,
			maximumCredits: 0,
			pricingVersion: ADAPTIVE_CREDIT_PRICING.version,
			canStart: true,
			billingExempt: true,
		};
	}
	const free = input.isInitial && !input.allowanceUsed;
	const maximumCredits = free
		? 0
		: ADAPTIVE_CREDIT_PRICING.operations.codebase_analysis.maximumCredits;
	const code = input.subscriptionPaused
		? "SUBSCRIPTION_PAUSED"
		: free && input.allowanceInProgress
			? "ANALYSIS_IN_PROGRESS"
			: free
				? "FREE_ALLOWANCE_AVAILABLE"
				: input.availableCredits < maximumCredits
					? "INSUFFICIENT_CREDITS"
					: "CREDIT_REQUIRED";
	return {
		code,
		availableCredits: input.availableCredits,
		maximumCredits,
		pricingVersion: ADAPTIVE_CREDIT_PRICING.version,
		canStart:
			code === "FREE_ALLOWANCE_AVAILABLE" ||
			(code === "CREDIT_REQUIRED" &&
				(input.consentMaximum ?? -1) >= maximumCredits),
	};
}
