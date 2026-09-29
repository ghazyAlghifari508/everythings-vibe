import { describe, expect, it } from "vitest";
import { extractTechStackSection } from "./grounding";

const FULL_PRD = [
	"<!-- SECTION: Overview -->",
	"## 1. Overview",
	"React is mentioned here in prose but is not the declared stack.",
	"<!-- /SECTION -->",
	"",
	"<!-- SECTION: Architecture & Tech Stack -->",
	"## 6. Architecture & Tech Stack",
	"### 6.1 High-Level Architecture",
	"Diagram with Vue.js prose mention.",
	"### 6.2 Tech Stack",
	"| Layer | Technology |",
	"| --- | --- |",
	"| Frontend | Next.js |",
	"| Backend | Fastify |",
	"### 6.3 Struktur Folder",
	"tree here",
	"<!-- /SECTION -->",
	"",
	"<!-- SECTION: Database Schema -->",
	"PostgreSQL mentioned again in prose.",
	"<!-- /SECTION -->",
].join("\n");

describe("extractTechStackSection", () => {
	it("narrows a full PRD to section 6.2 via section markers", () => {
		const out = extractTechStackSection(FULL_PRD);
		expect(out).toContain("### 6.2");
		expect(out).toContain("Next.js");
		expect(out).not.toContain("### 6.1");
		expect(out).not.toContain("### 6.3");
	});

	it("falls back to the full text for legacy PRDs without section structure", () => {
		const legacy = "Plain PRD text mentioning Next.js with no headings.";
		expect(extractTechStackSection(legacy)).toBe(legacy);
	});

	it("returns the PRD when the 6.2 sub-heading is absent", () => {
		const noSub = [
			"## 6. Architecture & Tech Stack",
			"Just architecture prose, no stack table.",
			"## 7. Database Schema",
		].join("\n");
		const out = extractTechStackSection(noSub);
		expect(out).toContain("Architecture & Tech Stack");
		expect(out).not.toContain("## 7.");
	});

	it("returns empty string for empty input", () => {
		expect(extractTechStackSection("")).toBe("");
		expect(extractTechStackSection("   ")).toBe("");
	});
});
