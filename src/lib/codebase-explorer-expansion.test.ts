import { describe, expect, it } from "vitest";
import {
	EXPLORER_EXPANSION_MAX_ENTRIES,
	explorerExpansionStorageKey,
	parseExplorerExpansion,
	pruneExplorerExpansion,
	serializeExplorerExpansion,
} from "./codebase-explorer-expansion";

describe("explorerExpansionStorageKey", () => {
	it("scopes preferences per codebase", () => {
		expect(explorerExpansionStorageKey("repo-a")).not.toBe(
			explorerExpansionStorageKey("repo-b"),
		);
	});

	it("is stable for the same codebase", () => {
		expect(explorerExpansionStorageKey("repo-a")).toBe(
			explorerExpansionStorageKey("repo-a"),
		);
	});

	it("refuses to key an absent codebase id", () => {
		expect(explorerExpansionStorageKey("")).toBeNull();
		expect(explorerExpansionStorageKey("   ")).toBeNull();
	});

	it("does not let one codebase id collide with another by prefix", () => {
		expect(explorerExpansionStorageKey("a")).not.toBe(
			explorerExpansionStorageKey("ab"),
		);
	});
});

describe("parseExplorerExpansion", () => {
	it("reads a stored list of folder paths", () => {
		expect(parseExplorerExpansion('["src","src/pages"]')).toEqual([
			"src",
			"src/pages",
		]);
	});

	it("treats no stored preference as nothing expanded", () => {
		expect(parseExplorerExpansion(null)).toEqual([]);
		expect(parseExplorerExpansion(undefined)).toEqual([]);
		expect(parseExplorerExpansion("")).toEqual([]);
	});

	it("ignores malformed JSON instead of throwing", () => {
		expect(parseExplorerExpansion("{not json")).toEqual([]);
		expect(parseExplorerExpansion("null")).toEqual([]);
		expect(parseExplorerExpansion("42")).toEqual([]);
		expect(parseExplorerExpansion('"src"')).toEqual([]);
	});

	it("drops entries that are not non-empty folder path strings", () => {
		expect(parseExplorerExpansion('[ "src", "", 7, null, {}, "a/b" ]')).toEqual(
			["src", "a/b"],
		);
	});

	it("deduplicates repeated paths", () => {
		expect(parseExplorerExpansion('["src","src","src/pages"]')).toEqual([
			"src",
			"src/pages",
		]);
	});

	it("bounds how many preferences can be stored", () => {
		const many = Array.from(
			{ length: EXPLORER_EXPANSION_MAX_ENTRIES + 50 },
			(_, index) => `"folder-${index}"`,
		).join(",");
		expect(parseExplorerExpansion(`[${many}]`)).toHaveLength(
			EXPLORER_EXPANSION_MAX_ENTRIES,
		);
	});

	it("ignores paths that are not repository-relative folder paths", () => {
		expect(
			parseExplorerExpansion('["src","/etc/passwd","../outside","a/../../b"]'),
		).toEqual(["src"]);
	});
});

describe("serializeExplorerExpansion", () => {
	it("round-trips through the parser", () => {
		expect(
			parseExplorerExpansion(serializeExplorerExpansion(["a", "a/b"])),
		).toEqual(["a", "a/b"]);
	});

	it("serializes nothing expanded as an empty list", () => {
		expect(serializeExplorerExpansion([])).toBe("[]");
	});

	it("never emits a payload larger than the parser accepts", () => {
		const payload = serializeExplorerExpansion(
			Array.from(
				{ length: EXPLORER_EXPANSION_MAX_ENTRIES + 20 },
				(_, i) => `f${i}`,
			),
		);
		expect(parseExplorerExpansion(payload)).toHaveLength(
			EXPLORER_EXPANSION_MAX_ENTRIES,
		);
	});
});

describe("pruneExplorerExpansion", () => {
	it("drops folder paths the current tree no longer has", () => {
		expect(
			pruneExplorerExpansion(["src", "gone"], new Set(["src", "docs"])),
		).toEqual(["src"]);
	});

	it("keeps nested paths that still exist", () => {
		expect(
			pruneExplorerExpansion(
				["src", "src/pages"],
				new Set(["src", "src/pages"]),
			),
		).toEqual(["src", "src/pages"]);
	});

	it("returns nothing when the tree is empty", () => {
		expect(pruneExplorerExpansion(["src"], new Set())).toEqual([]);
	});

	it("deduplicates while pruning", () => {
		expect(pruneExplorerExpansion(["src", "src"], new Set(["src"]))).toEqual([
			"src",
		]);
	});
});
