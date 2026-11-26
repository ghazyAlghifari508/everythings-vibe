import { describe, expect, it } from "vitest";
import {
	studioDesignReferenceSchema,
	studioGenerationOptionsSchema,
} from "../services/studio-generation-options";

describe("Studio generation configuration", () => {
	it("strips retired launch counts without applying a default count", () => {
		expect(
			studioGenerationOptionsSchema.parse({ initialPageCount: 4 }),
		).toEqual({ designMode: "web" });
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
		).toEqual({ designMode: "web" });
	});
});
