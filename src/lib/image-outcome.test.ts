import { describe, expect, it } from "vitest";
import { classifyImageOutcome } from "./scrape-images";

describe("classifyImageOutcome", () => {
	it("reports a genuinely empty page as a truthful empty result", () => {
		expect(classifyImageOutcome(0, 0)).toBe("empty");
	});

	it("separates a total verification failure from an empty page", () => {
		expect(classifyImageOutcome(12, 0)).toBe("all-failed");
	});

	it("keeps a partial result instead of discarding verified resources", () => {
		expect(classifyImageOutcome(10, 4)).toBe("partial");
	});

	it("reports a fully verified run as complete", () => {
		expect(classifyImageOutcome(7, 7)).toBe("complete");
	});

	it("never treats a total failure as a completed or empty extraction", () => {
		expect(classifyImageOutcome(5, 0)).not.toBe("complete");
		expect(classifyImageOutcome(5, 0)).not.toBe("empty");
	});

	it("never treats zero candidates as a verification failure", () => {
		expect(classifyImageOutcome(0, 0)).not.toBe("all-failed");
	});
});
