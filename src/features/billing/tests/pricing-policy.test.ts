import { describe, expect, it } from "vitest";
import {
	type AdaptiveTariff,
	calculateTariffSettlement,
	createTariffRegistry,
	type FixedTariff,
	quoteTariff,
	TariffDefinitionError,
	TariffLimitError,
	TariffNotConfiguredError,
	type TariffRegistryInput,
	TariffVersionNotFoundError,
} from "@/features/billing/services/pricing-policy";

// Synthetic tariffs. These values exist only to exercise the policy math.
// They are NOT production tariffs and are NOT proposed prices.
const STUDIO_OPERATION = "studio.generate" as const;
const HTML_OPERATION = "scrape.html" as const;
const V1 = "synthetic-v1";
const V2 = "synthetic-v2";
const OUTCOME_SETTLEMENT = {
	success: "completed_units",
	partial: "completed_units",
	failed: "no_charge",
	cancelled: "no_charge",
} as const;

function syntheticAdaptive(
	version: string,
	creditsPerUnit: number,
): AdaptiveTariff {
	return {
		mode: "adaptive",
		version,
		billingUnit: "frame",
		creditsPerUnit,
		minimumCredits: 1,
		maximumCredits: 8,
		rounding: "ceil",
		settlement: { ...OUTCOME_SETTLEMENT },
	};
}

function syntheticFixed(): FixedTariff {
	return {
		mode: "fixed",
		version: V1,
		credits: 2,
		verifiedLimits: { bytes: 16_000, requests: 1 },
		settlement: { ...OUTCOME_SETTLEMENT },
	};
}

function syntheticRegistry(): TariffRegistryInput {
	return {
		id: "synthetic-test-registry",
		tariffs: {
			[STUDIO_OPERATION]: {
				[V1]: syntheticAdaptive(V1, 1.5),
				[V2]: syntheticAdaptive(V2, 2),
			},
			[HTML_OPERATION]: { [V1]: syntheticFixed() },
		},
		activeVersions: {
			[STUDIO_OPERATION]: V2,
			[HTML_OPERATION]: V1,
		},
	};
}

describe("versioned tariff policy with synthetic test tariffs", () => {
	it("quotes deterministic rounded estimates and a maximum from the active tariff version", () => {
		const registry = createTariffRegistry(syntheticRegistry());
		const quote = quoteTariff(registry, {
			operation: STUDIO_OPERATION,
			requestedUnits: { frame: 3 },
		});

		expect(quote.version).toBe(V2);
		expect(quote.estimatedCredits).toBe(6);
		expect(quote.maximumCredits).toBe(8);
		expect(
			quoteTariff(registry, {
				operation: STUDIO_OPERATION,
				requestedUnits: { frame: 3 },
			}),
		).toEqual(quote);
	});

	it("rounds a fractional unit cost upward at the configured boundary", () => {
		const input = syntheticRegistry();
		input.activeVersions[STUDIO_OPERATION] = V1;
		const registry = createTariffRegistry(input);

		const quote = quoteTariff(registry, {
			operation: STUDIO_OPERATION,
			requestedUnits: { frame: 3 },
		});

		expect(quote.estimatedCredits).toBe(5);
	});

	it("applies the minimum only when a unit was requested", () => {
		const input = syntheticRegistry();
		input.activeVersions[STUDIO_OPERATION] = V1;
		const registry = createTariffRegistry(input);

		expect(
			quoteTariff(registry, {
				operation: STUDIO_OPERATION,
				requestedUnits: { frame: 0 },
			}).estimatedCredits,
		).toBe(0);
		expect(
			quoteTariff(registry, {
				operation: STUDIO_OPERATION,
				requestedUnits: { frame: 1 },
			}).estimatedCredits,
		).toBe(2);
	});

	it("settles completed units for partial success but never above the authorized maximum", () => {
		const input = syntheticRegistry();
		input.activeVersions[STUDIO_OPERATION] = V1;
		const registry = createTariffRegistry(input);

		const settlement = calculateTariffSettlement(registry, {
			operation: STUDIO_OPERATION,
			version: V1,
			outcome: "partial",
			measuredUnits: { frame: 4 },
			authorizedMaximum: 4,
		});

		expect(settlement.unitsUsed).toBe(4);
		expect(settlement.chargedCredits).toBe(4);
	});

	it("charges nothing for failed and cancelled outcomes", () => {
		const input = syntheticRegistry();
		input.activeVersions[STUDIO_OPERATION] = V1;
		const registry = createTariffRegistry(input);

		for (const outcome of ["failed", "cancelled"] as const) {
			const settlement = calculateTariffSettlement(registry, {
				operation: STUDIO_OPERATION,
				version: V1,
				outcome,
				measuredUnits: { frame: 4 },
				authorizedMaximum: 8,
			});

			expect(settlement.chargedCredits).toBe(0);
		}
	});

	it("keeps an accepted operation on its pinned version after the active version changes", () => {
		const registry = createTariffRegistry(syntheticRegistry());
		const pinnedQuote = quoteTariff(registry, {
			operation: STUDIO_OPERATION,
			version: V1,
			requestedUnits: { frame: 2 },
		});
		const settlement = calculateTariffSettlement(registry, {
			operation: STUDIO_OPERATION,
			version: pinnedQuote.version,
			outcome: "success",
			measuredUnits: { frame: 2 },
			authorizedMaximum: pinnedQuote.maximumCredits,
		});

		expect(settlement.version).toBe(V1);
		expect(settlement.chargedCredits).toBe(3);
		expect(pinnedQuote.estimatedCredits).toBe(3);
		expect(
			quoteTariff(registry, {
				operation: STUDIO_OPERATION,
				version: V2,
				requestedUnits: { frame: 2 },
			}).estimatedCredits,
		).toBe(4);
	});

	it("refuses to reprice an accepted operation when its pinned version is retired", () => {
		const input = syntheticRegistry();
		delete input.tariffs[STUDIO_OPERATION]?.[V1];
		const registry = createTariffRegistry(input);

		expect(() =>
			quoteTariff(registry, {
				operation: STUDIO_OPERATION,
				version: V1,
				requestedUnits: { frame: 2 },
			}),
		).toThrow(TariffVersionNotFoundError);
		expect(() =>
			calculateTariffSettlement(registry, {
				operation: STUDIO_OPERATION,
				version: V1,
				outcome: "success",
				measuredUnits: { frame: 2 },
				authorizedMaximum: 8,
			}),
		).toThrow(TariffVersionNotFoundError);
	});

	it("refuses operations without an active pinned version", () => {
		const registry = createTariffRegistry(syntheticRegistry());

		expect(() =>
			quoteTariff(registry, {
				operation: "scrape.crawl",
				requestedUnits: { page: 1 },
			}),
		).toThrow(TariffNotConfiguredError);
	});

	it("requires verified limits before quoting a fixed tariff", () => {
		const registry = createTariffRegistry(syntheticRegistry());

		expect(() =>
			quoteTariff(registry, {
				operation: HTML_OPERATION,
				limitMetrics: { bytes: 1000 },
			}),
		).toThrow(TariffLimitError);
		expect(() =>
			quoteTariff(registry, {
				operation: HTML_OPERATION,
				limitMetrics: { bytes: 16_001, requests: 1 },
			}),
		).toThrow(TariffLimitError);
	});

	it("settles a fixed tariff within verified limits and caps at the authorized maximum", () => {
		const registry = createTariffRegistry(syntheticRegistry());
		const limits = { bytes: 16_000, requests: 1 };

		expect(
			quoteTariff(registry, {
				operation: HTML_OPERATION,
				limitMetrics: limits,
			}).estimatedCredits,
		).toBe(2);
		expect(
			calculateTariffSettlement(registry, {
				operation: HTML_OPERATION,
				version: V1,
				outcome: "success",
				limitMetrics: limits,
				authorizedMaximum: 1,
			}).chargedCredits,
		).toBe(1);
	});

	it("rejects a registry whose operation has no pinned active version", () => {
		const input = syntheticRegistry();
		delete input.activeVersions[STUDIO_OPERATION];

		expect(() => createTariffRegistry(input)).toThrow(TariffDefinitionError);
	});
});
