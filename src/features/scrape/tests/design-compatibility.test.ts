import { expect, it } from "vitest";

it("keeps legacy design pipeline exports bound to their canonical implementations", async () => {
	const modules = [
		[
			import("@/lib/design-evidence-contract"),
			import("../types/design-evidence-contract"),
		],
		[
			import("@/lib/design-visual-evidence"),
			import("../services/design-visual-evidence"),
		],
		[import("@/lib/design-model"), import("../services/design-model")],
		[
			import("@/lib/design-normalize-color"),
			import("../utils/design-normalize-color"),
		],
		[
			import("@/lib/design-normalize-shape"),
			import("../utils/design-normalize-shape"),
		],
		[
			import("@/lib/design-normalize-typography"),
			import("../utils/design-normalize-typography"),
		],
		[import("@/lib/design-md-render"), import("../utils/design-md-render")],
		[
			import("@/lib/design-md-inspector"),
			import("../utils/design-md-inspector"),
		],
		[import("@/lib/design-synthesis"), import("../services/design-synthesis")],
		[
			import("@/lib/prompts-design-md"),
			import("../services/prompts-design-md"),
		],
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
