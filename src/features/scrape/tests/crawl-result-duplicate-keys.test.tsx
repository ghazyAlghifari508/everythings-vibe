// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CrawlHeading, CrawlSection, scrapePages } from "@/db/schema";
import {
	getHeadingKey,
	getItemKey,
	getSectionKey,
	PageDetail,
} from "../components/crawl-result-page-detail";

type Page = typeof scrapePages.$inferSelect;

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

function createPage(
	contentOverrides: Partial<NonNullable<Page["content"]>> = {},
): Page {
	return {
		id: "page-1",
		scrapeId: "scrape-1",
		userId: "user-1",
		url: "https://example.test/production",
		parentUrl: null,
		depth: 0,
		status: "completed",
		title: "Production Overview",
		httpStatus: 200,
		content: {
			description: "Production infrastructure overview",
			headings: [],
			text: "Body text",
			links: [],
			images: [],
			patterns: [],
			outgoingPages: [],
			...contentOverrides,
		},
		error: null,
	};
}

describe("Crawl result duplicate keys resolution (FIX 06)", () => {
	it("renders duplicate headings without key collision warning", () => {
		const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

		const duplicateHeadings: CrawlHeading[] = [
			{ level: 2, text: "Everything You Need for Production" },
			{ level: 2, text: "Everything You Need for Production" },
		];

		const page = createPage({
			headingLevels: duplicateHeadings,
		});

		render(<PageDetail page={page} />);

		const headings = screen.getAllByText("Everything You Need for Production");
		expect(headings).toHaveLength(2);

		const duplicateKeyWarning = consoleSpy.mock.calls.some((args) =>
			args.some(
				(arg) =>
					typeof arg === "string" &&
					arg.includes("Encountered two children with the same key"),
			),
		);
		expect(duplicateKeyWarning).toBe(false);
	});

	it("renders duplicate section titles and descriptions without key collision", () => {
		const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

		const duplicateSections: CrawlSection[] = [
			{
				title: "Everything You Need for Production",
				level: 2,
				text: "Built-in infrastructure services that scale with your application needs.",
			},
			{
				title: "Everything You Need for Production",
				level: 2,
				text: "Built-in infrastructure services that scale with your application needs.",
			},
		];

		const page = createPage({
			sections: duplicateSections,
		});

		render(<PageDetail page={page} />);

		const summaries = screen.getAllByText("Everything You Need for Production");
		expect(summaries).toHaveLength(2);

		const descriptions = screen.getAllByText(
			"Built-in infrastructure services that scale with your application needs.",
		);
		expect(descriptions).toHaveLength(2);

		const duplicateKeyWarning = consoleSpy.mock.calls.some((args) =>
			args.some(
				(arg) =>
					typeof arg === "string" &&
					arg.includes("Encountered two children with the same key"),
			),
		);
		expect(duplicateKeyWarning).toBe(false);
	});

	it("retained identity when items are reordered", () => {
		const headingA: CrawlHeading = {
			level: 2,
			text: "Everything You Need for Production",
		};
		const headingB: CrawlHeading = {
			level: 2,
			text: "Everything You Need for Production",
		};

		const map1 = new Map<string, number>();
		const keyA_original = getHeadingKey(headingA, map1);
		const keyB_original = getHeadingKey(headingB, map1);

		expect(keyA_original).not.toBe(keyB_original);

		// Reverse order in second pass
		const map2 = new Map<string, number>();
		const keyB_reordered = getHeadingKey(headingB, map2);
		const keyA_reordered = getHeadingKey(headingA, map2);

		expect(keyB_reordered).toBe(keyB_original);
		expect(keyA_reordered).toBe(keyA_original);
	});

	it("adding or removing an item does not corrupt sibling identities", () => {
		const headingA: CrawlHeading = { level: 2, text: "Alpha" };
		const headingB: CrawlHeading = { level: 2, text: "Beta" };

		const map1 = new Map<string, number>();
		const keyA = getHeadingKey(headingA, map1);
		const keyB = getHeadingKey(headingB, map1);

		// Prepend a new item at index 0
		const headingNew: CrawlHeading = { level: 1, text: "First Item" };
		const map2 = new Map<string, number>();
		const keyNew = getHeadingKey(headingNew, map2);
		const keyA_afterAdd = getHeadingKey(headingA, map2);
		const keyB_afterAdd = getHeadingKey(headingB, map2);

		expect(keyNew).toBe("1-First Item");
		expect(keyA_afterAdd).toBe(keyA);
		expect(keyB_afterAdd).toBe(keyB);

		// Remove first item
		const map3 = new Map<string, number>();
		const keyB_afterRemove = getHeadingKey(headingB, map3);
		expect(keyB_afterRemove).toBe(keyB);
	});

	it("unique keys remain stable across multiple evaluations", () => {
		const section: CrawlSection = {
			id: "custom-sec-id",
			title: "Custom Title",
			level: 2,
			text: "Content description",
		};

		const map = new Map<string, number>();
		const firstKey = getSectionKey(section, map);
		const secondKey = getSectionKey(section, map);

		expect(firstKey).toBe("custom-sec-id");
		expect(secondKey).toBe("custom-sec-id");
	});

	it("does not silently deduplicate existing UI content", () => {
		const page = createPage({
			headingLevels: [
				{ level: 2, text: "Everything You Need for Production" },
				{ level: 2, text: "Everything You Need for Production" },
				{ level: 3, text: "Sub-feature" },
				{ level: 3, text: "Sub-feature" },
			],
			sections: [
				{
					title: "Shared Section",
					level: 2,
					text: "Section copy one",
				},
				{
					title: "Shared Section",
					level: 2,
					text: "Section copy two",
				},
			],
		});

		render(<PageDetail page={page} />);

		expect(
			screen.getAllByText("Everything You Need for Production"),
		).toHaveLength(2);
		expect(screen.getAllByText("Sub-feature")).toHaveLength(2);
		expect(screen.getAllByText("Shared Section")).toHaveLength(2);
	});

	it("renders duplicate links and images without regression or key collisions", () => {
		const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

		const page = createPage({
			images: [
				"https://example.test/img/preview.png",
				"https://example.test/img/preview.png",
			],
			links: ["https://example.test/docs", "https://example.test/docs"],
			internalLinks: ["https://example.test/docs", "https://example.test/docs"],
		});

		render(<PageDetail page={page} />);

		const duplicateKeyWarning = consoleSpy.mock.calls.some((args) =>
			args.some(
				(arg) =>
					typeof arg === "string" &&
					arg.includes("Encountered two children with the same key"),
			),
		);
		expect(duplicateKeyWarning).toBe(false);

		// Verify string helper handles duplicates cleanly
		const seen = new Map<string, number>();
		expect(getItemKey("https://example.test/logo.png", seen)).toBe(
			"https://example.test/logo.png",
		);
		expect(getItemKey("https://example.test/logo.png", seen)).toBe(
			"https://example.test/logo.png-1",
		);
	});
});
