import { describe, expect, it } from "vitest";
import {
	STUDIO_FRAME_CONCURRENCY,
	STUDIO_FRAME_MAX_TOKENS,
	STUDIO_PLANNING_MAX_TOKENS,
} from "@/lib/constants";
import { studioDesignBlueprintSchema } from "../services/studio-design-blueprint";

describe("p2 constants", () => {
	it("menyediakan bounded concurrency default konservatif 2..3", () => {
		expect(STUDIO_FRAME_CONCURRENCY).toBeGreaterThanOrEqual(2);
		expect(STUDIO_FRAME_CONCURRENCY).toBeLessThanOrEqual(3);
	});

	it("menyediakan token budgets server-side yang terpusat", () => {
		expect(STUDIO_PLANNING_MAX_TOKENS).toBeGreaterThan(0);
		expect(STUDIO_FRAME_MAX_TOKENS).toBeGreaterThan(STUDIO_PLANNING_MAX_TOKENS);
	});

	it("menolak blueprint tanpa navigation contract", () => {
		const res = studioDesignBlueprintSchema.safeParse({
			productIdentity: {
				productName: "Kopi",
				targetAudience: "Umum",
				platform: "mobile" as const,
				visualDirection: "Bersih",
			},
			designTokens: {
				primary: "#0f0f0f",
				secondary: "#606060",
				background: "#ffffff",
				surface: "#f8f8f8",
				fontFamily: "system-ui",
				radius: 12,
				border: "1px solid #d3d3d3",
				elevation: "none",
			},
			sharedComponents: {
				header: "App bar",
				navigation: "Bottom tabs",
				buttons: "Solid ink",
				inputs: "Rounded 8px",
				cards: "Rounded 12px",
				tabs: "Segmented",
				icons: "Lucide 1.5px outline",
			},
			screenPlan: [{ name: "Jelajah", role: "Daftar menu", order: 0 }],
		});
		expect(res.success).toBe(false);
	});
});
