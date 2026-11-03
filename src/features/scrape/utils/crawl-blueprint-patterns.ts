import type { scrapePages } from "@/db/schema";

type Page = typeof scrapePages.$inferSelect;

/** HTML tags that the crawler records as present on a page. */
const SHARED_ELEMENT_TAGS = ["nav", "header", "footer"] as const;

export type SharedElementTag = (typeof SHARED_ELEMENT_TAGS)[number];

/**
 * Pages that share one heading skeleton.
 *
 * The signature is the sequence of heading levels only, so pages that keep the
 * same outline group together even when their wording differs. Whether the
 * heading texts also match is reported separately, because identical wording is
 * stronger evidence of a shared template than an identical skeleton.
 */
export interface PageTemplatePattern {
	signature: string;
	pages: string[];
	identicalHeadingText: boolean;
}

export interface SharedElementEvidence {
	tag: SharedElementTag;
	/** URLs of the pages whose HTML contained the tag. */
	pages: string[];
}

function headingSignature(levels: number[]): string {
	return levels.length > 0
		? levels.map((level) => `h${level}`).join(" > ")
		: "";
}

/**
 * Groups pages by heading skeleton.
 *
 * A group is only reported when at least two pages share it: one page cannot
 * establish a repeated template. No template is invented for pages whose
 * headings were not captured.
 */
export function derivePagePatterns(pages: Page[]): PageTemplatePattern[] {
	const rows = pages
		.filter((row) => row.status === "completed" && row.content !== null)
		.filter((row) => (row.content?.headingLevels ?? []).length > 0);
	const groups = new Map<string, Page[]>();
	for (const row of rows) {
		const levels = (row.content?.headingLevels ?? []).map(
			(heading) => heading.level,
		);
		const signature = headingSignature(levels);
		const group = groups.get(signature);
		if (group) group.push(row);
		else groups.set(signature, [row]);
	}

	const patterns: PageTemplatePattern[] = [];
	for (const [signature, group] of groups) {
		if (group.length < 2) continue;
		const outlines = group.map((row) =>
			(row.content?.headingLevels ?? [])
				.map((heading) => heading.text.trim().toLowerCase())
				.join("|"),
		);
		patterns.push({
			signature,
			pages: group.map((row) => row.url).sort(),
			identicalHeadingText: outlines.every(
				(outline) => outline === outlines[0],
			),
		});
	}
	return patterns.sort(
		(a, b) =>
			a.signature.localeCompare(b.signature) ||
			a.pages[0].localeCompare(b.pages[0]),
	);
}

/**
 * Reports the HTML tags observed on more than one page.
 *
 * The crawler records tag presence, not which links or content sit inside the
 * element, so the result is stated as observed tags rather than as a navigation
 * or footer specification.
 */
export function deriveSharedElements(pages: Page[]): SharedElementEvidence[] {
	const rows = pages.filter(
		(row) => row.status === "completed" && row.content !== null,
	);
	const evidence: SharedElementEvidence[] = [];
	for (const tag of SHARED_ELEMENT_TAGS) {
		const observed = rows.filter((row) =>
			(row.content?.patterns ?? []).includes(tag),
		);
		if (observed.length < 2) continue;
		evidence.push({
			tag,
			pages: observed.map((row) => row.url).sort(),
		});
	}
	return evidence;
}
