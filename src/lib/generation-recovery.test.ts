import { describe, expect, it } from "vitest";
import {
	isBackgroundGeneration,
	isStaleCompletedLoader,
	resolveInitialGenerating,
} from "@/lib/generation-recovery";

describe("isStaleCompletedLoader", () => {
	it("recovers when completed but content is missing", () => {
		expect(isStaleCompletedLoader("completed", false)).toBe(true);
	});

	it("does not recover when content exists or status is not completed", () => {
		expect(isStaleCompletedLoader("completed", true)).toBe(false);
		expect(isStaleCompletedLoader("generating", false)).toBe(false);
		expect(isStaleCompletedLoader("pending", false)).toBe(false);
		expect(isStaleCompletedLoader(null, false)).toBe(false);
		expect(isStaleCompletedLoader(undefined, false)).toBe(false);
	});
});

describe("isBackgroundGeneration", () => {
	it("waits when generating without content", () => {
		expect(isBackgroundGeneration("generating", false)).toBe(true);
	});

	it("does not wait otherwise", () => {
		expect(isBackgroundGeneration("generating", true)).toBe(false);
		expect(isBackgroundGeneration("completed", false)).toBe(false);
		expect(isBackgroundGeneration("pending", false)).toBe(false);
		expect(isBackgroundGeneration(null, false)).toBe(false);
	});
});

describe("resolveInitialGenerating", () => {
	it("starts generating only with prereq, no content, non-completed status", () => {
		expect(resolveInitialGenerating(true, "pending", false)).toBe(true);
		expect(resolveInitialGenerating(true, "generating", false)).toBe(true);
		expect(resolveInitialGenerating(true, null, false)).toBe(true);
	});

	it("never starts when completed or content exists or prereq missing", () => {
		expect(resolveInitialGenerating(true, "completed", false)).toBe(false);
		expect(resolveInitialGenerating(true, "pending", true)).toBe(false);
		expect(resolveInitialGenerating(false, "pending", false)).toBe(false);
	});
});
