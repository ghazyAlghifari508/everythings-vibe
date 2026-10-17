import { describe, expect, it } from "vitest";
import {
	ALL_PRD_SECTIONS,
	cleanChatBubble,
	extractSections,
	livePatchPrd,
} from "@/features/greenfield/components/chat/chat-revision";

describe("chat-revision", () => {
	describe("cleanChatBubble", () => {
		it("returns empty string when content is empty or only patch markers", () => {
			expect(cleanChatBubble("")).toBe("");
			expect(
				cleanChatBubble(
					":::UPDATE_SECTION[Overview]:::\nNew content\n:::END_UPDATE:::",
				),
			).toBe("");
		});

		it("preserves conversational prose while stripping update section blocks", () => {
			const stream =
				"Saya sudah memperbarui bagian overview dan requirements.\n\n:::UPDATE_SECTION[Overview]:::\n# Overview Updated\n:::END_UPDATE:::\n\nSilakan dicek kembali.";
			expect(cleanChatBubble(stream)).toBe(
				"Saya sudah memperbarui bagian overview dan requirements.\n\n\n\nSilakan dicek kembali.",
			);
		});

		it("handles stream ending with an unclosed update section block", () => {
			const stream =
				"Pembaruan sedang diterapkan:\n:::UPDATE_SECTION[Core Features]:::\nFeature 1";
			expect(cleanChatBubble(stream)).toBe("Pembaruan sedang diterapkan:");
		});
	});

	describe("livePatchPrd", () => {
		it("returns streamContent if baseContent is empty", () => {
			expect(livePatchPrd("", "raw content")).toBe("raw content");
		});

		it("patches strictly with closing tags", () => {
			const base =
				"<!-- SECTION: Overview -->\nOld Overview\n<!-- /SECTION -->\n<!-- SECTION: Requirements -->\nOld Req\n<!-- /SECTION -->";
			const stream =
				":::UPDATE_SECTION[Overview]:::\nNew Overview Text\n:::END_UPDATE:::";
			const result = livePatchPrd(base, stream);
			expect(result).toBe(
				"<!-- SECTION: Overview -->\nNew Overview Text\n<!-- /SECTION -->\n<!-- SECTION: Requirements -->\nOld Req\n<!-- /SECTION -->",
			);
		});

		it("patches leniently when closing tags are missing", () => {
			const base =
				"<!-- SECTION: Overview -->\nOld Overview\n\n<!-- SECTION: Goals & Success Metrics -->\nOld Goals";
			const stream =
				":::UPDATE_SECTION[Overview]:::\nNew Overview Lenient\n:::END_UPDATE:::";
			const result = livePatchPrd(base, stream);
			expect(result).toContain("<!-- SECTION: Overview -->");
			expect(result).toContain("New Overview Lenient");
			expect(result).toContain("<!-- SECTION: Goals & Success Metrics -->");
			expect(result).toContain("Old Goals");
		});

		it("strips duplicate section markers embedded in patch body", () => {
			const base = "<!-- SECTION: Overview -->\nOld\n<!-- /SECTION -->";
			const stream =
				":::UPDATE_SECTION[Overview]:::\n<!-- SECTION: Overview -->\nInner Clean\n<!-- /SECTION -->\n:::END_UPDATE:::";
			const result = livePatchPrd(base, stream);
			expect(result).toBe(
				"<!-- SECTION: Overview -->\nInner Clean\n<!-- /SECTION -->",
			);
		});
	});

	describe("extractSections", () => {
		it("extracts sections from comment markers", () => {
			const content =
				"<!-- SECTION: Overview -->\nDoc body\n<!-- SECTION: User Flow -->\nFlow body";
			const sections = extractSections(content);
			expect(sections).toEqual(["Overview", "User Flow"]);
		});

		it("extracts sections from markdown headings when markers are missing", () => {
			const content =
				"# PRD Document\n## 1. Overview\nText\n### 2. Goals & Success Metrics\nText\n## 3. Unknown Section";
			const sections = extractSections(content);
			expect(sections).toEqual(["Overview", "Goals & Success Metrics"]);
		});

		it("deduplicates sections", () => {
			const content = "<!-- SECTION: Overview -->\n<!-- SECTION: Overview -->";
			const sections = extractSections(content);
			expect(sections).toEqual(["Overview"]);
		});

		it("has all 8 standard sections", () => {
			expect(ALL_PRD_SECTIONS).toHaveLength(8);
		});
	});
});
