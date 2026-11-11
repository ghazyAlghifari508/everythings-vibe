import { describe, expect, it } from "vitest";
import {
	studioDesignReferenceSchema,
	studioGenerationOptionsSchema,
	studioInitialPageCountSchema,
} from "../services/studio-generation-options";

describe("Studio generation configuration", () => {
	it("defaults new configurations without accepting invalid explicit counts", () => {
		expect(studioGenerationOptionsSchema.parse({})).toEqual({
			initialPageCount: 3,
			designMode: "web",
		});
		for (const value of [1, 2, 3, 4, 5])
			expect(studioInitialPageCountSchema.parse(value)).toBe(value);
		for (const value of [0, 6, 1.5, "3", null])
			expect(studioInitialPageCountSchema.safeParse(value).success).toBe(false);
	});
	it("accepts only serializable reference identities and ignores a retired skill field", () => {
		expect(
			studioDesignReferenceSchema.parse({ kind: "theme", id: "workspace" }),
		).toEqual({ kind: "theme", id: "workspace" });
		expect(
			studioDesignReferenceSchema.safeParse({ kind: "template", id: "future" })
				.success,
		).toBe(false);
		expect(
			studioDesignReferenceSchema.safeParse({
				kind: "custom",
				filename: "executable.exe",
			}).success,
		).toBe(false);
		// A retired client may still send `designSkillId`; the options schema no
		// longer declares it, so it is stripped instead of rejecting the request.
		expect(
			studioGenerationOptionsSchema.parse({ designSkillId: "impeccable" }),
		).toEqual({ initialPageCount: 3, designMode: "web" });
	});
});
