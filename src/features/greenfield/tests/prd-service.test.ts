import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
	assertCompletePrdOutput,
	countPrdSectionMarkers,
	generateShareToken,
} from "@/features/greenfield/services/prd-service";

describe("generateShareToken", () => {
	it("returns a 12 character string", () => {
		const token = generateShareToken();
		expect(token).toHaveLength(12);
	});

	it("generates unique tokens", () => {
		const tokens = new Set(
			Array.from({ length: 100 }, () => generateShareToken()),
		);
		expect(tokens.size).toBe(100);
	});
});

describe("countPrdSectionMarkers", () => {
	it("counts unique section markers", () => {
		const content = [
			"<!-- SECTION: Overview -->",
			"<!-- SECTION: Goals -->",
			"<!-- SECTION: Goals -->",
		].join("\n");
		expect(countPrdSectionMarkers(content)).toBe(2);
	});
});

describe("assertCompletePrdOutput", () => {
	function eightSections(): string {
		return Array.from(
			{ length: 8 },
			(_, index) => `<!-- SECTION: Section ${index + 1} -->`,
		).join("\n");
	}

	it("accepts a document carrying all eight unique sections", () => {
		expect(() => assertCompletePrdOutput(eightSections())).not.toThrow();
	});

	it("rejects a truncated document with fewer than eight sections", () => {
		const truncated = eightSections().split("\n").slice(0, 4).join("\n");
		expect(() => assertCompletePrdOutput(truncated)).toThrow(/8 section/i);
	});

	it("accepts empty content so the caller can decide", () => {
		expect(() => assertCompletePrdOutput("")).not.toThrow();
	});
});

describe("savePrdVersion contract", () => {
	it("validates output and serializes version allocation before touching the share token", async () => {
		const source = await readFile(
			new URL("../services/prd-service.ts", import.meta.url),
			"utf8",
		);
		const validationIndex = source.indexOf(
			"assertCompletePrdOutput(cleanContent)",
		);
		const transactionIndex = source.indexOf('.for("update")');
		const shareTokenIndex = source.indexOf("projectUpdate.shareToken");
		const retryIndex = source.indexOf("23505");

		expect(validationIndex).toBeGreaterThan(-1);
		expect(transactionIndex).toBeGreaterThan(validationIndex);
		expect(shareTokenIndex).toBeGreaterThan(transactionIndex);
		// The message-string retry heuristic is gone: allocation is serialized
		// by the project row lock instead.
		expect(retryIndex).toBe(-1);
	});

	it("appends a new version on revision and never overwrites the previous one", async () => {
		const source = await readFile(
			new URL("../services/prd-service.ts", import.meta.url),
			"utf8",
		);
		// The only write to prd_versions is an insert; there is no update or
		// delete of a stored version anywhere in the module.
		expect(source).toMatch(/tx\s*\.insert\(prdVersions\)/);
		expect(source).not.toMatch(/update\(prdVersions\)/);
		expect(source).not.toMatch(/delete\(prdVersions\)/);
		// A revision allocates the next version after the stored maximum, so the
		// previous version stays readable at its own number.
		expect(source).toMatch(/nextVersion\s*=\s*latest\.version\s*\+\s*1/);
		expect(source).toMatch(/orderBy\(desc\(prdVersions\.version\)\)/);
	});

	it("allocates the row lock before reading the latest version", async () => {
		const source = await readFile(
			new URL("../services/prd-service.ts", import.meta.url),
			"utf8",
		);
		// Two concurrent revisions must not both read the same maximum and then
		// collide on the unique (project_id, version) index.
		const lockIndex = source.indexOf('.for("update")');
		const latestReadIndex = source.indexOf(
			"orderBy(desc(prdVersions.version))",
		);
		expect(lockIndex).toBeGreaterThan(-1);
		expect(latestReadIndex).toBeGreaterThan(lockIndex);
	});
});

describe("feature generation retry safety", () => {
	it("returns a completed tree as-is instead of generating a duplicate", async () => {
		const source = await readFile(
			new URL("../../../routes/api/features/generate.ts", import.meta.url),
			"utf8",
		);
		// A retry after success must not burn another model call or overwrite the
		// stored tree with a second generation.
		expect(source).toMatch(
			/featuresStatus === "completed"[\s\S]*?featureTreeSchema\.safeParse[\s\S]*?cached: true/,
		);
	});

	it("rejects a concurrent generation with a conflict instead of racing it", async () => {
		const source = await readFile(
			new URL("../../../routes/api/features/generate.ts", import.meta.url),
			"utf8",
		);
		// The claim is a conditional update, so exactly one request owns the run
		// and every other caller is told to wait rather than starting a second.
		expect(source).toMatch(/set\(\{ featuresStatus: "generating" \}\)/);
		expect(source).toMatch(/ne\(projects\.featuresStatus, "generating"\)/);
		expect(source).toContain("409");
	});

	it("releases the claim only while it still owns it", async () => {
		const source = await readFile(
			new URL("../../../routes/api/features/generate.ts", import.meta.url),
			"utf8",
		);
		// A stale failure path must not clear a newer run's claim.
		expect(source).toMatch(
			/current\?\.featuresStatus === "generating"[\s\S]*?set\(\{ featuresStatus: "pending" \}\)/,
		);
	});
});
