import { describe, expect, it } from "vitest";
import {
	createTariffRegistry,
	TariffVersionNotFoundError,
} from "@/features/billing/services/pricing-policy";
import type { TariffRegistry } from "@/features/billing/services/pricing-policy-types";
import {
	createStudioQuote,
	isStudioChargingEnabled,
	isStudioQuoteFresh,
	STUDIO_CREDIT_QUOTE_TTL_MS,
	STUDIO_CREDIT_ROLLOUT_ENV,
	studioChargeForOutcome,
	studioEstimateLabel,
	studioMetricsForScope,
	studioOperationForJob,
} from "../services/studio-credit-policy";

const ALL_OUTCOMES = {
	success: "completed_units",
	partial: "completed_units",
	failed: "no_charge",
	cancelled: "no_charge",
} as const;

function syntheticRegistry(): TariffRegistry {
	return createTariffRegistry({
		id: "synthetic-studio-v1",
		tariffs: {
			"studio.generate": {
				"synthetic-v1": {
					mode: "adaptive",
					version: "synthetic-v1",
					billingUnit: "frame",
					creditsPerUnit: 2,
					minimumCredits: 2,
					maximumCredits: 8,
					rounding: "ceil",
					settlement: ALL_OUTCOMES,
				},
			},
			"studio.revise": {
				"synthetic-v1": {
					mode: "adaptive",
					version: "synthetic-v1",
					billingUnit: "frame",
					creditsPerUnit: 1,
					minimumCredits: 1,
					maximumCredits: 4,
					rounding: "ceil",
					settlement: ALL_OUTCOMES,
				},
			},
		},
		activeVersions: {
			"studio.generate": "synthetic-v1",
			"studio.revise": "synthetic-v1",
		},
	});
}

const scope = {
	operation: "studio.generate" as const,
	frames: 3,
	promptChars: 120,
};

describe("studio credit policy", () => {
	it("maps each real job type to one billable Studio operation", () => {
		expect(studioOperationForJob("initial")).toBe("studio.generate");
		expect(studioOperationForJob("add")).toBe("studio.add_frame");
		expect(studioOperationForJob("revise")).toBe("studio.revise");
		expect(studioOperationForJob("retry")).toBe("studio.regenerate");
	});

	it("quotes from the server registry with a pinned version and bounded maximum", () => {
		const now = new Date("2026-11-23T10:00:00.000Z");
		const quote = createStudioQuote(syntheticRegistry(), scope, now);
		expect(quote).not.toBeNull();
		expect(quote).toMatchObject({
			operation: "studio.generate",
			version: "synthetic-v1",
			estimatedCredits: 6,
			maximumCredits: 8,
			scope,
		});
		expect(quote?.expiresAt).toBe(
			new Date(now.getTime() + STUDIO_CREDIT_QUOTE_TTL_MS).toISOString(),
		);
		expect(studioMetricsForScope(scope).studio).toEqual({
			frames: 3,
			promptChars: 120,
			designMdChars: 0,
		});
	});

	it("never invents a quote when no tariff is configured", () => {
		const empty = createTariffRegistry({
			id: "inactive",
			tariffs: {},
			activeVersions: {},
		});
		expect(createStudioQuote(empty, scope)).toBeNull();
	});

	it("treats a quote as stale exactly at its expiry", () => {
		const now = new Date("2026-11-23T10:00:00.000Z");
		const quote = createStudioQuote(syntheticRegistry(), scope, now);
		if (!quote) throw new Error("Expected a synthetic quote");
		expect(isStudioQuoteFresh(quote, new Date(now.getTime() + 1_000))).toBe(
			true,
		);
		expect(
			isStudioQuoteFresh(
				quote,
				new Date(now.getTime() + STUDIO_CREDIT_QUOTE_TTL_MS),
			),
		).toBe(false);
	});

	it("settles only completed frames and never above the authorized maximum", () => {
		const quote = createStudioQuote(syntheticRegistry(), scope);
		if (!quote) throw new Error("Expected a synthetic quote");
		expect(
			studioChargeForOutcome(syntheticRegistry(), quote, {
				outcome: "partial",
				completedFrames: 2,
			}),
		).toBe(4);
		expect(
			studioChargeForOutcome(syntheticRegistry(), quote, {
				outcome: "partial",
				completedFrames: 10,
			}),
		).toBe(8);
		expect(
			studioChargeForOutcome(syntheticRegistry(), quote, {
				outcome: "failed",
				completedFrames: 10,
			}),
		).toBe(0);
		expect(
			studioChargeForOutcome(syntheticRegistry(), quote, {
				outcome: "cancelled",
				completedFrames: 0,
			}),
		).toBe(0);
	});

	it("refuses to settle a revoked pricing version", () => {
		const quote = createStudioQuote(syntheticRegistry(), scope);
		if (!quote) throw new Error("Expected a synthetic quote");
		const rotated = createTariffRegistry({
			id: "synthetic-studio-v2",
			tariffs: {
				"studio.generate": {
					"synthetic-v2": {
						mode: "adaptive",
						version: "synthetic-v2",
						billingUnit: "frame",
						creditsPerUnit: 2,
						minimumCredits: 2,
						maximumCredits: 8,
						rounding: "ceil",
						settlement: ALL_OUTCOMES,
					},
				},
			},
			activeVersions: { "studio.generate": "synthetic-v2" },
		});
		expect(() =>
			studioChargeForOutcome(rotated, quote, {
				outcome: "success",
				completedFrames: 3,
			}),
		).toThrow(TariffVersionNotFoundError);
	});

	it("shows only the disclosed estimate, with a range when they differ", () => {
		const quote = createStudioQuote(syntheticRegistry(), scope);
		if (!quote) throw new Error("Expected a synthetic quote");
		expect(studioEstimateLabel(quote)).toBe("6–8 kredit");
		const exact = createStudioQuote(syntheticRegistry(), {
			operation: "studio.revise",
			frames: 4,
			promptChars: 120,
		});
		expect(exact && studioEstimateLabel(exact)).toBe("Est. 4 kredit");
	});

	it("keeps charging disabled unless the rollout flag is explicitly on", () => {
		expect(isStudioChargingEnabled({})).toBe(false);
		expect(isStudioChargingEnabled({ [STUDIO_CREDIT_ROLLOUT_ENV]: "1" })).toBe(
			false,
		);
		expect(
			isStudioChargingEnabled({ [STUDIO_CREDIT_ROLLOUT_ENV]: "true" }),
		).toBe(true);
	});
});
