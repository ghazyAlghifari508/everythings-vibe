import { describe, expect, it } from "vitest";
import { prdFyPlans } from "@/features/billing/data/pricing-data";
import {
	FEATURES,
	PLAN_CREDITS,
	PLAN_PRICES,
} from "@/features/billing/types/plans";

describe("PLAN_CREDITS", () => {
	it("free gets 2 lifetime credits", () => {
		expect(PLAN_CREDITS.free).toBe(2);
	});

	it("pro gets 30 credits", () => {
		expect(PLAN_CREDITS.pro).toBe(30);
	});

	it("hengker gets 105 credits", () => {
		expect(PLAN_CREDITS.hengker).toBe(105);
	});
});

describe("PLAN_PRICES", () => {
	it("matches the approved one-time price sheet", () => {
		expect(PLAN_PRICES.free).toBe(0);
		expect(PLAN_PRICES.pro).toBe(49000);
		expect(PLAN_PRICES.hengker).toBe(149000);
	});
});

describe("FEATURES", () => {
	it("free is PRD-only, no share", () => {
		expect(FEATURES.free.fullWorkflow).toBe(false);
		expect(FEATURES.free.shareLink).toBe(false);
	});

	it("pro unlocks full workflow + share", () => {
		expect(FEATURES.pro.fullWorkflow).toBe(true);
		expect(FEATURES.pro.shareLink).toBe(true);
	});

	it("hengker adds priority queue", () => {
		expect(FEATURES.hengker.fullWorkflow).toBe(true);
		expect(FEATURES.hengker.priorityQueue).toBe(true);
	});
});

describe("pricing entitlements and contract", () => {
	const includedKeys = (plan: (typeof prdFyPlans)[number]) =>
		new Set(
			plan.features.filter((feature) => feature.isIncluded).map((f) => f.key),
		);

	it("all tiers publish the 30-day reset entitlement", () => {
		for (const plan of prdFyPlans) {
			const resetFeature = plan.features.find((f) => f.key === "monthly-reset");
			expect(resetFeature?.isIncluded).toBe(true);
			expect(resetFeature?.name).toBe("Kredit direset tiap 30 hari");
		}
	});

	it("free publishes VibePlan trials without paid product access", () => {
		const included = includedKeys(prdFyPlans[0]);
		expect(included.has("vibeplan")).toBe(true);
		expect(included.has("studio-trial")).toBe(true);
		expect(included.has("scrape-trial")).toBe(true);
		expect(included.has("studio")).toBe(false);
		expect(included.has("scrape")).toBe(false);
	});

	it("paid tiers publish full multi-product access", () => {
		for (const plan of prdFyPlans.slice(1)) {
			const included = includedKeys(plan);
			expect(included.has("vibeplan")).toBe(true);
			expect(included.has("studio")).toBe(true);
			expect(included.has("scrape")).toBe(true);
			expect(included.has("template")).toBe(true);
		}
	});

	it("published allocations match the plan credit contract", () => {
		for (const plan of prdFyPlans) {
			expect(plan.credits).toBe(PLAN_CREDITS[plan.id]);
			expect(plan.price).toBe(PLAN_PRICES[plan.id]);
		}
	});
});
