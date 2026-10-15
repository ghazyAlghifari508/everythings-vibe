import { describe, expect, it } from "vitest";
import { resolveStudioDesignSkill } from "./studio-design-skill-registry.server";
import { STUDIO_DESIGN_SKILLS } from "./studio-design-skills";
import {
	studioDesignReferenceSchema,
	studioGenerationOptionsSchema,
	studioInitialPageCountSchema,
} from "./studio-generation-options";

describe("Studio generation configuration", () => {
	it("defaults new configurations without accepting invalid explicit counts", () => {
		expect(studioGenerationOptionsSchema.parse({})).toEqual({
			designSkillId: "none",
			initialPageCount: 3,
			designMode: "web",
		});
		for (const value of [1, 2, 3, 4, 5])
			expect(studioInitialPageCountSchema.parse(value)).toBe(value);
		for (const value of [0, 6, 1.5, "3", null])
			expect(studioInitialPageCountSchema.safeParse(value).success).toBe(false);
	});
	it("accepts only serializable reference identities and supported skills", () => {
		expect(
			studioDesignReferenceSchema.parse({ kind: "theme", id: "workspace" }),
		).toEqual({ kind: "theme", id: "workspace" });
		expect(
			studioDesignReferenceSchema.safeParse({ kind: "template", id: "future" })
				.success,
		).toBe(false);
		expect(
			studioGenerationOptionsSchema.safeParse({
				designSkillId: "https://example.test/skill",
			}).success,
		).toBe(false);
		expect(
			studioDesignReferenceSchema.safeParse({
				kind: "custom",
				filename: "executable.exe",
			}).success,
		).toBe(false);
	});
	it("resolves every catalog identity to versioned guidance without executing remote content", () => {
		expect(STUDIO_DESIGN_SKILLS.map((skill) => skill.id)).toEqual([
			"none",
			"impeccable",
			"frontend-design",
			"ui-ux-pro-max",
			"anti-slop",
			"taste",
		]);
		expect(resolveStudioDesignSkill("none").guidance).toBe("");
		for (const skill of STUDIO_DESIGN_SKILLS.slice(1)) {
			const resolved = resolveStudioDesignSkill(skill.id);
			expect(resolved.version).toBe(2);
			expect(resolved.guidance.length).toBeGreaterThan(100);
			expect(resolved.sourceRevision).toMatch(/^[a-f0-9]{40}$/);
			expect(skill).not.toHaveProperty("guidance");
		}
		expect(() => resolveStudioDesignSkill("unrecognized")).toThrow();
	});
});
