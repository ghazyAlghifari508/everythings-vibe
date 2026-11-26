import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-start", () => ({
	createServerFn: () => ({
		handler: (handler: () => unknown) => handler,
	}),
}));

import { resolveProductChargingState } from "../services/charging-state.functions";

describe("resolveProductChargingState", () => {
	it("reports charging inactive while the rollout flags are absent", () => {
		expect(resolveProductChargingState({})).toEqual({
			studio: false,
			scrape: false,
		});
	});

	it("keeps unconfigured tariffs inactive even when the rollout flag is set", () => {
		expect(
			resolveProductChargingState({
				STUDIO_CREDIT_CHARGING_ENABLED: "true",
				SCRAPE_CREDIT_CHARGING_ENABLED: "true",
			}),
		).toEqual({ studio: false, scrape: false });
	});

	it("rejects non-exact flag values", () => {
		expect(
			resolveProductChargingState({
				STUDIO_CREDIT_CHARGING_ENABLED: "1",
				SCRAPE_CREDIT_CHARGING_ENABLED: "TRUE",
			}),
		).toEqual({ studio: false, scrape: false });
	});
});
