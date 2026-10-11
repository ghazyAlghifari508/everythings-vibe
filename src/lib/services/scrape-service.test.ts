import { expect, it } from "vitest";
import { generateDesignMd } from "../prompts-design-md";

it("does not generate website measurements without observed elements", async () => {
	await expect(
		generateDesignMd({
			version: 1,
			sourceUrl: "https://example.test/",
			capturedAt: new Date().toISOString(),
			viewport: { width: 1440, height: 900 },
			elements: [],
			fonts: [],
			limitations: [],
		}),
	).rejects.toMatchObject({ code: "NO_ANALYZABLE_CONTENT" });
});
