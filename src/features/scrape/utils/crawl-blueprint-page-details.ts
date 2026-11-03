import type { CrawlPageContent, scrapePages } from "@/db/schema";
import { CRAWL_BLUEPRINT_LIST_MAX_ITEMS } from "@/features/scrape/types/scrape-constants";
import {
	type BlueprintHeading,
	cleanDecorativeDigitRuns,
	dedupeHeadings,
	describePage,
	sectionSentences,
} from "./crawl-blueprint-content";

type Page = typeof scrapePages.$inferSelect;

/** Cleanup counters collected while rendering the readable page sections. */
export interface PageDetailCleanup {
	removedHeadingDuplicates: number;
	removedDecorativeRuns: number;
}

function escapeCell(value: string): string {
	return value.replace(/\|/g, "\\|").replace(/\r?\n/g, " ").trim();
}

function inline(value: string): string {
	return value.replace(/\r?\n/g, " ").trim();
}

function headingRows(content: CrawlPageContent): BlueprintHeading[] {
	return (
		content.headingLevels ??
		content.headings.map((text) => ({ level: null, text }))
	);
}

function bounded(
	items: string[],
	max = CRAWL_BLUEPRINT_LIST_MAX_ITEMS,
): string[] {
	return items.slice(0, max);
}

function fullPageLabel(row: Page): string {
	return row.title?.trim() ? row.title.trim() : row.url;
}

/**
 * Renders the readable Page Details block for one page.
 *
 * Every line comes from persisted crawl data. Headings keep their original
 * level, sections are split into sentences once they grow long, and decorative
 * digit runs are dropped with the count reported back for the coverage section.
 */
export function renderPageDetails(
	row: Page,
	crawledUrls: Set<string>,
	cleanup: PageDetailCleanup,
): string[] {
	const lines: string[] = [];
	lines.push(`### Page: ${escapeCell(fullPageLabel(row))}`);
	lines.push("");
	lines.push(`- URL: ${row.url}`);
	lines.push(`- Status: ${row.status}`);
	if (row.httpStatus !== null) lines.push(`- HTTP: ${row.httpStatus}`);
	lines.push(`- Parent: ${row.parentUrl ?? "Halaman awal"}`);
	lines.push(`- Depth: ${row.depth}`);
	if (row.error) lines.push(`- Error: ${inline(row.error)}`);

	const content = row.content;
	if (!content) {
		lines.push("- Konten: tidak tersedia untuk status ini.");
		lines.push("");
		return lines;
	}

	const description = describePage(content);
	lines.push(
		description
			? `- Description (${description.source === "meta" ? "meta description" : "diturunkan dari konten"}): ${escapeCell(description.text)}`
			: "- Description: tidak tersedia",
	);

	const { headings, removedDuplicates } = dedupeHeadings(headingRows(content));
	cleanup.removedHeadingDuplicates += removedDuplicates;
	if (headings.length === 0) {
		lines.push("- Headings: tidak ada heading teramati.");
	} else {
		const shallowest = Math.min(
			...headings.map((heading) =>
				typeof heading.level === "number" ? heading.level : 1,
			),
		);
		lines.push("- Headings:");
		for (const heading of headings) {
			const level =
				typeof heading.level === "number" ? heading.level : shallowest;
			const indent = "  ".repeat(Math.max(0, level - shallowest));
			lines.push(`${indent}- H${level}: ${escapeCell(heading.text)}`);
		}
	}

	const sections = content.sections ?? [];
	if (sections.length > 0) {
		lines.push("- Content sections:");
		for (const section of sections) {
			const title = section.title ? escapeCell(section.title) : "(Tanpa judul)";
			const level = section.level === null ? "" : ` H${section.level}`;
			const cleaned = cleanDecorativeDigitRuns(section.text);
			cleanup.removedDecorativeRuns += cleaned.removedRuns;
			const sentences = sectionSentences(section.text);
			lines.push(`  - ${title}${level}`);
			for (const sentence of sentences)
				lines.push(`    - ${escapeCell(sentence)}`);
		}
	} else if (content.text) {
		const cleaned = cleanDecorativeDigitRuns(content.text);
		cleanup.removedDecorativeRuns += cleaned.removedRuns;
		lines.push("- Content sections:");
		for (const sentence of sectionSentences(content.text))
			lines.push(`  - ${escapeCell(sentence)}`);
	} else {
		lines.push("- Content sections: tidak ada teks teramati.");
	}

	const internal = content.internalLinks ?? content.links;
	const external = content.externalLinks ?? [];
	const crawled = internal.filter((url) => crawledUrls.has(url));
	lines.push(`- Relevant links:`);
	lines.push(`  - Halaman dalam crawl (${crawled.length})`);
	for (const url of bounded(crawled)) lines.push(`    - ${url}`);
	lines.push(`  - Eksternal (${external.length})`);
	for (const url of bounded(external)) lines.push(`    - ${url}`);

	if (content.images.length > 0) {
		lines.push(`- Assets:`);
		lines.push(`  - Images (${content.images.length})`);
		for (const image of bounded(content.images)) lines.push(`    - ${image}`);
	} else {
		lines.push("- Assets: tidak ada gambar teramati.");
	}

	lines.push(
		`- Observed HTML elements: ${
			content.patterns.length > 0
				? escapeCell(content.patterns.join(", "))
				: "tidak ada"
		}`,
	);
	lines.push("");
	return lines;
}
