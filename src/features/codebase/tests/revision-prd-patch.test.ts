import { describe, expect, it } from "vitest";
import { parseRevisionPrdPatch } from "../services/revision-prd-patch";

const base =
	"<!-- SECTION: Overview -->\nOriginal\n<!-- /SECTION -->\n<!-- SECTION: Requirements -->\nKeep\n<!-- /SECTION -->";

describe("PRD proposal patch validation", () => {
	it("applies a complete patch without changing another section", () => {
		const result = parseRevisionPrdPatch(
			base,
			":::UPDATE_SECTION[Overview]:::\nUpdated\n:::END_UPDATE:::",
		);
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.content).toContain("Updated");
			expect(result.content).toContain(
				"<!-- SECTION: Requirements -->\nKeep\n<!-- /SECTION -->",
			);
		}
	});
	it("rejects a patch that claims an unchanged section alongside a changed one", () => {
		const response =
			":::UPDATE_SECTION[Overview]:::\nUpdated\n:::END_UPDATE:::\n:::UPDATE_SECTION[Requirements]:::\nKeep\n:::END_UPDATE:::";
		expect(parseRevisionPrdPatch(base, response).ok).toBe(false);
	});
	it("rejects a section without a close boundary before another section", () => {
		const malformed =
			"<!-- SECTION: Design & Technical Constraints -->\nOriginal\n<!-- SECTION: Requirements -->\nKeep\n<!-- /SECTION -->";
		expect(
			parseRevisionPrdPatch(
				malformed,
				":::UPDATE_SECTION[Design & Technical Constraints]:::\nUpdated\n:::END_UPDATE:::",
			).ok,
		).toBe(false);
	});
	it("rejects injected section boundaries inside a patch", () => {
		const response =
			":::UPDATE_SECTION[Overview]:::\nNew\n<!-- SECTION: Requirements -->\nChanged\n<!-- /SECTION -->\n:::END_UPDATE:::";
		expect(parseRevisionPrdPatch(base, response).ok).toBe(false);
	});
	it("rejects ambiguous duplicate section markers", () => {
		const ambiguous = `${base}\n<!-- SECTION: Overview -->\nSecond\n<!-- /SECTION -->`;
		expect(
			parseRevisionPrdPatch(
				ambiguous,
				":::UPDATE_SECTION[Overview]:::\nUpdated\n:::END_UPDATE:::",
			).ok,
		).toBe(false);
	});
	it.each([
		"unstructured response",
		":::UPDATE_SECTION[Overview]:::\nIncomplete",
		":::UPDATE_SECTION[Unknown]:::\nUpdated\n:::END_UPDATE:::",
		":::UPDATE_SECTION[Overview]:::\nOriginal\n:::END_UPDATE:::",
		":::UPDATE_SECTION[Overview]:::\nUpdated\n:::END_UPDATE:::\n:::UPDATE_SECTION[Unknown]:::\nX\n:::END_UPDATE:::",
		":::UPDATE_SECTION[Overview]:::\nUpdated\n:::END_UPDATE:::\n:::UPDATE_SECTION[Overview]:::\nAgain\n:::END_UPDATE:::",
	])("rejects malformed, unknown, duplicate or unchanged patches", (response) => {
		expect(parseRevisionPrdPatch(base, response).ok).toBe(false);
	});
});
