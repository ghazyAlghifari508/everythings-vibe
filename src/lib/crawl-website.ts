import type { CrawlPageContent } from "@/db/schema";
import { matchesCrawlUrl } from "./crawl-url-filter";
import { extractPageTitle } from "./fetch-html";
import type { CrawlSettings } from "./scrape-contract";

export interface CrawledPage {
	url: string;
	parentUrl: string | null;
	depth: number;
	status: "completed" | "failed" | "skipped";
	title: string | null;
	httpStatus: number | null;
	content: CrawlPageContent | null;
	error: string | null;
}

export interface CrawlDependencies {
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
			applies ||= value === "*" || /vibeeverything/i.test(value);
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
	return html
		.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "")
		.replace(/<[^>]+>/g, " ")
		.replace(/&nbsp;/g, " ")
		.replace(/&amp;/g, "&")
		.replace(/\s+/g, " ")
		.trim();
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
					const url = new URL(match[1].replace(/&amp;/g, "&"), base);
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
		};
		try {
			const parsed = new URL(next.url);
			let rules = robots.get(parsed.origin);
			if (rules === undefined) {
				rules = await deps.robots(parsed.origin);
				robots.set(parsed.origin, rules);
			}
			if (!robotsAllows(rules, `${parsed.pathname}${parsed.search}`)) {
				page = { ...page, status: "skipped", error: "Dibatasi robots.txt." };
			} else {
				const previous = deps.completed?.find(
					(row) =>
						row.url === next.url && row.status === "completed" && row.content,
				);
				if (previous?.content) {
					page = previous;
					const observedLinks = [
						...new Set([
							...previous.content.links,
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
					throw new Error("Redirect di luar scope crawl.");
				if (captured.status >= 400) throw new Error(`HTTP ${captured.status}`);
				const links = resources(
					[...captured.html.matchAll(/<a\b[^>]*>/gi)]
						.map((match) => match[0])
						.join(" "),
					"href",
					captured.finalUrl,
				);
				const body = settings.mainContentOnly
					? (
							captured.html.match(
								/<(?:main|article)\b[^>]*>([\s\S]*?)<\/(?:main|article)\s*>/i,
							)?.[1] ?? captured.html
						).replace(/<(nav|footer|aside)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "")
					: (captured.html.match(/<body\b[^>]*>([\s\S]*?)<\/body\s*>/i)?.[1] ??
						captured.html);
				page = {
					...page,
					status: "completed",
					title: extractPageTitle(captured.html),
					httpStatus: captured.status,
					content: {
						description:
							captured.html.match(
								/<meta\b[^>]*name=["']description["'][^>]*content=["']([^"']*)["']/i,
							)?.[1] ?? null,
						headings: [
							...body.matchAll(/<h[1-6]\b[^>]*>([\s\S]*?)<\/h[1-6]>/gi),
						].map((match) => textOf(match[1])),
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
			if (error instanceof Error && /URL Regex|Job lease/.test(error.message))
				throw error;
			page.error =
				error instanceof Error ? error.message : "Halaman gagal diambil.";
		}
		pages.push(page);
		await deps.onPage?.(page, seen.size);
	}
	return pages;
}
