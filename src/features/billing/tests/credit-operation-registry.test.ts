import { describe, expect, it } from "vitest";
import {
	CREDIT_OPERATION_REGISTRY,
	type CreditOperationKind,
	CreditPricingUnconfiguredError,
	maximumCreditsOf,
	requireConfiguredPricing,
} from "@/features/billing/services/credit-operation-registry";
import { ADAPTIVE_CREDIT_PRICING } from "@/features/billing/types/billing-constants";
import { estimateCreditQuote } from "@/lib/adaptive-credit";
import { createCreditQuote } from "@/lib/services/credit-service";

const PLAN_KINDS = [
	"codebase_analysis",
	"prd_generation",
	"ac_generation",
	"task_generation",
] as const;
const UNCONFIGURED_KINDS = [
	"studio.generate",
	"studio.add_frame",
	"studio.revise",
	"studio.regenerate",
	"scrape.crawl",
	"scrape.html",
	"scrape.images",
	"scrape.design_md",
] as const;

describe("credit operation registry", () => {
	it("keeps VibePlan pricing identical to the adaptive table", () => {
		for (const kind of PLAN_KINDS) {
			const pricing = requireConfiguredPricing(kind);
			expect(pricing).toMatchObject({
				mode: "adaptive",
				version: ADAPTIVE_CREDIT_PRICING.version,
				...ADAPTIVE_CREDIT_PRICING.operations[kind],
			});
			expect(
				estimateCreditQuote({ operation: kind, metrics: {} }),
			).toMatchObject({
				estimatedCredits: ADAPTIVE_CREDIT_PRICING.operations[kind].baseCredits,
				maximumCredits: ADAPTIVE_CREDIT_PRICING.operations[kind].maximumCredits,
			});
		}
	});

	it("represents Studio and Scrape pricing as unconfigured, never zero", () => {
		for (const kind of UNCONFIGURED_KINDS) {
			expect(CREDIT_OPERATION_REGISTRY[kind].pricing).toEqual({
				status: "unconfigured",
			});
			expect(() => requireConfiguredPricing(kind)).toThrow(
				CreditPricingUnconfiguredError,
			);
			expect(() =>
				estimateCreditQuote({ operation: kind, metrics: {} }),
			).toThrow(`Credit pricing is not configured for ${kind}`);
			expect(() =>
				createCreditQuote({
					userId: "u",
					projectId: "p",
					operation: kind,
					stage: CREDIT_OPERATION_REGISTRY[kind].stage,
					metrics: {},
				}),
			).toThrow(CreditPricingUnconfiguredError);
		}
	});

	it("never ships a configured tariff with a non-positive amount", () => {
		for (const kind of Object.keys(
			CREDIT_OPERATION_REGISTRY,
		) as CreditOperationKind[]) {
			const pricing = CREDIT_OPERATION_REGISTRY[kind].pricing;
			if (pricing.status !== "configured") continue;
			expect(maximumCreditsOf(pricing)).toBeGreaterThan(0);
		}
	});

	it("maps every Studio job type and Scrape mode to exactly one operation", () => {
		const sources = Object.values(CREDIT_OPERATION_REGISTRY).map(
			(d) => d.source,
		);
		const jobTypes = sources.flatMap((s) =>
			s.table === "studio_jobs" ? [s.jobType] : [],
		);
		const modes = sources.flatMap((s) =>
			s.table === "scrapes" ? [s.mode] : [],
		);
		expect([...jobTypes].sort()).toEqual(["add", "initial", "retry", "revise"]);
		expect([...modes].sort()).toEqual(["crawl", "design", "html", "images"]);
	});

	it("derives each operation's resource type and stage from one place", () => {
		for (const kind of UNCONFIGURED_KINDS) {
			const def = CREDIT_OPERATION_REGISTRY[kind];
			expect(def.resourceType).toBe(
				kind.startsWith("studio.") ? "studio_project" : "scrape",
			);
			expect(def.stage).toBe(kind.startsWith("studio.") ? "studio" : "scrape");
		}
		for (const kind of PLAN_KINDS)
			expect(CREDIT_OPERATION_REGISTRY[kind].resourceType).toBe("plan_project");
	});
});
