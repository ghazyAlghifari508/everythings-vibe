import type { CrawlHeading, CrawlPageContent, CrawlSection } from "@/db/schema";
import {
	decodeHtmlEntities,
	extractPageTitle,
} from "@/features/scrape/services/html-document";
import {
	CRAWL_DESCRIPTION_MAX_CHARS,
	CRAWL_HEADING_MAX_CHARS,
	CRAWL_SECTION_TEXT_MAX_CHARS,
} from "@/features/scrape/types/scrape-constants";
import type { CrawlSettings } from "@/features/scrape/types/scrape-contract";
import { matchesCrawlUrl } from "@/features/scrape/utils/crawl-url-filter";
import { designErrorCodeForHttpStatus, ScrapeError } from "@/lib/design-errors";

export interface CrawledPage {
	url: string;
	parentUrl: string | null;
	depth: number;
	status: "completed" | "failed" | "skipped";
	title: string | null;
	httpStatus: number | null;
	content: CrawlPageContent | null;
	error: string | null;
	// Typed failure evidence for a failed page. Kept alongside the message so a
	// summary can be classified from codes and statuses instead of copy. Optional
	// because persisted rows are fed back in as the resume frontier.
	failureCode?: string | null;
}

export interface CrawlDependencies {
	signal?: AbortSignal;
	completed?: CrawledPage[];
	frontier?: { url: string; parentUrl: string | null; depth: number }[];
	onDiscovered?: (
		url: string,
		parentUrl: string,
		depth: number,
	) => Promise<void>;
	load: (
		url: string,
	) => Promise<{ html: string; status: number; finalUrl: string }>;
	robots: (origin: string) => Promise<string>;
	onPage?: (page: CrawledPage, discovered: number) => Promise<void>;
}

export function isCrawlScope(
	target: string,
	seed: string,
	subdomains: boolean,
): boolean {
	try {
		const url = new URL(target);
		const root = new URL(seed);
		return (
			["http:", "https:"].includes(url.protocol) &&
			!url.username &&
			!url.password &&
			url.port === root.port &&
			(url.hostname === root.hostname ||
				(subdomains && url.hostname.endsWith(`.${root.hostname}`)))
		);
	} catch {
		return false;
	}
}

export function robotsAllows(content: string, path: string): boolean {
	let applies = false;
	let inRules = false;
	const rules: { allow: boolean; value: string }[] = [];
	for (const raw of content.split(/\r?\n/)) {
		const line = raw.replace(/#.*$/, "").trim();
		const separator = line.indexOf(":");
		if (separator < 0) continue;
		const key = line.slice(0, separator).toLowerCase();
		const value = line.slice(separator + 1).trim();
		if (key === "user-agent") {
			if (inRules) {
				applies = false;
				inRules = false;
			}
			applies ||=
				value === "*" || /(vibeeverything|everythings-vibe)/i.test(value);
		} else if (key === "allow" || key === "disallow") {
			inRules = true;
			if (applies && value) rules.push({ allow: key === "allow", value });
		}
	}
	const matched = rules
		.filter(({ value }) => {
			const escaped = value
				.replace(/[.+?^${}()|[\]\\]/g, "\\$&")
				.replace(/\*/g, ".*")
				.replace(/\\\$$/, "$");
			return new RegExp(`^${escaped}`).test(path);
		})
		.sort(
			(a, b) =>
				b.value.length - a.value.length || Number(b.allow) - Number(a.allow),
		);
	return matched[0]?.allow ?? true;
}

function textOf(html: string): string {
	const stripped = html
		.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "")
		.replace(/<[^>]+>/g, " ");
	return decodeHtmlEntities(stripped).replace(/\s+/g, " ").trim();
}

function extractHeadings(body: string): CrawlHeading[] {
	const matches = [...body.matchAll(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h[1-6]>/gi)];
	return matches
		.map((match) => {
			const level = Number.parseInt(match[1], 10);
			const text = textOf(match[2]).slice(0, CRAWL_HEADING_MAX_CHARS);
			return { level, text };
		})
		.filter((row) => row.text.length > 0);
}

function extractSections(body: string): CrawlSection[] {
	const boundaries: { index: number; level: number; title: string }[] = [];
	for (const match of body.matchAll(
		/<h([1-6])\b[^>]*>([\s\S]*?)<\/h[1-6]>/gi,
	)) {
		const title = textOf(match[2]).slice(0, CRAWL_HEADING_MAX_CHARS).trim();
		if (!title) continue;
		const level = Number.parseInt(match[1], 10);
		const index = match.index ?? 0;
		boundaries.push({ index, level, title });
	}
	if (boundaries.length === 0) {
		const text = textOf(body).slice(0, CRAWL_SECTION_TEXT_MAX_CHARS);
		return text ? [{ title: null, level: null, text }] : [];
	}
	const sections: CrawlSection[] = [];
	for (let i = 0; i < boundaries.length; i++) {
		const current = boundaries[i];
		const next = boundaries[i + 1];
		const slice = body.slice(current.index, next ? next.index : body.length);
		const withoutHeading = slice.replace(
			/<h[1-6]\b[^>]*>[\s\S]*?<\/h[1-6]>/i,
			" ",
		);
		const text = textOf(withoutHeading).slice(0, CRAWL_SECTION_TEXT_MAX_CHARS);
		if (!text) continue;
		sections.push({ title: current.title, level: current.level, text });
	}
	return sections;
}

function extractDescription(html: string): string | null {
	const metaTags = [...html.matchAll(/<meta\b[^>]*>/gi)].map(
		(match) => match[0],
	);
	for (const tag of metaTags) {
		const attrs = [...tag.matchAll(/(\w+)\s*=\s*["']([^"']*)["']/gi)];
		const lower: Record<string, string> = {};
		for (const attr of attrs) lower[attr[1].toLowerCase()] = attr[2];
		const name = lower.name ?? lower.property ?? "";
		if (
			name.toLowerCase() === "description" ||
			name.toLowerCase() === "og:description"
		) {
			const raw = lower.content ?? "";
			const decoded = decodeHtmlEntities(raw).replace(/\s+/g, " ").trim();
			if (decoded) return decoded.slice(0, CRAWL_DESCRIPTION_MAX_CHARS);
		}
	}
	return null;
}

function extractMainBody(html: string, mainContentOnly: boolean): string {
	if (!mainContentOnly)
		return html.match(/<body\b[^>]*>([\s\S]*?)<\/body\s*>/i)?.[1] ?? html;
	const main =
		html.match(/<main\b[^>]*>([\s\S]*?)<\/main\s*>/i)?.[1] ??
		html.match(/<article\b[^>]*>([\s\S]*?)<\/article\s*>/i)?.[1] ??
		html.match(
			/<div\b[^>]*role=["']main["'][^>]*>([\s\S]*?)<\/div\s*>/i,
		)?.[1] ??
		html;
	return main.replace(/<(nav|footer|aside)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "");
}

function resources(html: string, attribute: string, base: string): string[] {
	const values = [
		...html.matchAll(
			new RegExp(`\\b${attribute}\\s*=\\s*["']([^"']+)["']`, "gi"),
		),
	];
	return [
		...new Set(
			values.flatMap((match) => {
				try {
					const decoded = decodeHtmlEntities(match[1]);
					const url = new URL(decoded, base);
					url.hash = "";
					return ["http:", "https:"].includes(url.protocol) ? [url.href] : [];
				} catch {
					return [];
				}
			}),
		),
	];
}

export async function crawlWebsite(
	seed: string,
	settings: CrawlSettings,
	deps: CrawlDependencies,
): Promise<CrawledPage[]> {
	const queue = [
		{ url: seed, parentUrl: null as string | null, depth: 0 },
		...(deps.frontier ?? [])
			.filter((page) => page.url !== seed)
			.sort((a, b) => a.depth - b.depth),
	];
	const seen = new Set(queue.map((page) => page.url));
	const pages: CrawledPage[] = [];
	const robots = new Map<string, string>();
	while (queue.length && pages.length < settings.maxPages) {
		deps.signal?.throwIfAborted();
		const next = queue.shift();
		if (!next) break;
		if (
			next.depth > settings.maxDepth ||
			!isCrawlScope(next.url, seed, settings.followSubdomains)
		)
			continue;
		let page: CrawledPage = {
			...next,
			status: "failed",
			title: null,
			httpStatus: null,
			content: null,
			error: null,
			failureCode: null,
		};
		try {
			const parsed = new URL(next.url);
			let rules = robots.get(parsed.origin);
			if (rules === undefined) {
				rules = await deps.robots(parsed.origin);
				robots.set(parsed.origin, rules);
			}
			if (!robotsAllows(rules, `${parsed.pathname}${parsed.search}`)) {
				page = {
					...page,
					status: "skipped",
					error: "Dibatasi robots.txt.",
					failureCode: "WEBSITE_ACCESS_DENIED",
				};
			} else {
				const previous = deps.completed?.find(
					(row) =>
						row.url === next.url && row.status === "completed" && row.content,
				);
				if (previous?.content) {
					page = previous;
					const observedLinks = [
						...new Set([
							...(previous.content.outgoingPages ?? previous.content.links),
							...(deps.completed ?? [])
								.filter((row) => row.parentUrl === next.url)
								.map((row) => row.url),
						]),
					];
					if (next.depth < settings.maxDepth)
						for (const url of observedLinks) {
							if (
								seen.size >= settings.maxPages ||
								seen.has(url) ||
								!isCrawlScope(url, seed, settings.followSubdomains) ||
								!(await matchesCrawlUrl(settings.urlRegex, url))
							)
								continue;
							seen.add(url);
							queue.push({ url, parentUrl: next.url, depth: next.depth + 1 });
							await deps.onDiscovered?.(url, next.url, next.depth + 1);
						}
					pages.push(page);
					await deps.onPage?.(page, seen.size);
					continue;
				}
				const captured = await deps.load(next.url);
				if (!isCrawlScope(captured.finalUrl, seed, settings.followSubdomains))
					throw new ScrapeError(
						"WEBSITE_BLOCKED",
						"Redirect di luar scope crawl.",
					);
				if (captured.status >= 400)
					throw new ScrapeError(
						designErrorCodeForHttpStatus(captured.status),
						`HTTP ${captured.status}`,
						{ httpStatus: captured.status },
					);
				const links = resources(
					[...captured.html.matchAll(/<a\b[^>]*>/gi)]
						.map((match) => match[0])
						.join(" "),
					"href",
					captured.finalUrl,
				);
				const body = extractMainBody(captured.html, settings.mainContentOnly);
				const headingLevels = extractHeadings(body);
				const outgoingPages = links.filter((url) =>
					isCrawlScope(url, seed, settings.followSubdomains),
				);
				const internalLinks = outgoingPages;
				const externalLinks = links.filter(
					(url) => !isCrawlScope(url, seed, settings.followSubdomains),
				);
				page = {
					...page,
					status: "completed",
					title: extractPageTitle(captured.html),
					httpStatus: captured.status,
					content: {
						outgoingPages,
						description: extractDescription(captured.html),
						headings: headingLevels.map((row) => row.text),
						text: textOf(body),
						links: settings.includeLinks ? links : [],
						images: settings.includeImages
							? resources(
									[...captured.html.matchAll(/<img\b[^>]*>/gi)]
										.map((match) => match[0])
										.join(" "),
									"src",
									captured.finalUrl,
								)
							: [],
						patterns: ["nav", "header", "footer", "form", "table"].filter(
							(tag) => new RegExp(`<${tag}\\b`, "i").test(captured.html),
						),
						headingLevels,
						sections: extractSections(body),
						internalLinks: settings.includeLinks ? internalLinks : [],
						externalLinks: settings.includeLinks ? externalLinks : [],
					},
				};
				if (next.depth < settings.maxDepth)
					for (const url of links) {
						if (
							seen.size >= settings.maxPages ||
							seen.has(url) ||
							!isCrawlScope(url, seed, settings.followSubdomains)
						)
							continue;
						if (!(await matchesCrawlUrl(settings.urlRegex, url))) continue;
						seen.add(url);
						queue.push({ url, parentUrl: next.url, depth: next.depth + 1 });
						await deps.onDiscovered?.(url, next.url, next.depth + 1);
					}
			}
		} catch (error) {
			deps.signal?.throwIfAborted();
			if (error instanceof Error && /URL Regex|Job lease/.test(error.message))
				throw error;
			page.error =
				error instanceof Error ? error.message : "Halaman gagal diambil.";
			// A typed ScrapeError carries the parsed status and code, so the
			// aggregate classification never has to read the message text.
			page.failureCode = error instanceof ScrapeError ? error.code : null;
			if (error instanceof ScrapeError && error.httpStatus !== undefined)
				page.httpStatus = error.httpStatus;
		}
		pages.push(page);
		await deps.onPage?.(page, seen.size);
	}
	return pages;
}
