import { describe, expect, it, vi } from "vitest";
import { planNewSearchSchema } from "./new";

vi.mock("@tanstack/react-router", () => ({
	createFileRoute: () => (options: unknown) => options,
}));

describe("planNewSearchSchema", () => {
	it("accepts a template prompt with its platform", () => {
		const parsed = planNewSearchSchema.parse({
			prompt: "Buatkan PRD SIMRS",
			platform: "web",
		});

		expect(parsed).toEqual({ prompt: "Buatkan PRD SIMRS", platform: "web" });
	});

	it("accepts an empty search for direct visits", () => {
		expect(planNewSearchSchema.parse({})).toEqual({});
	});

	it("rejects an unknown platform instead of prefilling silently", () => {
		expect(() =>
			planNewSearchSchema.parse({ prompt: "halo", platform: "desktop" }),
		).toThrow();
	});
});
