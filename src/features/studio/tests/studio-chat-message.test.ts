import { describe, expect, it } from "vitest";
import {
	STUDIO_USER_MESSAGE_COLLAPSE_CHARS,
	STUDIO_USER_MESSAGE_COLLAPSE_LINES,
} from "../types/studio-constants";
import type { StudioMessageProgress } from "../types/studio-conversation";
import {
	describeStudioResult,
	isLongStudioUserMessage,
} from "../utils/studio-chat-message";

const base: StudioMessageProgress = {
	phase: "completed",
	ready: 4,
	total: 4,
	failed: 0,
	screenNames: ["A", "B", "C", "D"],
	recovery: null,
};

describe("user message collapse threshold", () => {
	it("leaves a short prompt without an expansion control", () => {
		expect(isLongStudioUserMessage("Buat aplikasi travel")).toBe(false);
	});
	it("collapses past the character bound but not at it", () => {
		expect(
			isLongStudioUserMessage("a".repeat(STUDIO_USER_MESSAGE_COLLAPSE_CHARS)),
		).toBe(false);
		expect(
			isLongStudioUserMessage(
				"a".repeat(STUDIO_USER_MESSAGE_COLLAPSE_CHARS + 1),
			),
		).toBe(true);
	});
	it("collapses a short but many-line prompt", () => {
		const lines = Array.from(
			{ length: STUDIO_USER_MESSAGE_COLLAPSE_LINES + 1 },
			() => "x",
		).join("\n");
		expect(isLongStudioUserMessage(lines)).toBe(true);
	});
});

describe("result card", () => {
	it("does not exist before any frame does", () => {
		expect(describeStudioResult({ ...base, total: 0, ready: 0 })).toBeNull();
	});
	it("reports a completed batch as finished and idle", () => {
		expect(describeStudioResult(base)).toMatchObject({ running: false });
	});
	it("reports partial results with real counts and never as finished", () => {
		const partial = describeStudioResult({
			...base,
			phase: "partial",
			ready: 3,
			failed: 1,
		});
		expect(partial?.running).toBe(false);
		expect(partial?.label).toContain("3");
		expect(partial?.label).toContain("4");
		expect(partial?.label).not.toBe(describeStudioResult(base)?.label);
	});
	it("shows activity only while the work is genuinely running", () => {
		expect(
			describeStudioResult({ ...base, phase: "generating", ready: 1 })?.running,
		).toBe(true);
		expect(
			describeStudioResult({ ...base, phase: "failed", ready: 0 })?.running,
		).toBe(false);
	});
});
