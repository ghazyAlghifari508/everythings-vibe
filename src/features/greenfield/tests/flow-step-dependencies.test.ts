import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("flow step dependency boundary", () => {
	it("defines ranking without depending on progression policies", () => {
		const source = readFileSync(
			new URL("../utils/flow-step.ts", import.meta.url),
			"utf8",
		);
		expect(source).not.toMatch(
			/(?:from\s*|import\s*\()["'][^"']*flow-progress/,
		);
		expect(source).toMatch(/export function stepRank\(/);
	});
});
