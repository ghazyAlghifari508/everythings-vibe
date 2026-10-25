import { describe, expect, it } from "vitest";
import { Route as BantuanRoute } from "./bantuan";
import { Route as HistoryRoute } from "./history";
import { Route as IndexRoute } from "./index";
import { Route as MaintenanceRoute } from "./maintenance";
import { Route as PlanIndexRoute } from "./plan/index";
import { Route as PricingRoute } from "./pricing";
import { Route as TemplatesRoute } from "./templates";

function resolveMetaTitle(headFn: unknown): string | undefined {
	if (typeof headFn !== "function") return undefined;
	const result = headFn({} as never);
	const titleMeta = result?.meta?.find(
		(m: Record<string, unknown>) => "title" in m,
	) as { title?: string } | undefined;
	return titleMeta?.title;
}

describe("Public route metadata canonical naming", () => {
	it("consistently declares everythings-vibe in page titles", () => {
		expect(resolveMetaTitle(IndexRoute.options.head)).toBe(
			"everythings-vibe - All-in-One AI Vibe-Coding Workspace",
		);
		expect(resolveMetaTitle(PricingRoute.options.head)).toBe(
			"Pricing | everythings-vibe",
		);
		expect(resolveMetaTitle(BantuanRoute.options.head)).toBe(
			"Bantuan | everythings-vibe",
		);
		expect(resolveMetaTitle(HistoryRoute.options.head)).toBe(
			"History | everythings-vibe",
		);
		expect(resolveMetaTitle(PlanIndexRoute.options.head)).toBe(
			"VibePlan | everythings-vibe",
		);
		expect(resolveMetaTitle(TemplatesRoute.options.head)).toBe(
			"VibeTemplate | everythings-vibe",
		);
		expect(resolveMetaTitle(MaintenanceRoute.options.head)).toBe(
			"Maintenance | everythings-vibe",
		);
	});
});
