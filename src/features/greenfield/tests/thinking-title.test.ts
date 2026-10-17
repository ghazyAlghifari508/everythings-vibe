import { describe, expect, it } from "vitest";
import {
	IDLE_GENERATING_TITLE,
	thinkingTitleText,
} from "@/features/greenfield/components/task/thinking-title";

describe("thinkingTitleText", () => {
	it("falls back to the neutral label when nothing has streamed yet", () => {
		expect(thinkingTitleText("")).toBe(IDLE_GENERATING_TITLE);
		expect(thinkingTitleText("   \n  \n")).toBe(IDLE_GENERATING_TITLE);
	});

	it("returns the single trimmed line", () => {
		expect(thinkingTitleText("  memecah  fitur\n")).toBe("memecah fitur");
	});

	it("uses the LAST non-empty line (newest reasoning wins)", () => {
		expect(thinkingTitleText("baris awal\nbaris tengah\n\nbaris akhir")).toBe(
			"baris akhir",
		);
	});

	it("collapses internal whitespace", () => {
		expect(thinkingTitleText("a   b\t\tc")).toBe("a b c");
	});

	it("tail-truncates long lines with a leading ellipsis", () => {
		const long = "x".repeat(120);
		const out = thinkingTitleText(long);
		expect(out).toBe(`…${"x".repeat(80)}`);
		expect(out).toHaveLength(81);
	});

	it("keeps a line of exactly the max length intact", () => {
		const exact = "y".repeat(80);
		expect(thinkingTitleText(exact)).toBe(exact);
	});
});
