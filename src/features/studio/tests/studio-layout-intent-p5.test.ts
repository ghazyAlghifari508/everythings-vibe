import { describe, expect, it } from "vitest";
import { extendStudioBlueprintWithScreen } from "../services/studio-blueprint-navigation";
import {
	type StudioDesignBlueprint,
	validateBlueprint,
} from "../services/studio-design-blueprint";
import {
	financeBlueprint,
	webSaaSBlueprint,
} from "./fixtures/studio-evaluation-fixtures";

function withIntent(blueprint: StudioDesignBlueprint, layoutIntent: string) {
	return {
		...blueprint,
		productIdentity: { ...blueprint.productIdentity, layoutIntent },
	};
}

describe("P5 product-aware layout intent", () => {
	it("retains explicit public website intent and chooses top navigation", () => {
		const result = validateBlueprint({
			...withIntent(webSaaSBlueprint, "public-website"),
			canonicalShell: undefined,
		});
		expect(result).toMatchObject({
			ok: true,
			blueprint: {
				productIdentity: { layoutIntent: "public-website" },
				canonicalShell: { navigation: "top" },
			},
		});
	});

	it.each([
		[financeBlueprint, "public-website"],
		[webSaaSBlueprint, "mobile-application"],
		[webSaaSBlueprint, "portfolio-only"],
		[webSaaSBlueprint, "public-website"],
	])("rejects incompatible intent or navigation", (blueprint, intent) => {
		expect(validateBlueprint(withIntent(blueprint, intent)).ok).toBe(false);
	});

	it("preserves legacy platform and explicit navigation without guessing a portfolio", () => {
		for (const [blueprint, layoutIntent] of [
			[financeBlueprint, "mobile-application"],
			[webSaaSBlueprint, "web-application"],
		] as const) {
			const result = validateBlueprint(blueprint);
			expect(result).toMatchObject({
				ok: true,
				blueprint: {
					productIdentity: { layoutIntent },
					canonicalShell: { navigation: blueprint.canonicalShell?.navigation },
				},
			});
		}
	});

	it("validates the public CTA against existing destinations", () => {
		const blueprint = {
			...withIntent(webSaaSBlueprint, "public-website"),
			canonicalShell: { ...webSaaSBlueprint.canonicalShell, navigation: "top" },
		};
		expect(
			validateBlueprint({
				...blueprint,
				navigationContract: {
					...blueprint.navigationContract,
					ctaDestination: "missing",
				},
			}).ok,
		).toBe(false);
		expect(
			validateBlueprint({
				...blueprint,
				navigationContract: {
					...blueprint.navigationContract,
					ctaDestination: "settings",
				},
			}),
		).toMatchObject({
			ok: true,
			blueprint: { navigationContract: { ctaDestination: "settings" } },
		});
	});

	it("persists contextual intent for nested flows with non-keyword screen names", () => {
		const extended = extendStudioBlueprintWithScreen({
			blueprint: financeBlueprint,
			screenName: "Kustomisasi Pesanan",
			screenRole: {
				role: "contextual",
				reason: "Order flow",
				parentDestinationId: "home",
			},
		});
		expect(extended.screenPlan.at(-1)).toMatchObject({
			navigationRole: "contextual",
		});
		expect(
			extended.canonicalShell?.activeDestinations["Kustomisasi Pesanan"],
		).toBe("home");
	});
});
