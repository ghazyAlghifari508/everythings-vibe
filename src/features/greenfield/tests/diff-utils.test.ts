import { describe, expect, test } from "vitest";
import {
	computeDiff,
	resolveComparePair,
} from "@/features/greenfield/utils/diff-utils";

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

describe("resolveComparePair", () => {
	const versions = [
		{ version: 1, content: "v1 body" },
		{ version: 2, content: "v2 body" },
		{ version: 5, content: "v5 body" },
	];

	test("compares the selected version with the closest earlier persisted one", () => {
		expect(resolveComparePair(versions, 5)).toEqual({
			oldVersion: 2,
			newVersion: 5,
			oldContent: "v2 body",
			newContent: "v5 body",
		});
	});

	test("keeps old → new direction when the earliest version is selected", () => {
		expect(resolveComparePair(versions, 1)?.oldVersion).toBe(1);
		expect(resolveComparePair(versions, 1)?.newVersion).toBe(2);
	});

	test("is independent of incoming list order", () => {
		expect(resolveComparePair([...versions].reverse(), 2)).toEqual({
			oldVersion: 1,
			newVersion: 2,
			oldContent: "v1 body",
			newContent: "v2 body",
		});
	});

	test("falls back to latest persisted content for a stale selection", () => {
		expect(resolveComparePair(versions, 99)?.newVersion).toBe(5);
	});

	test("returns null when fewer than two usable versions exist", () => {
		expect(resolveComparePair([], 1)).toBeNull();
		expect(resolveComparePair([{ version: 1, content: "only" }], 1)).toBeNull();
		expect(
			resolveComparePair(
				[
					{ version: 1, content: "a" },
					{ version: 1, content: "duplicate" },
					{ version: 0, content: "invalid" },
				],
				1,
			),
		).toBeNull();
	});
});
