import { expect, test } from "vitest";
import { computeDiff } from "@/features/greenfield/utils/diff-utils";

test("detect added line", () => {
	const d = computeDiff("a\nb", "a\nb\nc");
	expect(d.some((x) => x.type === "added" && x.text === "c")).toBe(true);
});
test("detect removed", () => {
	const d = computeDiff("a\nb", "a");
	expect(d.some((x) => x.type === "removed")).toBe(true);
});
test("empty inputs return empty diff", () => {
	expect(computeDiff("", "")).toEqual([]);
});
