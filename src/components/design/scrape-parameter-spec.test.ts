import { describe, expect, it } from "vitest";
import {
	crawlSettingsSchema,
	designSettingsSchema,
	htmlSettingsSchema,
	imagesSettingsSchema,
	SCRAPE_LIMITS,
} from "@/lib/scrape-contract";
import {
	ADVANCED_PARAMETER_GROUPS,
	readNumber,
	readToggle,
	validateNumericParameter,
	validateParameterGroup,
} from "./scrape-parameter-spec";

describe("advanced parameter grouping", () => {
	it("shows only the settings that belong to the active mode", () => {
		const selections = ADVANCED_PARAMETER_GROUPS.design.flatMap(
			(group) => group.selects ?? [],
		);
		expect(selections.map((selection) => selection.key).sort()).toEqual(
			Object.keys(designSettingsSchema.parse({})).sort(),
		);
		for (const selection of selections)
			for (const option of selection.options)
				expect(
					designSettingsSchema.safeParse({ [selection.key]: option.value })
						.success,
				).toBe(true);
		expect(ADVANCED_PARAMETER_GROUPS.crawl).toHaveLength(1);
		expect(ADVANCED_PARAMETER_GROUPS.html).toHaveLength(1);
		expect(ADVANCED_PARAMETER_GROUPS.images).toHaveLength(1);
	});

	it("groups every setting into a labelled section with a description", () => {
		for (const mode of ["crawl", "html", "images"] as const)
			for (const group of ADVANCED_PARAMETER_GROUPS[mode]) {
				expect(group.title.length).toBeGreaterThan(0);
				expect(group.description.length).toBeGreaterThan(0);
				expect(group.numbers.length + group.toggles.length).toBeGreaterThan(0);
			}
	});

	it("describes every setting with a plain label and a helpful hint", () => {
		for (const mode of ["crawl", "html", "images"] as const)
			for (const group of ADVANCED_PARAMETER_GROUPS[mode]) {
				for (const spec of group.numbers) {
					expect(spec.label).not.toMatch(
						/max pages|max depth|wait for|\(ms\)/i,
					);
					expect(spec.helper.length).toBeGreaterThan(10);
					expect(spec.unit.length).toBeGreaterThan(0);
				}
				for (const toggle of group.toggles) {
					expect(toggle.label.length).toBeGreaterThan(0);
					expect(toggle.helper.length).toBeGreaterThan(10);
				}
			}
	});

	it("keeps every spec key inside the backend settings contract", () => {
		const crawlKeys = new Set(Object.keys(crawlSettingsSchema.parse({})));
		const htmlKeys = new Set(Object.keys(htmlSettingsSchema.parse({})));
		const imagesKeys = new Set(Object.keys(imagesSettingsSchema.parse({})));
		const allowed: Record<string, Set<string>> = {
			crawl: crawlKeys,
			html: htmlKeys,
			images: imagesKeys,
		};
		for (const mode of ["crawl", "html", "images"] as const)
			for (const group of ADVANCED_PARAMETER_GROUPS[mode]) {
				for (const spec of group.numbers)
					expect(allowed[mode].has(spec.key)).toBe(true);
				for (const toggle of group.toggles)
					expect(allowed[mode].has(toggle.key)).toBe(true);
			}
	});

	it("mirrors the backend bounds instead of inventing its own", () => {
		const [crawlGroup] = ADVANCED_PARAMETER_GROUPS.crawl;
		const maxPages = crawlGroup?.numbers.find(
			(spec) => spec.key === "maxPages",
		);
		const maxDepth = crawlGroup?.numbers.find(
			(spec) => spec.key === "maxDepth",
		);
		expect(maxPages?.max).toBe(SCRAPE_LIMITS.maxPages);
		expect(maxDepth?.max).toBe(SCRAPE_LIMITS.maxDepth);
		const [htmlGroup] = ADVANCED_PARAMETER_GROUPS.html;
		expect(htmlGroup?.numbers[0]?.max).toBe(SCRAPE_LIMITS.waitMs);
	});
});

describe("settings accessors", () => {
	it("reads numbers from whichever settings object is active", () => {
		expect(readNumber(crawlSettingsSchema.parse({}), "maxPages")).toBe(10);
		expect(readNumber(crawlSettingsSchema.parse({}), "maxDepth")).toBe(2);
		expect(readNumber(htmlSettingsSchema.parse({}), "waitMs")).toBe(0);
		expect(readNumber(imagesSettingsSchema.parse({}), "waitMs")).toBe(0);
	});

	it("reads toggles from whichever settings object is active", () => {
		expect(readToggle(crawlSettingsSchema.parse({}), "mainContentOnly")).toBe(
			true,
		);
		expect(readToggle(crawlSettingsSchema.parse({}), "followSubdomains")).toBe(
			false,
		);
		expect(readToggle(htmlSettingsSchema.parse({}), "includeIframes")).toBe(
			false,
		);
		expect(
			readToggle(imagesSettingsSchema.parse({}), "measureResolution"),
		).toBe(true);
		expect(readToggle(imagesSettingsSchema.parse({}), "classifyType")).toBe(
			true,
		);
	});

	it("never returns another mode's value for an absent key", () => {
		// waitMs is absent from crawl settings; the reader must not fall through
		// to a different field.
		expect(readNumber(crawlSettingsSchema.parse({}), "waitMs")).toBe(0);
		expect(readToggle(htmlSettingsSchema.parse({}), "measureResolution")).toBe(
			false,
		);
	});
});

describe("numeric parameter validation", () => {
	const maxPages = ADVANCED_PARAMETER_GROUPS.crawl[0]?.numbers[0];
	if (!maxPages) throw new Error("crawl group fixture missing");

	it("rejects an empty or non-numeric input with an actionable message", () => {
		expect(validateNumericParameter(maxPages, Number.NaN)?.message).toMatch(
			/harus berupa angka/i,
		);
	});

	it("rejects a fractional value instead of silently truncating it", () => {
		expect(validateNumericParameter(maxPages, 2.5)?.message).toMatch(/bulat/i);
	});

	it("names the real bound when a value is out of range", () => {
		expect(validateNumericParameter(maxPages, 0)?.message).toContain("1");
		expect(validateNumericParameter(maxPages, 9999)?.message).toContain(
			String(SCRAPE_LIMITS.maxPages),
		);
	});

	it("accepts every value inside the contract range", () => {
		expect(validateNumericParameter(maxPages, maxPages.min)).toBeNull();
		expect(validateNumericParameter(maxPages, maxPages.max)).toBeNull();
		expect(
			validateNumericParameter(maxPages, Math.floor(maxPages.max / 2)),
		).toBeNull();
	});

	it("reports every invalid numeric field in the group, not just the first", () => {
		const group = ADVANCED_PARAMETER_GROUPS.crawl[0];
		if (!group) throw new Error("crawl group fixture missing");
		const issues = validateParameterGroup(group, {
			maxPages: Number.NaN,
			maxDepth: 99,
			urlRegex: "",
			mainContentOnly: true,
			followSubdomains: false,
			includeLinks: true,
			includeImages: true,
		});
		expect(issues).toHaveLength(2);
		expect(issues.map((issue) => issue.key).sort()).toEqual([
			"maxDepth",
			"maxPages",
		]);
	});

	it("accepts the backend defaults for every mode", () => {
		for (const mode of ["crawl", "html", "images"] as const) {
			const settings =
				mode === "crawl"
					? crawlSettingsSchema.parse({})
					: mode === "html"
						? htmlSettingsSchema.parse({})
						: imagesSettingsSchema.parse({});
			for (const group of ADVANCED_PARAMETER_GROUPS[mode])
				expect(validateParameterGroup(group, settings)).toEqual([]);
		}
	});
});

describe("reset semantics", () => {
	it("restores the backend defaults for each mode", () => {
		const crawl = crawlSettingsSchema.parse({});
		const html = htmlSettingsSchema.parse({});
		const images = imagesSettingsSchema.parse({});
		// Re-parsing the empty object is the reset operation the form performs.
		expect(crawlSettingsSchema.parse({})).toEqual(crawl);
		expect(htmlSettingsSchema.parse({})).toEqual(html);
		expect(imagesSettingsSchema.parse({})).toEqual(images);
		expect(crawl.maxPages).toBe(10);
		expect(crawl.mainContentOnly).toBe(true);
		expect(html.includeIframes).toBe(false);
		expect(images.measureResolution).toBe(true);
		expect(images.classifyType).toBe(true);
	});
});
