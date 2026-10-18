import { describe, expect, it } from "vitest";
import { parseStudioPlanningWithBlueprint } from "../services/studio-planning-parser";
import { buildStudioPlanningPrompt } from "../services/studio-planning-prompt";

function validBlueprint(platform: "web" | "mobile", count: number) {
	const screens = Array.from({ length: count }, (_, order) => ({
		name: `Screen ${order}`,
		description: "Sample",
		viewport: platform,
		order,
	}));
	const destinations = screens.map((_, order) => `screen-${order}`);
	return {
		projectTitle: "Sample",
		screens,
		blueprint: {
			productIdentity: {
				productName: "Sample",
				targetAudience: "General",
				platform,
				visualDirection: "Clean",
			},
			designTokens: {
				primary: "#0f0f0f",
				secondary: "#606060",
				background: "#ffffff",
				surface: "#f8f8f8",
				fontFamily: "Arial",
				radius: 12,
				border: "1px solid #d3d3d3",
				elevation: "none",
			},
			sharedComponents: {
				header: "Bar",
				navigation: "Tabs",
				buttons: "Ink",
				inputs: "8px",
				cards: "12px",
				tabs: "Seg",
				icons: "Lucide",
			},
			navigationContract: {
				destinations,
				labels: screens.map((s) => s.name),
				iconMapping: {},
				ordering: destinations,
				activeItemRule: "Highlight active",
			},
			screenPlan: screens.map((s) => ({
				name: s.name,
				role: s.description,
				order: s.order,
			})),
		},
	};
}

describe("planning + blueprint", () => {
	it("menolak count yang salah dan viewport campuran", () => {
		const raw = JSON.stringify(validBlueprint("web", 1));
		const res = parseStudioPlanningWithBlueprint(raw, "mobile", 3);
		expect(res.ok).toBe(false);
	});

	it("menerima exact count + blueprint valid + nav konsisten", () => {
		const raw = JSON.stringify(validBlueprint("mobile", 2));
		const res = parseStudioPlanningWithBlueprint(raw, "mobile", 2);
		expect(res.ok).toBe(true);
		if (res.ok) {
			expect(res.plan.screens).toHaveLength(2);
			expect(res.blueprint.navigationContract.labels).toEqual([
				"Screen 0",
				"Screen 1",
			]);
		}
	});

	it("menolak output tanpa blueprint", () => {
		const raw = JSON.stringify({
			projectTitle: "Sample",
			screens: [{ name: "A", description: "a", viewport: "web", order: 0 }],
		});
		const res = parseStudioPlanningWithBlueprint(raw, "web", 1);
		expect(res.ok).toBe(false);
	});

	it("menolak blueprint dengan platform berbeda", () => {
		const raw = JSON.stringify(validBlueprint("web", 1));
		const res = parseStudioPlanningWithBlueprint(raw, "mobile", 1);
		expect(res.ok).toBe(false);
	});

	it("prompt planning memakai viewport 390px dan blok precedence", () => {
		const prompt = buildStudioPlanningPrompt(
			"Buat aplikasi kasir",
			"mobile",
			null,
			2,
		);
		expect(prompt).toContain("390px");
		expect(prompt).not.toContain("375px");
		expect(prompt).toContain("User Request:");
		expect(prompt).toContain("Initial screen count: exactly 2");
		expect(prompt).toContain("Plan the necessary screens");
		expect(prompt).toContain("blueprint");
		expect(prompt).toContain("Design precedence");
	});
});
