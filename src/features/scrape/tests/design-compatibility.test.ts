import { expect, it } from "vitest";

// Facades that stay bound: src/db/schema.ts types its jsonb column through
// @/lib/design-visual-evidence, and the Studio design-system suite renders a DESIGN.md
// through @/lib/design-md-render because Studio may only touch Scrape's public
// scrape-design-md-service (enforced by features/studio/tests/studio-client-boundary.test.ts).
it("keeps the shared design facades bound to their canonical implementations", async () => {
	const modules = [
		[
			import("@/lib/design-visual-evidence"),
			import("../services/design-visual-evidence"),
		],
		[import("@/lib/design-md-render"), import("../utils/design-md-render")],
		[import("@/lib/design-color-parse"), import("../utils/design-color-parse")],
	];
	for (const pair of modules) {
		const [legacy, canonical] = await Promise.all(pair);
		expect(Object.keys(legacy ?? {}).sort()).toEqual(
			Object.keys(canonical ?? {}).sort(),
		);
		for (const [name, implementation] of Object.entries(legacy ?? {})) {
			expect(Object.entries(canonical ?? {})).toContainEqual([
				name,
				implementation,
			]);
		}
	}
});
